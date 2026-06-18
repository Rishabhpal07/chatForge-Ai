import { NextRequest, NextResponse } from "next/server";
import { planSchema } from "@chatforge/shared";
import { verifyWebhookSignature } from "@/src/lib/razorpay";
import { activatePlan } from "@/src/lib/billing";

type RazorpayEntity = {
  id?: string;
  order_id?: string;
  notes?: Record<string, string>;
};

type RazorpayEvent = {
  event: string;
  payload?: {
    payment?: { entity?: RazorpayEntity };
    order?: { entity?: RazorpayEntity };
  };
};

/**
 * Razorpay webhook. Signature-verified. On a captured payment we read the tenant +
 * plan from the order notes (set at checkout) and activate the subscription.
 */
export async function POST(req: NextRequest): Promise<Response> {
  const raw = await req.text();
  if (!verifyWebhookSignature(raw, req.headers.get("x-razorpay-signature"))) {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  const evt = JSON.parse(raw) as RazorpayEvent;

  if (evt.event === "payment.captured" || evt.event === "order.paid") {
    const payment = evt.payload?.payment?.entity;
    const order = evt.payload?.order?.entity;
    const notes = payment?.notes ?? order?.notes;
    const tenantId = notes?.tenantId;
    const planResult = planSchema.safeParse(notes?.plan);
    if (tenantId && planResult.success && planResult.data !== "free") {
      const plan = planResult.data;
      await activatePlan({
        tenantId,
        actor: "razorpay",
        plan,
        meta: {
          source: "webhook",
          event: evt.event,
          orderId: order?.id ?? payment?.order_id,
          paymentId: payment?.id,
        },
      });
    }
  }

  return NextResponse.json({ ok: true });
}
