import type { VercelRequest, VercelResponse } from "@vercel/node";
import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

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
    const platform = coercePlatform(body.platform);
    const style = coerceStyle(body.style);

    if (!desc) {
      return res.status(400).json({ error: "Item details required" });
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

Write exactly ONE eBay title.

STRICT RULES:
- Minimum 65 characters
- Maximum 80 characters
- Must use as much of the 80 characters as possible naturally
- Include Brand if provided
- Include Colour if provided
- Include Item Type
- Include Style / Feature words if relevant (lace, floral, long sleeve, stretch, oversized, fitted, midi, maxi, sheer, button, zip etc)
- Include Size if provided
- Include Womens if it is womenswear
- No filler
- No repeated words
- No symbols spam
- No short titles

GOOD:
Papaya Pink Lace Sleeve Blouse Top Long Sleeve Stretch Womens Size 16

BAD:
Papaya Size 16 Pink Lace Sleeve Top
- eBay description should be keyword-rich but still natural.
- Do not use hashtags for eBay.
- Include clear bullet points.

LISTING QUALITY RULES:
- Write a polished, professional resale listing.
- Make it detailed enough to help a buyer decide.
- Keep it factual, natural and easy to read.
- Use clear sections.
- Include measurements only if provided.
- Include flaws only if provided.
- If it is a bundle, write it naturally as a bundle based on the seller details.
- Avoid filler, hype and vague AI wording.
- Prioritise useful buyer information over sales language.
- For eBay titles, maximise useful keywords naturally. Short titles are not acceptable unless information is genuinely limited.
`.trim();

    const platformInstruction =
      platform === "vinted"
        ? `
Create a Vinted listing using exactly this structure:

VINTED TITLE:
Write exactly ONE Vinted title using this formula:

Brand + Item Type + Colour + Key Feature + Size

RULES:
- Include Brand if provided
- Include Item Type
- Include Colour if provided
- Include useful feature words if relevant, such as lace, floral, midi, maxi, oversized, fitted, stretch, long sleeve, short sleeve, sleeveless, button, zip
- Include Size if provided
- Keep it natural and clean
- No repeated words
- No filler words
- Make it look like a strong real Vinted listing title

GOOD:
Papaya Lace Sleeve Top Pink Womens Size 16

BAD:
Papaya Top Pink 16

DESCRIPTION:
Write a polished, professional resale description using the seller details. Make it detailed enough to help a buyer decide, but keep it factual and natural.

Details:
- Brand:
- Size:
- Colour:
- Condition:
- Style/Fit:
- Measurements:
- Flaws:

Only include bullet lines where the detail was actually provided.
If condition was provided, do not add another condition line.
If condition was not provided, use only:
- Condition: See photos

Then add relevant lowercase hashtags at the bottom with no heading.
`.trim()
        : `
Create an eBay listing using exactly this structure:

EBAY TITLE:
Write one keyword-rich eBay title between 70 and 80 characters where possible.

DESCRIPTION:
Write a polished, professional resale description using the seller details. Keep it keyword-rich, factual and useful for buyers.

Key details:
- Brand:
- Size:
- Colour:
- Condition:
- Style/Fit:
- Measurements:
- Flaws:

Only include bullet lines where the detail was actually provided.
If condition was provided, do not add another condition line.
If condition was not provided, use only:
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
      temperature: 0.3,
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
      pro: false,
      platform,
      style,
      promptVersion: "v2.1.2-generate-no-redis",
    });
  } catch (e: any) {
    console.error("generate error:", e);
    return res.status(500).json({ error: e?.message || "Server error" });
  }
}
