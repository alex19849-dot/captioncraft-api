import type { VercelRequest, VercelResponse } from "@vercel/node";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
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

    if (!imageBase64) {
      return res.status(400).json({ error: "Missing imageBase64" });
    }

    const toneValue  = (tone  && tone.trim())  || "Product selling direct";
    const styleValue = (style && style.trim()) || "medium";
    const descValue  = (desc  && desc.trim())  || "";

    const prompt = `
You are PostPoet, an AI caption writer for social media.

The user uploaded a product or lifestyle photo.
Extra description from user: "${descValue}"

Tone: ${toneValue}
Style: ${styleValue}

Rules:
- Produce exactly 5 captions.
- One caption per line.
- Include 3 to 7 relevant hashtags.
- Style rules:
  • short: 80–120 chars
  • medium: 120–250 chars
  • long: 320–550 chars
- No meta commentary.
- No labels or numbering.
- Only output the 5 captions.
`.

    const response = await client.responses.create({
      model: "gpt-4.1",
      input: [
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

    let raw = response.output_text || "";
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
