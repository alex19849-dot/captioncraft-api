import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS ALLOW MULTIPLE DOMAINS
  const allowedOrigins = [
    "https://postpoet.vercel.app",
    "https://postpoet.co.uk",
    "https://www.postpoet.co.uk",
    "http://localhost:3000"
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

  try {
    // READ EMAIL FROM QUERY
    const email = (req.query.email as string | undefined)?.toLowerCase();

    if (!email) {
      return res.status(400).json({ error: "Missing email." });
    }

    // CHECK IF USER IS PRO
    const isMember = await redis.sismember("pro_users", email);

    return res.status(200).json({
      email,
      pro: !!isMember
    });

  } catch (err: any) {
    console.error("CHECK API ERROR:", err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
}
