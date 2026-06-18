"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Bot as BotType } from "@chatforge/shared";
import { Icon } from "@/src/components/Icon";

interface Billing {
  plan: string;
  limits: { maxMonthlyMessages: number };
  usage: { bots: number; sources: number; monthlyMessages: number };
}

const BAR_HEIGHTS = ["30%", "45%", "40%", "60%", "55%", "75%", "65%", "90%"];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun", "Today"];
const BOT_ICONS = ["support_agent", "shopping_cart", "auto_stories"];
const BOT_TINTS = ["text-primary", "text-secondary", "text-tertiary"];

export default function OverviewPage() {
  const [bots, setBots] = useState<BotType[]>([]);
  const [billing, setBilling] = useState<Billing | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [b, bill] = await Promise.all([fetch("/api/bots"), fetch("/api/billing")]);
      if (b.ok) setBots((await b.json()).bots);
      if (bill.ok) setBilling(await bill.json());
      setLoading(false);
    })();
  }, []);

  const total = bots.length;
  const active = bots.filter((b) => b.status === "active").length;
  const drafts = bots.filter((b) => b.status === "draft").length;
  const docs = billing?.usage.sources ?? 0;
  const msgs = billing?.usage.monthlyMessages ?? 0;
  const maxMsgs = billing?.limits.maxMonthlyMessages ?? 0;
  const usagePct = maxMsgs > 0 ? Math.min(100, Math.round((msgs / maxMsgs) * 100)) : 0;
  const dash = loading ? "…" : undefined;

  return (
    <div className="space-y-lg pb-xl">
      {/* KPI cards */}
      <section className="grid grid-cols-1 gap-gutter md:grid-cols-2 lg:grid-cols-4">
        <div className="glass-card group flex cursor-default flex-col justify-between p-lg transition-all hover:border-primary/30">
          <div className="mb-4 flex items-start justify-between">
            <span className="font-label-caps text-[10px] uppercase tracking-widest text-on-surface-variant">
              Total Chatbots
            </span>
            <div className="rounded-lg bg-primary/10 p-2 transition-colors group-hover:bg-primary/20">
              <Icon name="smart_toy" className="text-xl text-primary" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-label-mono text-display leading-none">{dash ?? total}</span>
            <span className="text-body-sm text-on-surface-variant">{active} active</span>
          </div>
          <div className="mt-4 flex items-center gap-2 text-xs text-on-surface-variant">
            <Icon name="trending_up" className="text-sm text-emerald-400" />
            <span className="text-emerald-400">{drafts} in draft</span>
          </div>
        </div>

        <div className="glass-card group flex cursor-default flex-col justify-between p-lg transition-all hover:border-primary/30">
          <div className="mb-4 flex items-start justify-between">
            <span className="font-label-caps text-[10px] uppercase tracking-widest text-on-surface-variant">
              Documents Indexed
            </span>
            <div className="rounded-lg bg-secondary/10 p-2 transition-colors group-hover:bg-secondary/20">
              <Icon name="description" className="text-xl text-secondary" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-label-mono text-display leading-none">
              {dash ?? docs.toLocaleString()}
            </span>
          </div>
          <p className="mt-4 text-xs text-on-surface-variant">across all bots</p>
        </div>

        <div className="glass-card group flex cursor-default flex-col justify-between p-lg transition-all hover:border-primary/30">
          <div className="mb-4 flex items-start justify-between">
            <span className="font-label-caps text-[10px] uppercase tracking-widest text-on-surface-variant">
              Monthly Messages
            </span>
            <div className="rounded-lg bg-tertiary/10 p-2 transition-colors group-hover:bg-tertiary/20">
              <Icon name="forum" className="text-xl text-tertiary" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-label-mono text-display leading-none">
              {dash ?? msgs.toLocaleString()}
            </span>
          </div>
          <p className="mt-4 text-xs text-on-surface-variant capitalize">{billing?.plan} plan</p>
        </div>

        <div className="glass-card group relative flex cursor-default flex-col justify-between overflow-hidden p-lg">
          <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-primary/5 blur-2xl" />
          <div className="mb-4 flex items-start justify-between">
            <span className="font-label-caps text-[10px] uppercase tracking-widest text-on-surface-variant">
              Message Usage
            </span>
            <div className="rounded-lg bg-error-container/20 p-2">
              <Icon name="bolt" className="text-xl text-primary" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-label-mono text-display leading-none text-primary">
              {dash ?? `${usagePct}%`}
            </span>
            <span className="text-[10px] text-on-surface-variant">
              OF {billing?.plan?.toUpperCase()} PLAN
            </span>
          </div>
          <div className="mt-4 space-y-2">
            <div className="h-1 w-full overflow-hidden rounded-full bg-surface-container-highest">
              <div
                className="relative h-full bg-primary"
                style={{ width: `${usagePct}%` }}
              >
                <div className="absolute inset-0 animate-pulse bg-white/20" />
              </div>
            </div>
            <p className="text-center text-[10px] text-on-surface-variant">
              {msgs.toLocaleString()} / {maxMsgs.toLocaleString()} messages
            </p>
          </div>
        </div>
      </section>

      {/* Chart + top bots */}
      <section className="grid grid-cols-1 gap-gutter lg:grid-cols-3">
        <div className="glass-card relative flex min-h-[450px] flex-col gap-lg p-xl lg:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-headline-md text-headline-md text-on-surface">
                Conversations over time
              </h3>
              <p className="text-body-sm text-on-surface-variant">
                Aggregate volume across all active bots
              </p>
            </div>
            <div className="linear-border flex rounded-lg bg-surface-container-high p-1">
              <button className="rounded-md px-3 py-1 text-xs font-medium hover:bg-surface-bright">
                Day
              </button>
              <button className="rounded-md bg-surface-bright px-3 py-1 text-xs font-medium text-on-surface shadow-sm">
                Week
              </button>
              <button className="rounded-md px-3 py-1 text-xs font-medium hover:bg-surface-bright">
                Month
              </button>
            </div>
          </div>
          <div className="group relative w-full flex-1">
            <div className="absolute inset-0 flex items-end justify-between gap-2 px-2 pb-8">
              {BAR_HEIGHTS.map((h, i) => (
                <div
                  key={i}
                  className="w-full rounded-t-sm bg-primary/20 transition-all duration-500 hover:bg-primary/40"
                  style={{ height: h }}
                />
              ))}
            </div>
            <div className="pointer-events-none absolute inset-0 flex flex-col justify-between border-b border-outline-variant py-2">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-px w-full border-t border-dashed border-outline-variant/30" />
              ))}
            </div>
          </div>
          <div className="mt-4 flex justify-between font-label-mono text-[10px] uppercase tracking-widest text-on-surface-variant">
            {DAYS.map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
        </div>

        {/* Top bots */}
        <div className="glass-card flex flex-col gap-xl p-xl">
          <div className="flex items-center justify-between">
            <h3 className="font-headline-md text-headline-md text-on-surface">Top Bots</h3>
            <Link href="/dashboard/bots" className="text-xs text-primary hover:underline">
              View all
            </Link>
          </div>
          <div className="space-y-gutter">
            {loading ? (
              <p className="text-body-sm text-on-surface-variant">Loading…</p>
            ) : bots.length === 0 ? (
              <p className="text-body-sm text-on-surface-variant">No chatbots yet.</p>
            ) : (
              bots.slice(0, 3).map((bot, i) => (
                <Link
                  key={bot.id}
                  href={`/dashboard/bots/${bot.id}`}
                  className="group flex cursor-pointer items-center gap-md"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/5 bg-surface-container-high transition-all group-hover:border-primary/50">
                    <Icon name={BOT_ICONS[i]} filled className={BOT_TINTS[i]} />
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <p className="truncate text-body-md text-on-surface">{bot.name}</p>
                    <p className="font-label-mono text-xs text-on-surface-variant">
                      {bot.publicKey}
                    </p>
                  </div>
                  <p className="text-xs font-bold text-on-surface-variant">#{i + 1}</p>
                </Link>
              ))
            )}
          </div>
        </div>
      </section>

      {/* Recent activity + quick access */}
      <section className="grid grid-cols-1 gap-gutter lg:grid-cols-3">
        <div className="glass-card p-xl lg:col-span-2">
          <div className="mb-xl flex items-center justify-between">
            <h3 className="font-headline-md text-headline-md text-on-surface">Recent Activity</h3>
            <div className="flex items-center gap-2 text-xs text-on-surface-variant">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
              Indexing Live
            </div>
          </div>
          <div className="space-y-sm">
            {loading || bots.length === 0 ? (
              <p className="text-body-sm text-on-surface-variant">No recent activity.</p>
            ) : (
              bots.slice(0, 4).map((bot) => (
                <Link
                  key={bot.id}
                  href={`/dashboard/bots/${bot.id}`}
                  className="flex gap-md rounded-xl border border-transparent p-md transition-colors hover:border-white/5 hover:bg-surface-container-high"
                >
                  <Icon name="smart_toy" className="mt-1 text-primary" />
                  <div className="flex-1">
                    <div className="flex justify-between">
                      <p className="text-body-md text-on-surface">
                        {bot.name}{" "}
                        <span className="text-sm text-on-surface-variant">
                          — {bot.status === "active" ? "Live" : "Draft"}
                        </span>
                      </p>
                    </div>
                    <p className="mt-1 font-label-mono text-sm text-on-surface-variant">
                      {bot.model}
                    </p>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>

        <div className="space-y-gutter">
          <div className="glass-card border-primary-container/20 bg-primary-container/10 p-xl">
            <h3 className="mb-2 font-headline-md text-on-primary">Need help?</h3>
            <p className="mb-lg text-sm text-on-surface-variant">
              Read the docs or open the playground to test your bots before going live.
            </p>
            <Link
              href="/dashboard/bots"
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary-container py-3 font-bold text-on-primary-container transition-all hover:opacity-90"
            >
              <Icon name="rocket_launch" />
              Go to Chatbots
            </Link>
          </div>
          <div className="glass-card p-xl">
            <h4 className="mb-lg font-label-caps text-xs uppercase tracking-widest text-on-surface-variant">
              Quick Access
            </h4>
            <div className="grid grid-cols-2 gap-md">
              <QuickTile href="/dashboard/knowledge" icon="database" tint="text-primary" label="Knowledge" />
              <QuickTile href="/dashboard/history" icon="chat" tint="text-secondary" label="Conversations" />
              <QuickTile href="/dashboard/analytics" icon="monitoring" tint="text-tertiary" label="Analytics" />
              <QuickTile href="/dashboard/settings" icon="settings" tint="text-on-surface-variant" label="Settings" />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function QuickTile({
  href,
  icon,
  tint,
  label,
}: {
  href: string;
  icon: string;
  tint: string;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col items-start gap-2 rounded-xl border border-white/5 bg-surface-container-high p-4 transition-all hover:bg-surface-bright"
    >
      <Icon name={icon} className={`${tint} transition-transform group-hover:scale-110`} />
      <span className="text-xs font-bold">{label}</span>
    </Link>
  );
}
