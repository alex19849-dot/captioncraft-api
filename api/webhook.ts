import Stripe from "stripe";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import Redis from "ioredis";

export const config = {
  api: {
    bodyParser: false, // required for stripe signatures
  },
};

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, { apiVersion: "2024-10-28" });
const redis = new Redis(process.env.REDIS_URL as string);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  const sig = req.headers["stripe-signature"] as string;

  // convert raw body to buffer correctly
  const rawBody = await new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
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
    console.error("❌ Webhook signature failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session: any = event.data.object;
        const email = session.customer_details?.email;
        if (email) {
          await redis.sadd("pro_users", email);
          console.log("✅ Stored new PRO user:", email);
        }
        break;
      }

      case "customer.subscription.deleted": {
        const sub: any = event.data.object;
        const email = sub.customer_email || sub.customer?.email;
        if (email) {
          await redis.srem("pro_users", email);
          console.log("🧹 Removed cancelled PRO user:", email);
        }
        break;
      }

      default:
        console.log(`Unhandled event type ${event.type}`);
    }
  } catch (err: any) {
    console.error("⚠️ Error processing event:", err);
    return res.status(500).send("Internal Error");
  }

  return res.json({ received: true });
}
