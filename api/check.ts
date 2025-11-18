import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "https://postpoet.vercel.app");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });

  try {
    const email = (req.query.email as string || "").trim().toLowerCase();

    if (!email) {
      return res.status(400).json({ error: "Missing email" });
    }

    const pro = await redis.get(`pro:${email}`);

    return res.status(200).json({
      email,
      pro: !!pro
    });

  } catch (err: any) {
    console.error("CHECK API ERROR:", err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
}
