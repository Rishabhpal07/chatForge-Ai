"use client";

import { useEffect, useState } from "react";
import { Check, ScrollText } from "lucide-react";
import { Card, Button, Label } from "@/src/components/ui";
import { PLAN_INFO } from "@chatforge/shared";

interface Billing {
  plan: string;
  limits: { maxBots: number; maxSources: number; maxMonthlyMessages: number };
  usage: { bots: number; sources: number; monthlyMessages: number };
  billingConfigured: boolean;
  audit: { id: string; actor: string; action: string; target: string | null; createdAt: string }[];
}

// Derived from the shared PLAN_INFO so prices/features match the marketing landing page.
const PLANS = (["pro", "scale"] as const).map((id) => ({
  id,
  name: PLAN_INFO[id].name,
  price: `${PLAN_INFO[id].priceLabel}${PLAN_INFO[id].period}`,
  perks: PLAN_INFO[id].features,
}));

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

function loadRazorpay(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

export default function SettingsPage() {
  const [data, setData] = useState<Billing | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/billing");
    if (res.ok) setData(await res.json());
  }
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  async function upgrade(plan: "pro" | "scale") {
    setMsg(null);
    const res = await fetch("/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan }),
    });
    if (res.status === 503) {
      setMsg("Billing isn't configured yet (add RAZORPAY_* keys to enable upgrades).");
      return;
    }
    if (!res.ok) {
      setMsg(`Checkout failed (${res.status}).`);
      return;
    }
    const order = await res.json();
    const ok = await loadRazorpay();
    if (!ok || !window.Razorpay) {
      setMsg("Could not load Razorpay checkout.");
      return;
    }
    new window.Razorpay({
      key: order.keyId,
      order_id: order.orderId,
      amount: order.amount,
      currency: order.currency,
      name: "ChatForge AI",
      description: `${plan} plan`,
      handler: async (response: Record<string, string>) => {
        setMsg("Payment received. Verifying your plan…");
        const verify = await fetch("/api/billing/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(response),
        });
        if (!verify.ok) {
          setMsg("Payment received, but verification is pending. Your plan will update after the webhook arrives.");
          setTimeout(load, 3000);
          return;
        }
        await load();
        setMsg("Plan upgraded successfully.");
      },
    }).open();
  }

  const bars = data
    ? [
      { label: "Chatbots", used: data.usage.bots, max: data.limits.maxBots },
      { label: "Sources", used: data.usage.sources, max: data.limits.maxSources },
      {
        label: "Messages (this month)",
        used: data.usage.monthlyMessages,
        max: data.limits.maxMonthlyMessages,
      },
    ]
    : [];

  return (
    <div className="sm:mt-6 md:mt-0 flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-ink">Settings &amp; Billing</h1>
        <p className="mt-1 text-sm text-ink-muted">Your plan, usage, and account activity.</p>
      </div>

      {/* Plan + usage */}
      <Card className="p-6">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <Label>Current plan</Label>
            <p className="text-2xl font-bold capitalize text-ink">{data?.plan ?? "…"}</p>
          </div>
          {!data?.billingConfigured && (
            <span className="label-mono rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-700">
              Billing not configured
            </span>
          )}
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          {bars.map((b) => {
            const pct = b.max > 0 ? Math.min(100, Math.round((b.used / b.max) * 100)) : 0;
            return (
              <div key={b.label}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="text-ink-muted">{b.label}</span>
                  <span className="font-medium text-ink">
                    {b.used} / {b.max}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-surface-hover">
                  <div
                    className={`h-full rounded-full ${pct >= 100 ? "bg-rose-500" : "bg-brand"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Upgrade */}
      <div>
        <h2 className="mb-3 text-lg font-semibold text-ink">Upgrade</h2>
        {msg && <p className="mb-3 text-sm text-amber-700">{msg}</p>}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {PLANS.map((p) => (
            <Card key={p.id} className="flex flex-col p-6">
              <h3 className="text-lg font-semibold text-ink">{p.name}</h3>
              <p className="mt-1 text-2xl font-bold text-ink">{p.price}</p>
              <ul className="mt-4 flex flex-1 flex-col gap-2 text-sm text-ink">
                {p.perks.map((perk) => (
                  <li key={perk} className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-brand" /> {perk}
                  </li>
                ))}
              </ul>
              <Button
                className="mt-5"
                disabled={data?.plan === p.id}
                onClick={() => upgrade(p.id)}
              >
                {data?.plan === p.id ? "Current plan" : `Upgrade to ${p.name}`}
              </Button>
            </Card>
          ))}
        </div>
      </div>

      {/* Audit log */}
      <Card className="p-6">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-ink">
          <ScrollText className="h-5 w-5 text-brand" /> Recent activity
        </h2>
        {!data || data.audit.length === 0 ? (
          <p className="text-sm text-ink-muted">No activity yet.</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {data.audit.map((a) => (
              <li key={a.id} className="flex items-center justify-between py-2">
                <span className="font-mono text-ink">{a.action}</span>
                <span className="text-ink-muted">{new Date(a.createdAt).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
