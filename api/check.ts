import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: (process.env.UPSTASH_REDIS_REST_URL || "").trim(),
  token: (process.env.UPSTASH_REDIS_REST_TOKEN || "").trim(),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const allowedOrigins = [
    "https://postpoet.vercel.app",
    "https://postpoet.co.uk",
    "https://www.postpoet.co.uk",
    "http://localhost:3000",
  ];

  const origin = req.headers.origin as string | undefined;

  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "GET or POST only" });
  }

  try {
    const email =
      req.method === "POST"
        ? (req.body?.email || "").toString().trim().toLowerCase()
        : ((req.query.email as string | undefined) || "").trim().toLowerCase();

    if (!email) {
      return res.status(400).json({ error: "Missing email." });
    }

    const isMember = await redis.sismember("pro_users", email);

    return res.status(200).json({
      email,
      pro: !!isMember,
      checked: true,
      promptVersion: "check-v2-clean",
    });

  } catch (err: any) {
    console.error("CHECK API ERROR:", err);

    return res.status(500).json({
      error: err?.message || "Server error",
      checked: false,
      hasRedisUrl: !!process.env.UPSTASH_REDIS_REST_URL,
      hasRedisToken: !!process.env.UPSTASH_REDIS_REST_TOKEN,
      promptVersion: "check-v2-clean",
    });
  }
}
