import Stripe from "stripe";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import Redis from "ioredis";

export const config = { api: { bodyParser: false } };

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, { apiVersion: "2023-10-16" });

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
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
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err: any) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  const storePro = async (email: string | null) => {
    if (!email) return;
    await redis.sadd("pro_users", email);
    console.log("✅ PRO STORED:", email);
  };

  switch (event.type) {
    case "checkout.session.completed": {
      const session: any = event.data.object;
      const email = session.customer_details?.email;
      await storePro(email);
      break;
    }

    case "invoice.payment_succeeded": {
      const invoice: any = event.data.object;
      const customer: any = await stripe.customers.retrieve(invoice.customer);
      await storePro(customer.email);
      break;
    }

    case "customer.subscription.deleted": {
      const sub: any = event.data.object;
      const customer: any = await stripe.customers.retrieve(sub.customer);
      await redis.srem("pro_users", customer.email);
      console.log("🧹 PRO REMOVED:", customer.email);
      break;
    }
  }

  return res.json({ received: true });
}
