import type { VercelRequest, VercelResponse } from "@vercel/node";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "https://postpoet.vercel.app");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  try {
    // Vercel auto-parses JSON into req.body
    const { imageBase64, email } = req.body || {};

    if (!imageBase64) {
      return res.status(400).json({ error: "Missing imageBase64" });
    }

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: `data:image/jpeg;base64,${imageBase64}`
            },
            {
              type: "text",
              text: "Look at this image and generate 5 short captions with relevant hashtags. One caption per line."
            }
          ]
        }
      ]
    });

    let raw = response.choices?.[0]?.message?.content || "";
    raw = raw.replace(/^"+|"+$/g, "").trim();

    const captions = raw
      .split("\n")
      .map(s => s.trim())
      .filter(s => s.length > 0);

    return res.status(200).json({ captions });

  } catch (err: any) {
    console.error("PHOTO API ERROR:", err);
    res.status(500).json({ error: err.message || "Server error" });
  }
}
