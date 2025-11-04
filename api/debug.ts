import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // simple auth guard so randos can’t peek
  const secret = (req.query.secret as string) || "";
  if (secret !== process.env.ADMIN_DEBUG_SECRET) {
    return res.status(401).json({ error: "nope" });
  }

  try {
    const members = await redis.smembers<string[]>("pro_users");
    return res.json({ members });
  } catch (e: any) {
    console.error("DEBUG READ ERROR:", e);
    return res.status(500).json({ error: "redis fail", details: e?.message || String(e) });
  }
}
