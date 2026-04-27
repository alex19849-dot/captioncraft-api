import type { VercelRequest, VercelResponse } from "@vercel/node";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

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
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  try {
    const { imageBase64, platform, style, desc } = (req.body || {}) as {
      imageBase64?: string;
      platform?: string;
      style?: string;
      desc?: string;
    };

    if (!imageBase64 || typeof imageBase64 !== "string") {
      return res.status(400).json({ error: "Missing imageBase64" });
    }

    const platformValue = coercePlatform(platform);
    const styleValue = coerceStyle(style);
    const descValue = (desc || "").trim();

    const systemPrompt = `
You are PostPoet, a UK resale listing assistant for Vinted and eBay sellers.

You write clear, honest resale listings based on:
1. What you can see in the uploaded photo.
2. Any extra seller details provided.

Your writing must sound like a real UK seller, not AI and not a brand advert.

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
- eye-catching
- sophisticated
- exudes
- boasts
- crafted to perfection

IMPORTANT RULES:
- Use UK spelling.
- Do not overhype.
- Do not invent brand, size, fabric, condition, measurements, flaws, postage or authenticity.
- Only use brand, size, condition, flaws and measurements if the seller provided them.
- You may describe visible item type, colour, pattern, neckline, sleeve length, shape and obvious style from the image.
- If condition is not provided, say "Condition: See photos".
- If unsure about a visible detail, use cautious wording.
- No emojis.
- No quote marks around the final answer.
- No markdown code blocks.
- Return one finished listing only.

PHOTO RULE:
Use the photo to identify visible details, but do not pretend certainty about hidden details like label, exact size, fabric, brand or condition unless the seller wrote it.

VINTED HASHTAG RULES:
- Add hashtags at the bottom.
- Do not write the word "hashtags".
- Use 8 to 14 relevant hashtags.
- Hashtags must be lowercase.
- Include brand hashtag only if brand was provided.
- Include size hashtag only if size was provided.
- Avoid spam tags like #love, #fashion, #instagood.

EBAY RULES:
- eBay title must be under 80 characters.
- eBay description should be keyword-rich but natural.
- Do not use hashtags for eBay.
- Include bullet points.
`.trim();

    const platformInstruction =
      platformValue === "vinted"
        ? `
Create a Vinted listing using exactly this structure:

VINTED TITLE:
Brand Item Colour Size

DESCRIPTION:
Write 1 short natural paragraph about the item using the photo and seller details.

Details:
- Brand:
- Size:
- Colour:
- Condition:
- Style/Fit:
- Measurements:
- Flaws:

Only include bullet lines where the detail is visible or was provided.
Do not include Brand or Size unless the seller provided them.
If condition was not provided, use:
- Condition: See photos

Then add relevant lowercase hashtags at the bottom with no heading.
`.trim()
        : `
Create an eBay listing using exactly this structure:

EBAY TITLE:
Write one keyword-rich eBay title under 80 characters.

DESCRIPTION:
Write a clear factual paragraph using the photo and seller details.

Key details:
- Brand:
- Size:
- Colour:
- Condition:
- Style/Fit:
- Measurements:
- Flaws:

Only include bullet lines where the detail is visible or was provided.
Do not include Brand or Size unless the seller provided them.
If condition was not provided, use:
- Condition: See photos

Do not include hashtags.
`.trim();

    const userPrompt = `
Platform: ${platformValue}
Listing type: ${styleValue}

Extra seller details:
${descValue || "No extra details provided."}

Write the finished listing now.
`.trim();

    const completion = await client.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.25,
      max_tokens: 900,
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "system",
          content: platformInstruction,
        },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${imageBase64}`,
              },
            },
            {
              type: "text",
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
      promptVersion: "v2.0.0-photo-listings-only",
    });
  } catch (err: any) {
    console.error("PHOTO API ERROR:", err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
}
