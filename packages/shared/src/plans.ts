import { z } from "zod";

export const planSchema = z.enum(["free", "pro", "scale"]);
export type Plan = z.infer<typeof planSchema>;

/** Hard limits enforced per billing period. Stored on `subscriptions.limits`. */
export const planLimitsSchema = z.object({
  maxBots: z.number().int(),
  maxSources: z.number().int(),
  maxMonthlyMessages: z.number().int(),
  maxStorageBytes: z.number().int(),
});
export type PlanLimits = z.infer<typeof planLimitsSchema>;

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: {
    maxBots: 1,
    maxSources: 3,
    maxMonthlyMessages: 20,
    maxStorageBytes: 10 * 1024 * 1024, // 100 MB
  },
  pro: {
    maxBots: 5,
    maxSources: 50,
    maxMonthlyMessages: 1000,
    maxStorageBytes: 102 * 1024 * 1024, // 1 GB
  },
  scale: {
    maxBots: 50,
    maxSources: 5_000,
    maxMonthlyMessages: 200_000,
    maxStorageBytes: 50 * 1024 * 1024 * 1024, // 50 GB
  },
};

/**
 * Single source of truth for plan PRICING + display, used by both the marketing
 * landing page and the in-app billing screen so they can never disagree.
 * Prices are INR and match the Razorpay charge (paise = inr * 100).
 */
export const PLAN_PRICE_INR: Record<Plan, number> = { free: 0, pro: 299, scale: 4999 };

const fmt = (n: number) => n.toLocaleString("en-IN");

export interface PlanInfo {
  id: Plan;
  name: string;
  priceInr: number;
  priceLabel: string; // e.g. "₹999"
  period: string;
  features: string[];
}

function planFeatures(plan: Plan, extra: string[]): string[] {
  const l = PLAN_LIMITS[plan];
  return [
    `${l.maxBots} chatbots`,
    `${fmt(l.maxSources)} data sources`,
    `${fmt(l.maxMonthlyMessages)} messages / mo`,
    ...extra,
  ];
}

export const PLAN_INFO: Record<Plan, PlanInfo> = {
  free: {
    id: "free",
    name: "Free",
    priceInr: 0,
    priceLabel: "₹0",
    period: "/mo",
    features: planFeatures("free", ["Community support"]),
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceInr: PLAN_PRICE_INR.pro,
    priceLabel: `₹${fmt(PLAN_PRICE_INR.pro)}`,
    period: "/mo",
    features: planFeatures("pro", ["Advanced analytics", "Custom domains", "Email support"]),
  },
  scale: {
    id: "scale",
    name: "Scale",
    priceInr: PLAN_PRICE_INR.scale,
    priceLabel: `₹${fmt(PLAN_PRICE_INR.scale)}`,
    period: "/mo",
    features: planFeatures("scale", ["API access", "White-labeling", "Priority support"]),
  },
};

/** Ordered list for rendering pricing tables. */
export const PLAN_ORDER: Plan[] = ["free", "pro", "scale"];

export const usageKindSchema = z.enum(["embed", "chat", "ingest"]);
export type UsageKind = z.infer<typeof usageKindSchema>;
