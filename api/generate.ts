import { Redis } from "@upstash/redis";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import OpenAI from "openai";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

type PlatformKey = "vinted" | "ebay";
type StyleKey = "standard" | "detailed" | "bundle";

function coercePlatform(v: unknown): PlatformKey {
  return v === "ebay" ? "ebay" : "vinted";
}

function coerceStyle(v: unknown): StyleKey {
  return v === "detailed" || v === "bundle" ? v : "standard";
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

  try {
    if (req.method !== "POST") {
      return res.status(405).send("POST only");
    }

    const body =
      req.body && typeof req.body === "object"
        ? (req.body as any)
        : (() => {
            try {
              return JSON.parse((req as any).rawBody || "{}");
            } catch {
              return {};
            }
          })();

    const desc = (body.desc ?? "").toString().trim();
    const email = (body.email ?? "").toString().trim();
    const platform = coercePlatform(body.platform);
    const style = coerceStyle(body.style);

    if (!desc) {
      return res.status(400).json({ error: "Item details required" });
    }

    let isPro = false;

    if (email) {
      try {
        const exists = await redis.sismember("pro_users", email);
        isPro = String(exists) === "1";
      } catch (e) {
        console.error("Redis error:", e);
      }
    }

    const systemPrompt = `
You are PostPoet, a UK resale listing assistant for Vinted and eBay sellers.

Your job is to write clear, honest, useful resale listings that sound like a real person selling an item online.

ABSOLUTELY BANNED WORDS AND PHRASES:
- elevate
- stunning
- must-have
- perfect for any occasion
- timeless
- chic
- effortlessly
- stylish addition
- wardrobe staple
- add to your wardrobe
- beautiful piece
- don't miss out
- grab yourself
- this is a must
- eye-catching
- sophisticated
- exudes
- boasts
- crafted to perfection

IMPORTANT RULES:
- Use UK spelling.
- Do not sound like AI.
- Do not sound like a brand advert.
- Do not overhype the item.
- Do not invent details.
- Do not guess brand, size, fabric, condition, flaws, measurements, postage, fit, stretch, or authenticity.
- Only use the details the seller gave.
- If something is missing, leave it out.
- Mention flaws clearly if the seller gives flaws.
- If condition is unclear, say "Condition: See photos" instead of inventing.
- Keep wording simple and natural.
- No emojis.
- No quote marks around the final answer.
- No markdown code blocks.
- No numbered variations.
- Return one finished listing only.

HASHTAG RULES FOR VINTED:
- Add hashtags at the bottom.
- Do not write the word "hashtags".
- Use 8 to 14 relevant hashtags.
- Hashtags must be lowercase.
- Use specific item keywords.
- Include size hashtag if size is provided.
- Include brand hashtag if brand is provided.
- Avoid spam tags like #love, #fashion, #instagood.

EBAY RULES:
- eBay title must be under 80 characters.
- eBay description should be keyword-rich but still natural.
- Do not use hashtags for eBay.
- Include clear bullet points.

STYLE RULES:
Standard Listing:
- Clear title.
- Short useful description.
- Key details.
- Condition.

Detailed Listing:
- More complete description.
- Include measurements section only if measurements were provided.
- Include flaws section only if flaws were provided.
- Still no waffle.

Bundle Listing:
- Write as a bundle/listing for multiple items.
- Mention number of items only if the seller gave it.
- Keep it clear and practical.
`.trim();

    const platformInstruction =
      platform === "vinted"
        ? `
Create a Vinted listing using exactly this structure:

VINTED TITLE:
Brand Item Colour Size

DESCRIPTION:
Write 1 short natural paragraph about the item.

Details:
- Brand:
- Size:
- Colour:
- Condition:
- Style/Fit:
- Measurements:

Only include bullet lines where the detail was actually provided.
If condition was not provided, use:
- Condition: See photos

Then add relevant lowercase hashtags at the bottom with no heading.
`.trim()
        : `
Create an eBay listing using exactly this structure:

EBAY TITLE:
Write one keyword-rich eBay title under 80 characters.

DESCRIPTION:
Write a clear factual paragraph.

Key details:
- Brand:
- Size:
- Colour:
- Condition:
- Style/Fit:
- Measurements:
- Flaws:

Only include bullet lines where the detail was actually provided.
If condition was not provided, use:
- Condition: See photos
Do not include hashtags.
`.trim();

    const userPrompt = `
Platform: ${platform}
Listing type: ${style}

Seller item details:
${desc}

Write the finished listing now.
`.trim();

    const completion = await client.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.35,
      max_tokens: 900,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "system", content: platformInstruction },
        { role: "user", content: userPrompt },
      ],
    });

    const rawText = completion.choices?.[0]?.message?.content?.trim() || "";

    const listing = rawText
      .replace(/^```html\s*/i, "")
      .replace(/^```text\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```$/i, "")
      .trim();

    if (!listing) {
      return res.status(500).json({ error: "No listing generated" });
    }

    return res.status(200).json({
      listings: [listing],
      captions: [listing],
      pro: isPro,
      platform,
      style,
      promptVersion: "v2.0.0-listings-only",
    });
  } catch (e: any) {
    console.error("generate error:", e);
    return res.status(500).json({ error: e?.message || "Server error" });
  }
}
