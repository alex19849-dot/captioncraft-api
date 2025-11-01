import Stripe from "stripe";
import type { VercelRequest, VercelResponse } from "@vercel/node";

export const config = {
  api: {
    bodyParser: false, // required for stripe signatures
  },
};

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, { apiVersion: "2024-10-28" });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  const sig = req.headers["stripe-signature"] as string;

  // convert raw body to buffer correctly (THIS is what was breaking types)
  const rawBody = await new Promise<Buffer>((resolve, reject) => {
    let chunks: any[] = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: any) {
    console.error("Webhook signature failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Stripe event logic
  if (event.type === "checkout.session.completed") {
    const session: any = event.data.object;
    const email = session.customer_details.email;
    console.log("✅ PRO USER:", email);
    // next step: redis write once generate route is stable
  }

  return res.json({ received: true });
}
