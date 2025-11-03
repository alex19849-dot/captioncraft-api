import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const email = req.query.email as string;

  if (!email) {
    return res.status(400).json({ pro: false, error: "email required" });
  }

  try {
    const exists = await redis.sismember("pro_users", email);
    return res.json({ pro: exists === 1 });
  } catch (err: any) {
    console.error("CHECK ERROR:", err);
    return res.status(500).json({ pro: false, error: "redis read failed" });
  }
}
