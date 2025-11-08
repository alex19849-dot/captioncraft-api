import type { VercelRequest, VercelResponse } from "@vercel/node";

// Reads "pro" using Upstash REST. No @upstash/redis package needed.
  export default async function handler(req: VercelRequest, res: VercelResponse) {
   res.setHeader("Access-Control-Allow-Origin", "https://postpoet.vercel.app");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  try {
  const email = (req.query.email as string) || "";
  if (!email) return res.status(400).json({ pro: false, error: "email required" });

  try {
    // We’re checking set membership: SISMEMBER pro_users <email>
    const url = `${process.env.UPSTASH_REDIS_REST_URL}/sismember/pro_users/${encodeURIComponent(email)}`;
    const r = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` }
    });

    if (!r.ok) {
      const txt = await r.text();
      throw new Error(`Upstash REST ${r.status}: ${txt}`);
    }

    // Upstash REST returns JSON like: { result: 1 } or { result: 0 }
    const data = await r.json();
    const result = data?.result;

    const isPro =
      result === 1 || result === "1" || result === true || result === "true";

    return res.json({ pro: !!isPro });
  } catch (err: any) {
    console.error("CHECK REST ERROR:", err?.message || err);
    return res.status(500).json({ pro: false, error: "redis rest failed" });
  }
}
