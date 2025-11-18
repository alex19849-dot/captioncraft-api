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

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

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

    // Normalise tone
    const toneValueRaw = (tone || "").trim();
    const toneValue = toneValueRaw || "Product selling direct";

    // Normalise style
    const styleKey = (style || "").trim().toLowerCase();
    let styleValue: "short" | "medium" | "long";
    if (styleKey.includes("short")) {
      styleValue = "short";
    } else if (styleKey.includes("long") || styleKey.includes("story")) {
      styleValue = "long";
    } else {
      styleValue = "medium";
    }

    const descValue = (desc || "").trim();

    // Length + hashtag rules
    const config = {
      short: { min: 80, max: 140, hashtagMin: 3, hashtagMax: 7 },
      medium: { min: 140, max: 260, hashtagMin: 3, hashtagMax: 7 },
      long: { min: 320, max: 550, hashtagMin: 4, hashtagMax: 8 }
    }[styleValue];

    // Lifestyle tones
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

    const basePrompt = `
You are PostPoet, writing Urban Creator Street Smart social captions.
Principles: confident, clean, premium, culturally aware. PG-13 only.

The user has uploaded a product or lifestyle image. Combine the visual information with the description.

Write ${styleValue} captions in "${toneValue}" tone.

Target length: ${config.min} to ${config.max} characters, natural, not padded.

Each caption must:
- Be one paragraph
- No numbering
- No quote marks
- No emojis unless the tone requires it
- Append ${config.hashtagMin}-${config.hashtagMax} relevant hashtags (mix niche and broad)
- Hashtags must be in the same paragraph
- Return exactly 5 captions, each on its own line
`;

    let toneAddOn = "";

    // Product selling direct tone
    if (toneValue.toLowerCase() === "product selling direct") {
      toneAddOn = `
For Product Selling Direct:
- Light CTA allowed ("tap to look", "worth a closer look")
- No hard sell
- No price lists
- Focus on lifestyle transformation, not features
- Story Mode must still lean toward the CTA outcome
`;
    }

    // Lifestyle tones
    if (lifestyleTones.includes(toneValue.toLowerCase())) {
      toneAddOn = `
For lifestyle tones:
- First sentence MUST be a memeable hook or punchline
- No quotes around the hook
- Must feel viral, screenshot-worthy
`;
    }

    const finalPrompt = `
${basePrompt}
${toneAddOn}

Extra description from user: "${descValue}"

Output ONLY the 5 captions, nothing else.
`.trim();

    // === OpenAI Call (4o-mini vision) ===
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

    // Extract
    let raw = completion.choices?.[0]?.message?.content || "";

    raw = raw.replace(/^"+|"+$/g, "").trim();

    const captions = raw
      .split("\n")
      .map(x => x.trim())
      .filter(x => x.length > 0);

    if (!captions.length) {
      return res.status(500).json({ error: "No captions generated" });
    }

    return res.status(200).json({ captions });

  } catch (err: any) {
    console.error("PHOTO API ERROR:", err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
}
