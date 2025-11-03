import Stripe from "stripe";
import type { VercelRequest, VercelResponse } from "@vercel/node";

export const config = {
  api: { bodyParser: false }
};

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: "2023-10-16"
});

// helper functions using REST redis
async function addPro(email: string) {
  await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/set/pro_users:${encodeURIComponent(email)}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` },
    body: JSON.stringify({ value: "1" })
  });
}

async function removePro(email: string) {
  await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/del/pro_users:${encodeURIComponent(email)}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` }
  });
}


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
    console.error("Webhook signature failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session: any = event.data.object;
        const email = session.customer_details?.email;
        if (email) await addPro(email);
        break;
      }
      case "invoice.payment_succeeded": {
        const invoice: any = event.data.object;
        const customer: any = await stripe.customers.retrieve(invoice.customer);
        if (customer.email) await addPro(customer.email);
        break;
      }
      case "customer.subscription.deleted": {
        const sub: any = event.data.object;
        const customer: any = await stripe.customers.retrieve(sub.customer);
        if (customer.email) await removePro(customer.email);
        break;
      }
    }
  } catch (err: any) {
    console.error("Webhook internal error:", err);
    return res.status(500).send("Internal Error");
  }

  return res.json({ received: true });
}
