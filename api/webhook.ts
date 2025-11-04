import Stripe from "stripe";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Redis } from "@upstash/redis";

export const config = {
  api: { bodyParser: false }
};

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: "2023-10-16",
});

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

  let event: Stripe.Event;
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
        console.log("### CHECKOUT SESSION EVENT RAW ###");
        console.log(JSON.stringify(event.data.object, null, 2));

        const session: any = event.data.object;

        let email = session?.customer_details?.email || null;

        if (!email && session.customer) {
          const cust: any = await stripe.customers.retrieve(session.customer);
          email = cust?.email || null;
        }

        console.log("CHECKOUT EVENT EMAIL:", email);

        if (email) {
          await redis.sadd("pro_users", email);
          console.log("✅ PRO USER SAVED", email);
        }

        break;
      }

      case "invoice.payment_succeeded": {
        console.log("### invoice.payment_succeeded ###");

        const invoice: any = event.data.object;
        const cust: any = await stripe.customers.retrieve(invoice.customer);
        const email = cust?.email || null;

        if (email) {
          await redis.sadd("pro_users", email);
          console.log("✅ PRO USER RENEWED", email);
        }
        break;
      }

      case "customer.subscription.deleted":
      {
        console.log("### customer.subscription.deleted ###");
        const sub: any = event.data.object;
        const cust: any = await stripe.customers.retrieve(sub.customer);
        const email = cust?.email || null;

        if (email) {
          await redis.srem("pro_users", email);
          console.log("🧹 PRO USER REMOVED", email);
        }
        break;
      }

      default:
        console.log("UNHANDLED EVENT:", event.type);
    }

  } catch (err: any) {
    console.error("🔥 INTERNAL WEBHOOK ERROR:", err);
    return res.status(500).send("Internal Error");
  }

  return res.json({ received: true });
}
