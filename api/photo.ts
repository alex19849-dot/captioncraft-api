import type { VercelRequest, VercelResponse } from "@vercel/node";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

type PlatformKey = "vinted" | "ebay";
type StyleKey = "detailed";

function coercePlatform(v: unknown): PlatformKey {
  return v === "ebay" ? "ebay" : "vinted";
}

function coerceStyle(v: unknown): StyleKey {
  return "detailed";
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
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  try {
    const { imageBase64, imageBase64s, platform, style, desc } = (req.body || {}) as {
      imageBase64?: string;
      imageBase64s?: string[];
      platform?: string;
      style?: string;
      desc?: string;
    };

    const images =
      Array.isArray(imageBase64s) && imageBase64s.length
        ? imageBase64s.slice(0, 6)
        : imageBase64
          ? [imageBase64]
          : [];

    if (!images.length) {
      return res.status(400).json({ error: "Missing imageBase64s" });
    }

    const platformValue = coercePlatform(platform);
    const styleValue = coerceStyle(style);
    const descValue = (desc || "").trim();

    const systemPrompt = `
You are PostPoet, a UK resale listing assistant for Vinted and eBay sellers.

Write clear, honest, useful resale listings that sound like a real UK seller.

You may use multiple uploaded photos to understand the item better, such as front, back, labels, close-ups, flaws, measurements or details.

ABSOLUTELY BANNED WORDS:
- elevate
- stunning
- must-have
- timeless
- chic
- effortlessly
- beautiful piece
- don't miss out
- eye-catching
- sophisticated
- exudes
- boasts

RULES:
- Use UK spelling.
- Do not sound like AI.
- Do not overhype.
- Do not invent details.
- Do not guess brand, size, fabric, condition, measurements, flaws or authenticity.
- Only use seller provided details for brand, size, condition and flaws unless clearly visible in a label/photo.
- You may describe visible colour, cut, neckline, sleeve type, shape, pattern and obvious style from the photos.
- If a label is visible, you may use the visible brand, size or fabric from that label.
- If unsure, be cautious.
- No emojis.
- No markdown.
- Return one finished listing only.
`.trim();

    const platformInstruction =
      platformValue === "vinted"
        ? `
Create a Vinted listing in exactly this format:

VINTED TITLE:
Brand Item Colour Size

DESCRIPTION:
Write a polished, professional resale description using the uploaded photos and seller details. Make it detailed enough to help a buyer decide, but keep it factual and natural.

Details:
- Brand:
- Size:
- Colour:
- Condition:
- Style/Fit:
- Measurements:
- Flaws:

Only include bullet lines where details are visible or were provided.
Do not include Brand unless provided or clearly visible on a label.
Do not include Size unless provided or clearly visible on a label.
If condition was provided, do not add another condition line.
If condition was not provided, use only:
- Condition: See photos

Add 8 to 12 relevant lowercase hashtags at the bottom with no heading.
`.trim()
        : `
Create an eBay listing in exactly this format:

EBAY TITLE:
Write one keyword-rich title under 80 characters.

DESCRIPTION:
Write a polished, professional resale description using the uploaded photos and seller details. Keep it factual and useful.

Key details:
- Brand:
- Size:
- Colour:
- Condition:
- Style/Fit:
- Measurements:
- Flaws:

Only include bullet lines where details are visible or were provided.
Do not include Brand unless provided or clearly visible on a label.
Do not include Size unless provided or clearly visible on a label.
If condition was provided, do not add another condition line.
If condition was not provided, use only:
- Condition: See photos

Do not include hashtags.
`.trim();

    const userPrompt = `
Platform: ${platformValue}
Listing type: ${styleValue}
Number of uploaded photos: ${images.length}

Seller notes:
${descValue || "No extra details provided"}

Write the finished listing now.
`.trim();

    const completion = await client.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.2,
      max_tokens: 1000,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "system", content: platformInstruction },
        {
          role: "user",
          content: [
            ...images.map((img) => ({
              type: "image_url" as const,
              image_url: {
                url: `data:image/jpeg;base64,${img}`,
              },
            })),
            {
              type: "text" as const,
              text: userPrompt,
            },
          ],
        },
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
      platform: platformValue,
      style: styleValue,
      photoCount: images.length,
      promptVersion: "v2.2.0-photo-multi-image",
    });
  } catch (err: any) {
    console.error("PHOTO API ERROR:", err);
    return res.status(500).json({
      error: err.message || "Server error",
    });
  }
}
