import { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: "2022-11-15"
});

async function saveProUser(email: string, data: any) {
  await fetch(process.env.UPSTASH_REDIS_REST_URL as string, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      "SET": {
        key: `prouser:${email}`,
        value: JSON.stringify(data)
      }
    })
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {

  if (req.method === "POST") {
    const sig = req.headers["stripe-signature"] as string;

    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body as any,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET as string
      );
    } catch (err: any) {
      console.error("❌ Webhook signature verify failed:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as any;
      const email = session.customer_details.email;

      const data = {
        email,
        status: "active",
        createdAt: Date.now(),
        subscriptionId: session.subscription
      };

      await saveProUser(email, data);
      console.log("✅ Stored new Pro user:", email);
    }

    if (event.type === "customer.subscription.deleted") {
      const sub = event.data.object as any;
      const email = sub.customer_email;

      const data = {
        email,
        status: "cancelled",
        endedAt: Date.now(),
        subscriptionId: sub.id
      };

      await saveProUser(email, data);
      console.log("⚠️ Pro user cancelled:", email);
    }

    return res.status(200).end();
  }

  return res.status(405).send("Method Not Allowed");
}
