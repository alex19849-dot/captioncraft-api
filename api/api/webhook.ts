import Stripe from "stripe";
import { NextRequest, NextResponse } from "next/server";

export const config = {
  api: {
    bodyParser: false, // IMPORTANT so Stripe signature works
  },
};

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);

export default async function handler(req: NextRequest) {
  try {
    const sig = req.headers.get("stripe-signature");
    const rawBody = await req.text();

    const event = stripe.webhooks.constructEvent(
      rawBody,
      sig!,
      process.env.STRIPE_WEBHOOK_SECRET as string
    );

    if (event.type === "checkout.session.completed") {
      const session: any = event.data.object;
      const email = session.customer_details.email;

      // save redis here (existing redis code stays same)
      // await kv.sadd("pro_users", email);

      console.log("✅ PRO USER ADDED:", email);
    }

    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error("webhook error:", err);
    return new NextResponse("bad signature", { status: 400 });
  }
}
