import { VercelRequest, VercelResponse } from '@vercel/node';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  try {
    const { desc, tone } = req.body || {};
    if (!desc || !tone) {
      return res.status(400).json({ error: 'desc and tone required' });
    }

  const prompt = `Write EXACTLY 5 completely different ${tone} short social media captions for: "${desc}".
Each caption must stand alone as a full post. Do NOT just list hashtags.
Each caption MUST include 2 to 4 relevant hashtags at the end.
Keep each caption under 200 characters.
Return ONLY the captions, one per line, no numbering, no quotes.`;

    const r = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.9,
        max_tokens: 400,
        messages: [
          { role: 'system', content: 'You are a sharp, concise social caption writer.' },
          { role: 'user', content: prompt }
        ]
      })
    });

    if (!r.ok) {
      const t = await r.text();
      return res.status(r.status).json({ error: `OpenAI error ${r.status}`, detail: t });
    }

    const data = await r.json();
    const text: string = data.choices?.[0]?.message?.content || '';
    const lines = text.split(/\n+/).map(s => s.replace(/^\d+[\).\s-]*/, '').trim()).filter(Boolean).slice(0, 5);

    return res.json({ captions: lines });
  } catch (err: any) {
    console.error('generate error', err);
    return res.status(500).json({ error: 'server error' });
  }
}
