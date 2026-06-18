import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireTenant } from "@/src/lib/auth";
import { handle } from "@/src/lib/api";
import {
  createOrder,
  isBillingConfigured,
  PLAN_PRICE_PAISE,
  publicKeyId,
} from "@/src/lib/razorpay";

const schema = z.object({ plan: z.enum(["pro", "scale"]) });

// POST /api/billing/checkout — create a Razorpay order for a plan upgrade.
// The client opens Razorpay Checkout with the returned order; payment is confirmed
// server-side via the Razorpay webhook (which flips the subscription).
export async function POST(req: NextRequest): Promise<Response> {
  return handle(async () => {
    const { tenantId } = await requireTenant();
    if (!isBillingConfigured()) {
      return NextResponse.json(
        { error: "Billing is not configured (set RAZORPAY_* env vars)." },
        { status: 503 },
      );
    }
    const { plan } = schema.parse(await req.json());
    const order = await createOrder(PLAN_PRICE_PAISE[plan], { tenantId, plan });
    return NextResponse.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: publicKeyId(),
      plan,
    });
  });
}
