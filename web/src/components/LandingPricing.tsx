"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PLAN_ORDER, PLAN_INFO, type Plan } from "@chatforge/shared";
import { Icon } from "./Icon";

// Pricing cards for the landing page. Prices/features come from the SAME shared source
// as the in-app billing screen, and a signed-in visitor sees their current plan marked.
export function LandingPricing() {
  const [currentPlan, setCurrentPlan] = useState<Plan | null>(null);

  useEffect(() => {
    fetch("/api/billing")
      .then(async (r) => {
        if (r.ok) setCurrentPlan(((await r.json()).plan as Plan) ?? null);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="mx-auto grid max-w-5xl grid-cols-1 gap-lg md:grid-cols-3">
      {PLAN_ORDER.map((id) => {
        const p = PLAN_INFO[id];
        const accent = id === "pro";
        const isCurrent = currentPlan === id;
        const cta = isCurrent
          ? "Current plan"
          : id === "scale"
            ? "Contact Sales"
            : id === "free"
              ? "Get Started"
              : "Upgrade to Pro";
        // Signed-in visitors go to billing; signed-out go to sign-up.
        const href = currentPlan ? "/dashboard/billing" : "/sign-up";
        return (
          <div
            key={id}
            className={`glass-card relative flex flex-col rounded-3xl p-2xl ${
              accent ? "scale-105 bg-surface-container ring-1 ring-primary/20" : ""
            }`}
            style={accent ? { borderColor: "rgba(195,192,255,0.4)" } : undefined}
          >
            {accent && !isCurrent && (
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 rounded-full bg-primary px-lg py-xs font-label-caps text-on-primary">
                Most Popular
              </div>
            )}
            {isCurrent && (
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 rounded-full bg-emerald-500 px-lg py-xs font-label-caps text-white">
                Your plan
              </div>
            )}
            <div className="mb-xl">
              <h4 className={`mb-xs font-label-caps ${accent ? "text-primary" : "text-on-surface-variant"}`}>
                {p.name}
              </h4>
              <div className="flex items-baseline gap-1">
                <span className="font-display text-headline-lg">{p.priceLabel}</span>
                <span className="font-body-sm text-on-surface-variant">{p.period}</span>
              </div>
            </div>
            <ul className="mb-3xl flex-grow space-y-md">
              {p.features.map((f) => (
                <li key={f} className="flex items-center gap-sm font-body-sm">
                  <Icon name="check_circle" className="text-lg text-primary" />
                  {f}
                </li>
              ))}
            </ul>
            <Link
              href={href}
              aria-disabled={isCurrent}
              className={`w-full rounded-xl py-md text-center font-bold transition-all ${
                isCurrent
                  ? "pointer-events-none border border-emerald-500/40 text-emerald-400"
                  : accent
                    ? "bg-primary text-on-primary hover:shadow-[0_0_20px_rgba(195,192,255,0.4)]"
                    : "border border-outline-variant hover:bg-surface-container-high"
              }`}
            >
              {cta}
            </Link>
          </div>
        );
      })}
    </div>
  );
}
