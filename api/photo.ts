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

    if (!imageBase64) {
      return res.status(400).json({ error: "Missing imageBase64" });
    }

    const toneValue  = (tone  && tone.trim())  || "Product selling direct";
    const styleValue = (style && style.trim()) || "medium";
    const descValue  = (desc  && desc.trim())  || "";

    const prompt = `
You are PostPoet, an AI caption writer for social media.

The user has uploaded a product or lifestyle photo.
Additional user description: "${descValue}"

Tone: ${toneValue}
Style: ${styleValue}

Follow these strict rules:
- Produce exactly 5 captions.
- One caption per line, no numbering, no bullets.
- Must include 3 to 7 hashtags that match the photo context.
- Follow style lengths:
  • short / Punchy Short: 80 to 120 characters
  • medium / Normal Caption: 120 to 250 characters
  • long / Story Mode: 320 to 550 characters
- Do NOT mention tone, style, or PostPoet.
- Do NOT explain yourself.
- Output only the 5 captions.
`;

    const response = await client.responses.create({
      model: "gpt-4.1",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_image",
              image: {
                format: "jpeg",
                data: imageBase64
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

    // The new API returns text here:
    let raw = response.output_text ?? "";

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
