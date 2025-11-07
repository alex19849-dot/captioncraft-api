import { Redis } from "@upstash/redis";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import OpenAI from "openai";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

type StyleKey = "short" | "medium" | "long";

const TARGETS: Record<StyleKey, { min: number; max: number; hashtagMin: number; hashtagMax: number }> = {
  short:  { min: 60,  max: 120, hashtagMin: 5,  hashtagMax: 8  },   // hooks/snipes
  medium: { min: 120, max: 300, hashtagMin: 6,  hashtagMax: 10 },   // standard caption
  long:   { min: 500, max: 900, hashtagMin: 8,  hashtagMax: 12 },   // story paragraph
};

function coerceStyle(v: unknown): StyleKey {
  return (v === "short" || v === "medium" || v === "long") ? v : "medium";
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "POST") return res.status(405).send("POST only");

    // Vercel usually parses JSON body, but guard for raw body just in case
    const body = (req.body && typeof req.body === "object")
      ? req.body as any
      : (() => {
          try { return JSON.parse((req as any).rawBody || "{}"); } catch { return {}; }
        })();

    const desc  = (body.desc ?? "").toString().trim();
    const tone  = (body.tone ?? "British witty").toString().trim();
    const email = (body.email ?? "").toString().trim();
    const style = coerceStyle(body.style);

    if (!desc || !tone) {
      return res.status(400).json({ error: "desc + tone required" });
    }

    // Pro status check (non-blocking if Redis hiccups)
    let isPro = false;
    if (email) {
      try {
        const exists = await redis.sismember("pro_users", email);
        // Upstash can return 1/0 or true/false depending on SDK version
        isPro = (exists === 1) || (exists === true) || (exists === "1");
      } catch (e) {
        console.error("Redis error:", e);
      }
    }

    const t = TARGETS[style];

    // System + user prompts tuned for Urban Creator Street Smart, PG-13, with SEO hashtags (global English)
    const systemPrompt = `
You are PostPoet, writing Urban Creator Street Smart social captions.
Principles: confident, clean, premium, culturally aware. PG-13 only. No explicit sexual content.
Write ${style} captions in "${tone}" tone for the given description.
Target length: between ${t.min} and ${t.max} characters per caption (natural, not robotic padding).
Each caption must be a single paragraph, no numbering, no quote marks. Avoid emojis unless the tone clearly justifies them.
Append a block of global-English, SEO-relevant hashtags that match the description and caption (no generic spam like #love or #instagood unless truly relevant).
Use between ${t.hashtagMin} and ${t.hashtagMax} hashtags. Keep them topical and specific (niche+head mix).
Return exactly 5 distinct captions. Each caption should include its own hashtags at the end.
`.trim();

    const userPrompt = `Description:\n${desc}\n\nWrite 5 distinct captions now.`;

    // Higher max_tokens to comfortably allow "long" story mode
    const completion = await client.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.85,
      max_tokens: 900,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userPrompt }
      ],
    });

    const rawText = completion.choices?.[0]?.message?.content || "";

    // Split robustly into up to 5 captions
    // - split on blank lines OR newlines
    // - strip leading numbering/bullets/quotes
    // - de-dupe
    const pieces = rawText
      .split(/\n{2,}|\r{2,}/g)          // prefer blank-line separation first
      .flatMap(p => p.split(/\n+/g))     // then fall back to single newlines
      .map(s => s.replace(/^\s*[\d]+[)\.\-\]]\s*/, "")) // remove "1) " or "1. "
      .map(s => s.replace(/^[-–•]\s*/, ""))            // remove bullets
      .map(s => s.replace(/^"|"$/g, ""))               // drop wrapping quotes
      .map(s => s.trim())
      .filter(Boolean);

    // Build the final list with de-dup and light length sanity (but no hard cap)
    const seen = new Set<string>();
    const captions: string[] = [];
    for (const p of pieces) {
      const norm = p.replace(/\s+/g, " ");
      if (!seen.has(norm.toLowerCase())) {
        seen.add(norm.toLowerCase());
        captions.push(norm);
      }
      if (captions.length >= 5) break;
    }

    // If the model returned fewer than 5, pad by splitting on "—" or "•" or semicolons as a fallback
    if (captions.length < 5) {
      const fallbackChunks = rawText.split(/[—•;]+/g).map(s => s.trim()).filter(Boolean);
      for (const f of fallbackChunks) {
        if (captions.length >= 5) break;
        const norm = f.replace(/\s+/g, " ");
        if (!seen.has(norm.toLowerCase())) {
          seen.add(norm.toLowerCase());
          captions.push(norm);
        }
      }
    }

    // Final safety: trim any single caption that accidentally blew out > 1400 chars (shouldn't, but guardrails)
    const safe = captions.slice(0, 5).map(c => (c.length > 1400 ? c.slice(0, 1400) : c));

    return res.status(200).json({ captions: safe, pro: isPro, style });
  } catch (e: any) {
    console.error("generate error:", e);
    return res.status(500).json({ error: e?.message || "Server error" });
  }
}
