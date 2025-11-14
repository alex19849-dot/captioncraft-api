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
You are PostPoet, generating 5 high converting social captions for creators.

The user has uploaded a photo. Analyse the image in detail AND apply:
• the selected tone (witty, luxury, sarcastic, product selling direct, etc)
• the selected style length (short, medium, story mode)
• the user’s written description if it's provided

Rules:
1. If style = short, keep each caption 40 to 70 characters.
2. If style = medium, keep each caption 90 to 160 characters.
3. If style = long (story mode), keep each caption 220 to 350 characters.
4. Captions must SELL the exact item in the image, not generic lifestyle waffle.
5. Use specific adjectives, features, benefits, context and emotional hooks.
6. Include 3 to 8 relevant hashtags depending on style:
   • Short → 3 or 4 hashtags
   • Medium → 5 or 6 hashtags
   • Story Mode → 6 to 8 hashtags
7. No quotes around outputs.
8. Output each caption on its own separate line, no numbering.

Be bold, persuasive and scroll-stopping. Keep the writing human and social ready.
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
