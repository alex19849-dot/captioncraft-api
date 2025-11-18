import type { VercelRequest, VercelResponse } from "@vercel/node";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!
});

// style rules copied from your main system
const STYLE_RULES = {
  short:  { min: 80,  max: 120, hashtagMin: 3, hashtagMax: 7 },
  medium: { min: 120, max: 250, hashtagMin: 3, hashtagMax: 7 },
  long:   { min: 320, max: 550, hashtagMin: 3, hashtagMax: 7 }
};

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
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "https://postpoet.vercel.app");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    const { imageBase64, tone, style, desc } = req.body || {};

    if (!imageBase64 || typeof imageBase64 !== "string") {
      return res.status(400).json({ error: "Missing imageBase64" });
    }

    const toneValue = (tone || "Product selling direct").trim();
    const styleRaw = (style || "medium").toLowerCase();

    let styleKey: "short" | "medium" | "long" = "medium";
    if (styleRaw.includes("short")) styleKey = "short";
    else if (styleRaw.includes("long") || styleRaw.includes("story")) styleKey = "long";

    const rules = STYLE_RULES[styleKey];
    const descValue = (desc || "").trim();

    // BUILD PROMPT
    let prompt = `
You are PostPoet, writing Urban Creator Street Smart social captions.
Tone: ${toneValue}
Style: ${styleKey}

The user uploaded an image. Use the visual details plus the text description: "${descValue}"

Write exactly 5 captions.

Character rules:
- short: 80 to 120 chars
- medium: 120 to 250 chars
- long: 320 to 550 chars
Use the correct range: ${rules.min} to ${rules.max} characters.

Caption rules:
- One paragraph each
- No numbering
- No quote marks
- Only emojis if tone strongly supports it
- 3 to 7 good hashtags, niche + broad mix
- Hashtags must be in the same paragraph

`;

    if (toneValue.toLowerCase() === "product selling direct") {
      prompt += `
PRODUCT MODE RULES:
- Light CTA ok ("worth a look", "tap for more")
- No hard selling
- Focus on value and lived experience, not features
`;
    } else if (LIFESTYLE_TONES.includes(toneValue.toLowerCase())) {
      prompt += `
LIFESTYLE MODE RULES:
- First sentence must be a memeable hook
- No quotes around it
- Keep culturally sharp and PG-13
`;
    }

    prompt += `
Output:
ONLY the 5 captions.
One per line.
No explanations.
`;

    // MODEL CALL
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.85,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "input_image",
              image_url: `data:image/jpeg;base64,${imageBase64}`
            },
            {
              type: "text",
              text: prompt
            }
          ]
        }
      ]
    });

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
