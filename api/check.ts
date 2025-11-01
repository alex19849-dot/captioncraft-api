import { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const email = req.query.email as string;

  if (!email) {
    return res.status(400).json({ error: "email required" });
  }

  const response = await fetch(process.env.UPSTASH_REDIS_REST_URL as string, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      "GET": {
        key: `prouser:${email}`
      }
    })
  });

  const result = await response.json();

  if (!result.result) {
    return res.json({ pro: false });
  }

  const data = JSON.parse(result.result);

  return res.json({ pro: data.status === "active" });
}

