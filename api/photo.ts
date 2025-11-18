import type { VercelRequest, VercelResponse } from "@vercel/node";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "https://postpoet.vercel.app");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  try {
    const { imageBase64, tone, style, desc } = (req.body || {}) as {
      imageBase64?: string;
      tone?: string;
      style?: string;
      desc?: string;
    };

    if (!imageBase64 || typeof imageBase64 !== "string") {
      return res.status(400).json({ error: "Missing imageBase64" });
    }

    const toneValueRaw  = (tone  || "").trim();
    const styleValueRaw = (style || "").trim();

    const toneValue =
      toneValueRaw ||
      "Product selling direct";

    // normalise style
    const styleKey = styleValueRaw.toLowerCase();
    let styleValue: "short" | "medium" | "long";
    if (styleKey.includes("short")) {
      styleValue = "short";
    } else if (styleKey.includes("long") || styleKey.includes("story")) {
      styleValue = "long";
    } else {
      styleValue = "medium";
    }

    const descValue = (desc || "").trim();

   const basePrompt = `
You are PostPoet, writing Urban Creator Street Smart social captions.
Principles: confident, clean, premium, culturally aware. PG-13 only. No explicit sexual content.

The user has uploaded a product or lifestyle image. Use the visual details *plus* any provided description to understand context and purpose.

Write ${styleValue} captions in "${toneValue}" tone for what you see in the image.

Target length: between ${t.min} and ${t.max} characters per caption, natural and not padded.

Each caption must:
- Be one paragraph
- Contain NO numbering
- Contain NO quote marks
- Avoid emojis unless the tone strongly justifies them
- Append relevant niche + broad SEO hashtags (NOT generic spam like #love #instagood unless truly relevant)
- Include between ${t.hashtagMin} and ${t.hashtagMax} hashtags
- Use hashtags in the same paragraph, not on separate lines
- Return exactly 5 distinct captions, each on its own line

Tone rules:
`;

let toneAddOn = "";

if (toneValue.toLowerCase() === "product selling direct") {
  toneAddOn = `
For THIS tone ONLY:
Lean into conversion with value, emotional desire and cultural flex.
Light, permission-based CTA allowed ("tap to look", "worth a closer look").
No hard sell, no price listing, no needy language.
Focus on how the product changes the user's lived experience, not on features.
Story Mode should still move toward the CTA outcome.
`;
} else if (lifestyleTones.includes(toneValue.toLowerCase())) {
  toneAddOn = `
For lifestyle tones:
The first sentence MUST be a memeable hook or punchline, something instantly screenshotable and shareable.
It must NOT start or end with quotes.
Still PG-13. No CTA unless the tone explicitly encourages one.
`;
}

const finalPrompt = `
${basePrompt}
${toneAddOn}

User extra description: "${descValue}"

Remember: Only output the 5 captions. No explanations. No meta comments.
`.trim();

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.85,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${imageBase64}`
              }
            },
            {
              type: "text",
              text: prompt
            }
          ]
        }
      ]
    });

    let raw = completion.choices?.[0]?.message?.content;

    // In case content is not a plain string (future proofing)
    if (Array.isArray(raw)) {
      raw = raw
        .map((part: any) => {
          if (typeof part === "string") return part;
          if (part.type === "text") return part.text || "";
          return "";
        })
        .join("\n");
    }

    if (typeof raw !== "string") {
      raw = String(raw ?? "");
    }

    raw = raw.replace(/^"+|"+$/g, "").trim();

    const captions = raw
      .split("\n")
      .map(line => line.trim())
      .filter(line => line.length > 0);

    if (!captions.length) {
      return res.status(500).json({ error: "No captions generated" });
    }

    return res.status(200).json({ captions });

  } catch (err: any) {
    console.error("PHOTO API ERROR:", err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
}
