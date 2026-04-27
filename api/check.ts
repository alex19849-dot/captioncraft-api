import type { VercelRequest, VercelResponse } from "@vercel/node";

function cleanEnv(value: string | undefined) {
  return (value || "")
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/\/+$/, "");
}

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

    const redisUrl = cleanEnv(process.env.UPSTASH_REDIS_REST_URL);
    const redisToken = cleanEnv(process.env.UPSTASH_REDIS_REST_TOKEN);

    if (!redisUrl || !redisToken) {
      return res.status(500).json({
        error: "Redis config missing",
        pro: false,
        promptVersion: "check-v4-clean-rest",
      });
    }

    const redisResponse = await fetch(redisUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${redisToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(["SISMEMBER", "pro_users", email]),
    });

    const data = await redisResponse.json();

    if (!redisResponse.ok) {
      return res.status(500).json({
        error: "Redis request failed",
        status: redisResponse.status,
        details: data,
        pro: false,
        promptVersion: "check-v4-clean-rest",
      });
    }

    const isPro = data.result === 1 || data.result === "1" || data.result === true;

    return res.status(200).json({
      email,
      pro: isPro,
      checked: true,
      promptVersion: "check-v4-clean-rest",
    });

  } catch (err: any) {
    console.error("CHECK API ERROR:", err);

    return res.status(500).json({
      error: err?.message || "Server error",
      pro: false,
      checked: false,
      promptVersion: "check-v4-clean-rest",
    });
  }
}
