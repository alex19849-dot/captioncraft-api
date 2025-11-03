import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

import type { VercelRequest, VercelResponse } from "@vercel/node";
import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).send("POST only");

  const { desc, tone, email } = req.body || {};
  if (!desc || !tone) return res.status(400).json({ error: "desc + tone required" });

  let isPro = false;
  if (email) {
    try {
      const exists = await redis.sismember("pro_users", email);
      isPro = exists === 1;
    } catch(e) {
      console.error("Redis error:", e);
    }
  }

  const prompt = `Write 5 ${tone} social media captions for: "${desc}"
Keep each under 200 characters and include relevant hashtags at the end.`;

  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "You write extremely punchy social captions optimised for virality and short form attention rules." },
      { role: "user", content: prompt }
    ],
    temperature: 0.9,
    max_tokens: 400
  });

  const text = completion.choices[0].message.content || "";
  const lines = text.split(/\n+/).filter(Boolean).slice(0, 5);

  return res.json({ captions: lines, pro: isPro });
}
