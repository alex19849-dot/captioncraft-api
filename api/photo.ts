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
    const { imageBase64, email } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ error: "Missing image" });
    }

    // NEW OpenAI Vision request format
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
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
              text: "Write a short, catchy caption based on what you see in the image. Social media style, natural, no hashtags."
            }
          ]
        }
      ]
    });

   let raw = response.choices?.[0]?.message?.content || "";
raw = raw.replace(/^"+|"+$/g, "").trim(); // remove stray quotes

// turn the single caption into an array, OR split if model gives multiple lines later
const captions = [raw];

res.status(200).json({
  captions,
  pro: true
});

  } catch (err: any) {
    console.error("PHOTO API ERROR:", err);
    res.status(500).json({ error: err.message || "Server error" });
  }
}
