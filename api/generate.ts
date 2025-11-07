import { Redis } from "@upstash/redis";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import OpenAI from "openai";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

type StyleKey = "short" | "medium" | "long";

const TARGETS: Record<
  StyleKey,
  { min: number; max: number; hashtagMin: number; hashtagMax: number }
> = {
  short:  { min: 60,  max: 120, hashtagMin: 5,  hashtagMax: 8 },
  medium: { min: 150, max: 250, hashtagMin: 6,  hashtagMax: 10 },
  long:   { min: 350, max: 600, hashtagMin: 8,  hashtagMax: 12 },
};

function coerceStyle(v: unknown): StyleKey {
  return v === "short" || v === "medium" || v === "long" ? v : "medium";
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "POST") return res.status(405).send("POST only");

    // Vercel usually parses JSON body, but guard if not
    const body =
      req.body && typeof req.body === "object"
        ? (req.body as any)
        : (() => {
            try {
              return JSON.parse((req as any).rawBody || "{}");
            } catch {
              return {};
            }
          })();

    const desc  = (body.desc ?? "").toString().trim();
    const tone  = (body.tone ?? "British witty").toString().trim();
    const email = (body.email ?? "").toString().trim();
    const style = coerceStyle(body.style);

    if (!desc || !tone) {
      return res.status(400).json({ error: "desc + tone required" });
    }

    // Pro status check (non blocking if Redis hiccups)
    let isPro = false;
    if (email) {
      try {
        const exists = await redis.sismember("pro_users", email);
        isPro = exists === 1 || exists === true || exists === "1";
      } catch (e) {
        console.error("Redis error:", e);
      }
    }

    const t = TARGETS[style] || TARGETS.medium;

   const basePrompt = `
You are PostPoet, writing Urban Creator Street Smart social captions.
Principles: confident, clean, premium, culturally aware. PG-13 only. No explicit sexual content.
Write ${style} captions in "${tone}" tone for the given description.
Target length: between ${t.min} and ${t.max} characters per caption, natural not padded.
Each caption must be one paragraph, no numbering, no quote marks. Avoid emojis unless the tone clearly justifies them.
Append a block of global English, SEO relevant hashtags that match the description and caption. No generic spam like #love or #instagood unless truly relevant.
Use between ${t.hashtagMin} and ${t.hashtagMax} hashtags. Keep them topical and specific, mix niche + head terms.
Return exactly 5 distinct captions. Each caption includes its own hashtags at the end.
Hashtags must be in the same paragraph, not separated on their own line.
Do NOT wrap hooks or any sentences in quotation marks. Do not start or end the caption with quotes.
`.trim();

let productAddOn = "";
if (tone.toLowerCase() === "product selling direct") {
  productAddOn = `
For THIS tone ONLY: lean into conversion, speak value, benefit, emotional desire, cultural flex, without sounding desperate or pushy. Keep it PG-13. Light permission based CTA allowed like "tap to see more", "worth a closer look", "this one is special". Not aggressive sales language, no hard sell.
Long (story mode) should still lead toward the CTA outcome and not drift into pure aesthetic editorial.
Focus more on how the product transforms the user's lived experience, not just listing features or price.
`.trim();
}
let lifestyleAddOn = "";
const lifestyleTones = [
  "british witty",
  "american bold",
  "australian laid-back",
  "flirty",
  "sarcastic",
  "luxury",
  "motivational",
  "empathetic supportive",
  "melancholic reflective",
  "dark humour",
  "savage roast"
];

if (lifestyleTones.includes(tone.toLowerCase())) {
  lifestyleAddOn = `
First sentence should be a memeable, quotable hook or punchline style opener. It should read like something screenshot-worthy, instantly shareable, and culturally *repeatable*. Still PG-13. Still no hard sales CTA. Just a high-impact, viral hook as the opener.
Hooks should not start or end with quotes or quote marks.
  `.trim();
}

const systemPrompt = [basePrompt, productAddOn, lifestyleAddOn].filter(Boolean).join("\n");
const userPrompt = `Description:\n${desc}\n\nWrite 5 distinct captions now.`;


    const completion = await client.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.85,
      max_tokens: 900,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userPrompt },
      ],
    });

    const rawText = completion.choices?.[0]?.message?.content || "";

    // Robust split into up to 5 captions
    const pieces = rawText
      .split(/\n{2,}|\r{2,}/g)      // prefer blank line separation
      .flatMap(p => p.split(/\n+/g)) // then single newlines
      .map(s => s.replace(/^\s*[\d]+[)\.\-\]]\s*/, "")) // drop "1) " or "1. "
      .map(s => s.replace(/^[-–•]\s*/, ""))            // drop bullets
      .map(s => s.replace(/^"|"$/g, ""))               // drop wrapping quotes
      .map(s => s.trim())
      .filter(Boolean);

    // De dupe and collect first 5
    const seen = new Set<string>();
    const captions: string[] = [];
    for (const p of pieces) {
      const norm = p.replace(/\s+/g, " ").trim();
      const key = norm.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        captions.push(norm);
      }
      if (captions.length >= 5) break;
    }

    // Fallback padding if model returned fewer than 5
    if (captions.length < 5) {
      const fallback = rawText.split(/[—•;]+/g).map(s => s.trim()).filter(Boolean);
      for (const f of fallback) {
        if (captions.length >= 5) break;
        const norm = f.replace(/\s+/g, " ").trim();
        const key = norm.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          captions.push(norm);
        }
      }
    }

    // Hard safety cap per caption to avoid absurd overrun, not typical
    const safe = captions.slice(0, 5).map(c => (c.length > 1400 ? c.slice(0, 1400) : c));

   return res.status(200).json({ captions: safe, pro: isPro, style, promptVersion: "v1.0.0-product-tuned" });
  } catch (e: any) {
    console.error("generate error:", e);
    return res.status(500).json({ error: e?.message || "Server error" });
  }
}
