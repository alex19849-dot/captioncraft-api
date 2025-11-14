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
    // Frontend sends { imageBase64: "...", email: "..." }
    console.log("BODY RECEIVED:", typeof req.body, req.body);
console.log("imageBase64 exists:", !!req.body?.imageBase64);
console.log("email exists:", !!req.body?.email);
    const { imageBase64 } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ error: "Missing base64 image" });
    }

    // OpenAI Vision call
   const response = await client.chat.completions.create({
  model: "gpt-4o",
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
          text: `
You are creating 5 high converting captions for PRODUCT SELLING DIRECT RESPONSE.
Look at the image and write captions that SELL the item shown.

Rules:
• Apply the requested tone (witty, luxury, sarcastic, product selling direct etc).
• Apply the requested style length (short, medium, story mode).
• Be specific to the product in the image, no generic phrases.
• Include strong, relevant hashtags.
• No quotes around outputs.
• Each caption MUST be on its own separate line.
`

        }
      ]
    }
  ]
});

    let raw = response.choices?.[0]?.message?.content || "";

    // Remove accidental quotes
    raw = raw.replace(/^"+|"+$/g, "").trim();

    // Split into lines
    const captions = raw
      .split("\n")
      .map(x => x.trim())
      .filter(x => x.length > 0);

    res.status(200).json({ captions });

  } catch (err: any) {
    console.error("PHOTO API ERROR:", err);
    res.status(500).json({ error: err.message || "Server error" });
  }
}
