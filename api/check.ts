import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
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
    const url = (process.env.UPSTASH_REDIS_REST_URL || "").trim();
    const token = (process.env.UPSTASH_REDIS_REST_TOKEN || "").trim();

    const test = await fetch(`${url}/ping`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const text = await test.text();

    const rawUrl = (process.env.UPSTASH_REDIS_REST_URL || "").trim();

return res.status(500).json({
  error: err.message || "Server error",
  hasRedisUrl: !!rawUrl,
  hasRedisToken: !!process.env.UPSTASH_REDIS_REST_TOKEN,
  urlStartsWithHttps: rawUrl.startsWith("https://"),
  urlLength: rawUrl.length,
  urlPreview: rawUrl.slice(0, 30)
});

  } catch (err: any) {
    return res.status(500).json({
      error: err.message || "Server error",
      hasRedisUrl: !!process.env.UPSTASH_REDIS_REST_URL,
      hasRedisToken: !!process.env.UPSTASH_REDIS_REST_TOKEN
    });
  }
}
