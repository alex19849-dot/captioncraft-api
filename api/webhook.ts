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

/** ADD BOTH VALID PRO PRICE IDs HERE **/
const VALID_PRO_PRICES = new Set([
  "price_1SV9coBRVzTxNP7xWXcnOyEW", // £6.99 new price
  "price_1SQTpSBRVzTxNP7xMIUI4f6Z"       // <- replace with your old £4.99 price ID
]);

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
        const session: any = event.data.object;

        const priceId = session?.line_items?.data?.[0]?.price?.id 
                      || session?.metadata?.price_id 
                      || null;

        let customerEmail = session?.customer_details?.email || null;

if (!customerEmail && session.customer) {
  const cust = await stripe.customers.retrieve(session.customer);
  customerEmail = (cust as any).data?.email || null;
}


        if (customerEmail && priceId && VALID_PRO_PRICES.has(priceId)) {
          await redis.sadd("pro_users", customerEmail.toLowerCase());
          console.log("✅ PRO ADDED:", customerEmail, "via", priceId);
        }
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice: any = event.data.object;

        const priceId = invoice?.lines?.data?.[0]?.price?.id;
       const cust = await stripe.customers.retrieve(invoice.customer);
const email = (cust as any).data?.email || null;

        if (email && priceId && VALID_PRO_PRICES.has(priceId)) {
          await redis.sadd("pro_users", email.toLowerCase());
          console.log("🔁 PRO RENEWED:", email, "via", priceId);
        }
        break;
      }

      case "customer.subscription.deleted": {
        const sub: any = event.data.object;

      const cust = await stripe.customers.retrieve(sub.customer);
const email = (cust as any).data?.email || null;

        if (email) {
          await redis.srem("pro_users", email.toLowerCase());
          console.log("🧹 PRO REMOVED:", email);
        }
        break;
      }

      default:
        console.log("Unhandled event:", event.type);
    }

  } catch (err: any) {
    console.error("🔥 INTERNAL WEBHOOK ERROR:", err);
    return res.status(500).send("Internal Error");
  }

  return res.json({ received: true });
}
