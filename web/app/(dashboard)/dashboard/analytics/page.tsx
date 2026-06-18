"use client";

import { useEffect, useState } from "react";
import { Bot, MessagesSquare, Users, Zap } from "lucide-react";
import { Card, Label } from "@/src/components/ui";

interface Analytics {
  bots: number;
  activeBots: number;
  conversations: number;
  messages: number;
  perBot: { botId: string; name: string; conversations: number }[];
  usage: { monthlyMessages: number };
  limits: { maxMonthlyMessages: number };
  plan: string;
}

export default function AnalyticsPage() {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/analytics");
      if (res.ok) setData(await res.json());
      setLoading(false);
    })();
  }, []);

  const stats = [
    { label: "Conversations", value: data?.conversations ?? 0, icon: Users },
    { label: "Messages", value: data?.messages ?? 0, icon: MessagesSquare },
    { label: "Active bots", value: data?.activeBots ?? 0, icon: Zap },
    { label: "Total bots", value: data?.bots ?? 0, icon: Bot },
  ];

  const used = data?.usage.monthlyMessages ?? 0;
  const limit = data?.limits.maxMonthlyMessages ?? 0;
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-ink">Analytics</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Conversation volume and usage across your bots.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
        {stats.map(({ label, value, icon: Icon }) => (
          <Card key={label} className="p-6">
            <div className="flex items-start justify-between">
              <Label>{label}</Label>
              <Icon className="h-5 w-5 text-brand" />
            </div>
            <p className="mt-2 text-3xl font-bold tracking-tight text-ink">
              {loading ? "…" : value.toLocaleString()}
            </p>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-2">
          <h2 className="mb-4 text-lg font-semibold text-ink">Conversations by bot</h2>
          {!data || data.perBot.length === 0 ? (
            <p className="text-sm text-ink-muted">No conversations yet.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {data.perBot
                .slice()
                .sort((a, b) => b.conversations - a.conversations)
                .map((row) => {
                  const max = Math.max(...data.perBot.map((r) => r.conversations), 1);
                  return (
                    <li key={row.botId} className="flex items-center gap-3">
                      <span className="w-32 truncate text-sm text-ink">{row.name}</span>
                      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-hover">
                        <div
                          className="h-full rounded-full bg-brand"
                          style={{ width: `${(row.conversations / max) * 100}%` }}
                        />
                      </div>
                      <span className="w-10 text-right text-sm font-medium text-ink">
                        {row.conversations}
                      </span>
                    </li>
                  );
                })}
            </ul>
          )}
        </Card>

        <Card className="p-6">
          <h2 className="mb-1 text-lg font-semibold text-ink">Monthly usage</h2>
          <p className="mb-4 text-sm capitalize text-ink-muted">{data?.plan ?? "free"} plan</p>
          <div className="mb-2 flex items-end justify-between">
            <span className="text-2xl font-bold text-ink">{used.toLocaleString()}</span>
            <span className="text-sm text-ink-muted">/ {limit.toLocaleString()} msgs</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-surface-hover">
            <div
              className={`h-full rounded-full ${pct >= 100 ? "bg-rose-500" : "bg-brand"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-ink-muted">{pct}% of your monthly allowance used</p>
        </Card>
      </div>
    </div>
  );
}
