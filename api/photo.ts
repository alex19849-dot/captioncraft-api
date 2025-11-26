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
  "witty",
  "bold",
  "laid-back",
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
  // CORS SUPPORT MULTIPLE ORIGINS
  const allowedOrigins = [
    "https://postpoet.vercel.app",
    "https://postpoet.co.uk",
    "https://www.postpoet.co.uk",
    "http://localhost:3000"
  ];

  const origin = req.headers.origin as string | undefined;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
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
You are PostPoet, an Urban Creator Street Smart caption-writer for social media. 
Your writing is confident, clean, premium, culturally aware. PG-13 only.

You are generating captions based on:
1. What you SEE in the uploaded image
2. Extra user description: "${descValue}"
Blend both naturally.
Combine the visual info from the image with this user description naturally:
"${descValue}"
The description MUST influence the caption. Do not ignore it.

Tone: ${toneValue}
Length style: ${styleValue}

Rules:
- Produce exactly 5 captions.
- One caption per line, no numbering, no quotes.
- Each caption must be a single paragraph.
- Tone must be strong and clear in the writing style.
- Include 3 to 7 relevant hashtags per caption.
- Hashtags must be specific, niche + broad mixed, and match the image, the vibe and the tone.
- Hashtags MUST be in the same paragraph, not on a new line.

Length rules (STRICT):
For each caption:
- If style is "short", caption MUST be between 100 and 120 characters.
- If style is "medium", caption MUST be between 200 and 250 characters.
- If style is "long", caption MUST be between 350 and 500 characters.
Do NOT write outside these ranges. Do NOT pad artificially.


Special tone behaviour:
• Product Selling Direct:
  - Speak benefit + desirability.
  - Light CTA allowed ("tap in", "worth a closer look").
  - Do NOT sound desperate or corporate.
  - Focus on how the product changes the user's day or lifestyle, not features.

• Lifestyle tones (witty, sarcastic, flirty, luxury, dark humour, roast, motivational, reflective, supportive):
  - First sentence MUST be a shareable, punchy hook.
  - No quotes around hooks.
  - Must feel like a screenshot-worthy one-liner.

Return ONLY the 5 final captions. Nothing before or after.

`.trim();
const finalPrompt = basePrompt;

    const completion = await client.chat.completions.create({
     model: "gpt-4o-mini",
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
