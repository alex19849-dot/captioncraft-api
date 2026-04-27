import type { VercelRequest, VercelResponse } from "@vercel/node";

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

    const redisUrl = (process.env.UPSTASH_REDIS_REST_URL || "").trim();
    const redisToken = (process.env.UPSTASH_REDIS_REST_TOKEN || "").trim();

    if (!redisUrl || !redisToken) {
      return res.status(500).json({
        error: "Redis config missing",
        pro: false,
      });
    }

    const redisResponse = await fetch(`${redisUrl}/sismember/pro_users/${encodeURIComponent(email)}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${redisToken}`,
      },
    });

    if (!redisResponse.ok) {
      return res.status(500).json({
        error: "Redis request failed",
        status: redisResponse.status,
        pro: false,
      });
    }

    const data = await redisResponse.json();

    const result = Array.isArray(data.result) ? data.result[0] : data.result;
    const isPro = result === 1 || result === "1" || result === true;

    return res.status(200).json({
      email,
      pro: isPro,
      checked: true,
      promptVersion: "check-v3-rest-direct",
    });

  } catch (err: any) {
    console.error("CHECK API ERROR:", err);

    return res.status(500).json({
      error: err?.message || "Server error",
      pro: false,
      checked: false,
      promptVersion: "check-v3-rest-direct",
    });
  }
}
