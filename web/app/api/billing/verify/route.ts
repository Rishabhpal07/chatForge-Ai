import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PLAN_PRICE_PAISE, getOrder, verifyCheckoutSignature } from "@/src/lib/razorpay";
import { requireTenant } from "@/src/lib/auth";
import { handle } from "@/src/lib/api";
import { activatePlan } from "@/src/lib/billing";
import { planSchema } from "@chatforge/shared";

const schema = z.object({
  razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
});

// POST /api/billing/verify — used by Razorpay Checkout's browser callback.
// This is especially useful in local dev, where Razorpay webhooks cannot reach localhost.
export async function POST(req: NextRequest): Promise<Response> {
  return handle(async () => {
    const { tenantId } = await requireTenant();
    const body = schema.parse(await req.json());

    const valid = verifyCheckoutSignature({
      orderId: body.razorpay_order_id,
      paymentId: body.razorpay_payment_id,
      signature: body.razorpay_signature,
    });
    if (!valid) {
      return NextResponse.json({ error: "invalid payment signature" }, { status: 400 });
    }

    const order = await getOrder(body.razorpay_order_id);
    const notes = order.notes ?? {};
    const planResult = planSchema.safeParse(notes.plan);
    if (notes.tenantId !== tenantId || !planResult.success || planResult.data === "free") {
      return NextResponse.json({ error: "order does not match this tenant" }, { status: 400 });
    }

    const plan = planResult.data;
    if (order.amount !== PLAN_PRICE_PAISE[plan]) {
      return NextResponse.json({ error: "order amount does not match plan" }, { status: 400 });
    }

    await activatePlan({
      tenantId,
      plan,
      actor: "razorpay",
      meta: {
        source: "checkout.verify",
        orderId: body.razorpay_order_id,
        paymentId: body.razorpay_payment_id,
      },
    });

    return NextResponse.json({ ok: true, plan });
  });
}
