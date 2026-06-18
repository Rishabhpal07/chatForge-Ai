/**
 * Razorpay billing via REST (no SDK dependency). All functions are gated on the
 * RAZORPAY_* env vars so the app runs fine without billing configured.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Plan } from "@chatforge/shared";

const KEY_ID = process.env.RAZORPAY_KEY_ID;
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;

/** Plan prices in the smallest currency unit (paise, INR). */
export const PLAN_PRICE_PAISE: Record<Exclude<Plan, "free">, number> = {
  pro: 100, // ₹999 / mo
  scale: 499900, // ₹4,999 / mo
};

export function isBillingConfigured(): boolean {
  return Boolean(KEY_ID && KEY_SECRET);
}

export function publicKeyId(): string | null {
  return KEY_ID ?? null;
}

export async function createOrder(
  amountPaise: number,
  notes: Record<string, string>,
): Promise<{ id: string; amount: number; currency: string }> {
  if (!isBillingConfigured()) throw new Error("Razorpay not configured");
  const auth = Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString("base64");
  const res = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: JSON.stringify({ amount: amountPaise, currency: "INR", notes }),
  });
  if (!res.ok) throw new Error(`Razorpay order failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function getOrder(orderId: string): Promise<{
  id: string;
  amount: number;
  currency: string;
  notes?: Record<string, string>;
}> {
  if (!isBillingConfigured()) throw new Error("Razorpay not configured");
  const auth = Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString("base64");
  const res = await fetch(`https://api.razorpay.com/v1/orders/${orderId}`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!res.ok) throw new Error(`Razorpay order lookup failed: ${res.status} ${await res.text()}`);
  return res.json();
}

/** Verify the Razorpay Checkout success callback signature. */
export function verifyCheckoutSignature(opts: {
  orderId: string;
  paymentId: string;
  signature: string | null;
}): boolean {
  if (!KEY_SECRET || !opts.signature) return false;
  const expected = createHmac("sha256", KEY_SECRET)
    .update(`${opts.orderId}|${opts.paymentId}`)
    .digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(opts.signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Verify a Razorpay webhook signature against the raw request body. */
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}
