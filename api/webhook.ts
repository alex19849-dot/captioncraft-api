import Stripe from "stripe";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Redis } from "@upstash/redis";

export const config = {
  api: { bodyParser: false }
};

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: "2023-10-16"
});

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  const sig = req.headers["stripe-signature"] as string;

  const rawBody = await new Promise<Buffer>((resolve, reject) => {
    const chunks: Uint8Array[] = [];
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

  // helper store fn
  const store = async (email: string | null) => {
    if (!email) return;
    email = email.toLowerCase().trim();
    await redis.sadd("pro_users", email);
    console.log("✅ STORED PRO USER:", email);
  };

  const pullEmail = async (stripeObj: any) => {
    let email = stripeObj.customer_details?.email;
    if (!email && stripeObj.customer) {
      const customer: any = await stripe.customers.retrieve(stripeObj.customer);
      email = customer.email;
    }
    return (email || null);
  };

  try {
    switch(event.type) {
      case "checkout.session.completed": {
        const email = await pullEmail(event.data.object);
        await store(email);
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice: any = event.data.object;
        const customer: any = await stripe.customers.retrieve(invoice.customer);
        await store(customer.email);
        break;
      }

      case "customer.subscription.deleted": {
        const sub: any = event.data.object;
        const customer: any = await stripe.customers.retrieve(sub.customer);
        const email = customer.email?.toLowerCase().trim();
        if (email) await redis.srem("pro_users", email);
        console.log("🧹 PRO REMOVED:", email);
        break;
      }

      default:
        console.log("UNHANDLED:", event.type);
    }
  } catch(e) {
    console.error("🔥 INTERNAL WEBHOOK ERROR:", e);
    return res.status(500).send("Internal Error");
  }

  return res.json({ received: true });
}
