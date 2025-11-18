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
    const { imageBase64, email, tone, style } = (req.body || {}) as {
      imageBase64?: string;
      email?: string;
      tone?: string;
      style?: string;
    };

    if (!imageBase64 || typeof imageBase64 !== "string") {
      return res.status(400).json({ error: "Missing imageBase64" });
    }

    const toneValue  = (tone  && tone.trim())  || "Product selling direct";
    const styleValue = (style && style.trim()) || "medium";
const descValue = (req.body?.desc || "").trim();

    const prompt = `
const prompt = `
You are PostPoet, an AI caption writer for social content.

The user has uploaded a product or lifestyle photo.

Additional context from the user: "${descValue}"

Tone: ${toneValue}
Style: ${styleValue}

Follow these rules strictly:
- Write 5 different captions, one per line.
- Make them suitable for social media (Instagram, TikTok, Vinted, Depop, eBay).
- Always include 3 to 7 relevant hashtags per caption.
- Use the tone above in the wording (for example: "Product selling direct" should feel sales focused but not scammy).
- Length must follow these exact rules:
  • If style is "short" or "Punchy Short": caption must be between 80 and 120 characters.
  • If style is "medium" or "Normal Caption": caption must be between 120 and 250 characters.
  • If style is "long" or "Story Mode": caption must be between 320 and 550 characters.
- Do not go above or below the required range.
- Do NOT mention "tone", "style", "PostPoet" or describe what you are doing.
- Do NOT output headings, labels, markdown, bullet points or numbering.
- Output ONLY the 5 captions, each on its own line, nothing else.
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


    let raw = response.choices?.[0]?.message?.content || "";

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
