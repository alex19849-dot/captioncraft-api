import type { VercelRequest, VercelResponse } from "@vercel/node";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "https://postpoet.vercel.app");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  try {
    const { imageBase64, tone, style, desc } = (req.body || {}) as {
      imageBase64?: string;
      tone?: string;
      style?: string;
      desc?: string;
    };

    if (!imageBase64 || typeof imageBase64 !== "string") {
      return res.status(400).json({ error: "Missing imageBase64" });
    }

    const toneValueRaw  = (tone  || "").trim();
    const styleValueRaw = (style || "").trim();

    const toneValue =
      toneValueRaw ||
      "Product selling direct";

    // normalise style
    const styleKey = styleValueRaw.toLowerCase();
    let styleValue: "short" | "medium" | "long";
    if (styleKey.includes("short")) {
      styleValue = "short";
    } else if (styleKey.includes("long") || styleKey.includes("story")) {
      styleValue = "long";
    } else {
      styleValue = "medium";
    }

    const descValue = (desc || "").trim();

    const prompt = `
You are PostPoet, an AI caption writer for social content.

The user has uploaded a product or lifestyle photo.

Additional context from the user (optional): "${descValue}"

Tone: ${toneValue}
Style bucket: ${styleValue}

Follow these rules strictly:
- Write 5 different captions, one per line.
- Make them suitable for social media (Instagram, TikTok, Vinted, Depop, eBay).
- Use the image plus the extra description together when relevant.
- Always include 3 to 7 relevant hashtags per caption.
- Use the tone above in the wording (for example: "Product selling direct" should feel sales focused but not scammy).
- Length rules:
  • If style is "short": caption must be between 80 and 120 characters.
  • If style is "medium": caption must be between 120 and 250 characters.
  • If style is "long": caption must be between 320 and 550 characters.
- Do not go above or below the required range for that style.
- Do NOT mention "tone", "style", "PostPoet" or describe what you are doing.
- Do NOT output headings, labels, markdown, bullet points or numbering.
- Output ONLY the 5 captions, each on its own line, nothing else.
`;

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.85,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${imageBase64}`
              }
            },
            {
              type: "text",
              text: prompt
            }
          ]
        }
      ]
    });

    let raw = completion.choices?.[0]?.message?.content;

    // In case content is not a plain string (future proofing)
    if (Array.isArray(raw)) {
      raw = raw
        .map((part: any) => {
          if (typeof part === "string") return part;
          if (part.type === "text") return part.text || "";
          return "";
        })
        .join("\n");
    }

    if (typeof raw !== "string") {
      raw = String(raw ?? "");
    }

    raw = raw.replace(/^"+|"+$/g, "").trim();

    const captions = raw
      .split("\n")
      .map(line => line.trim())
      .filter(line => line.length > 0);

    if (!captions.length) {
      return res.status(500).json({ error: "No captions generated" });
    }

    return res.status(200).json({ captions });

  } catch (err: any) {
    console.error("PHOTO API ERROR:", err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
}
