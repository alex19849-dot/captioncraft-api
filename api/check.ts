import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const email = req.query.email as string;
  if (!email) return res.status(400).json({ error: "email required" });

  const val = await redis.get(`pro_users:${email}`);

  return res.json({ pro: val === "1" });
}
