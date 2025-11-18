import type { VercelRequest, VercelResponse } from "@vercel/node";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Style meta, similar to your text endpoint
const STYLE_META = {
  short:  { min: 80,  max: 140, hashtagMin: 3, hashtagMax: 7 },
  medium: { min: 140, max: 260, hashtagMin: 3, hashtagMax: 7 },
  long:   { min: 260, max: 550, hashtagMin: 3, hashtagMax: 7 }
} as const;

const LIFESTYLE_TONES = [
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

    const toneRaw  = (tone  || "").trim();
    const styleRaw = (style || "").trim();
    const descValue = (desc || "").trim();

    const toneValue =
      toneRaw ||
      "Product selling direct";

    // Normalise style
    const styleKey = styleRaw.toLowerCase();
    let styleValue: "short" | "medium" | "long";
    if (styleKey.includes("short")) {
      styleValue = "short";
    } else if (styleKey.includes("long") || styleKey.includes("story")) {
      styleValue = "long";
    } else {
      styleValue = "medium";
    }

    const t = STYLE_META[styleValue];

    // Base behaviour copied from your text prompt, but for image + desc
    const basePrompt = `
You are PostPoet, writing Urban Creator Street Smart social captions.
Principles: confident, clean, premium, culturally aware. PG-13 only. No explicit sexual content.

The user has uploaded a product or lifestyle photo.
Use what you see in the image AND the extra description below to understand context and purpose.

Extra description (may be empty): "${descValue}"

Write ${styleValue} captions in "${toneValue}" tone.

Target length: between ${t.min} and ${t.max} characters per caption, natural not padded.
Each caption must be one paragraph, no numbering, no quote marks.
Avoid emojis unless the tone clearly justifies them.

Each caption must:
- Include its own hashtags at the end (same paragraph)
- Use between ${t.hashtagMin} and ${t.hashtagMax} relevant hashtags
- Mix niche + broader SEO-friendly hashtags
- Be suitable for Instagram, TikTok, Vinted, Depop, eBay style feeds.

Return exactly 5 distinct captions.
Each caption on its own line.
Do NOT output headings, labels, bullets or numbering.
Do NOT mention tone, style or PostPoet.
`.trim();

    let toneAddOn = "";

    if (toneValue.toLowerCase() === "product selling direct") {
      toneAddOn = `
For THIS tone ONLY:
- Lean into conversion through value, emotional desire and cultural flex.
- Light permission-based CTA allowed ("tap to see more", "worth a closer look").
- No aggressive sales talk, no price spam, no desperate language.
- Focus on how the product changes the user's lived experience, not just listing features.
`.trim();
    } else if (LIFESTYLE_TONES.includes(toneValue.toLowerCase())) {
      toneAddOn = `
For lifestyle tones:
- First sentence should be a hook or punchline that feels screenshotable and shareable.
- Must NOT start or end with quotes.
- Keep it PG-13. No explicit content.
`.trim();
    }

    const finalPrompt = `
${basePrompt}

${toneAddOn}

Remember:
Only output the 5 captions, one per line. No explanations or meta commentary.
`.trim();

    const completion = await client.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.9,
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
              text: finalPrompt
            }
          ]
        }
      ]
    });

    let raw = completion.choices?.[0]?.message?.content || "";

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
