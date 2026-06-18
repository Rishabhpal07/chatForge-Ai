"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { FileText, Search, Database, Plus } from "lucide-react";
import { Card, Label, StatusBadge, ButtonLink } from "@/src/components/ui";

interface KbSource {
  id: string;
  botId: string;
  botName: string;
  type: string;
  uri: string;
  status: string;
  bytes: number | null;
  createdAt: string;
}

function formatBytes(b: number | null): string {
  if (!b) return "—";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

export default function KnowledgePage() {
  const [sources, setSources] = useState<KbSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/sources");
      if (res.ok) setSources((await res.json()).sources);
      setLoading(false);
    })();
  }, []);

  const stats = useMemo(
    () => ({
      total: sources.length,
      ready: sources.filter((s) => s.status === "ready").length,
      processing: sources.filter((s) => s.status === "pending" || s.status === "processing")
        .length,
      error: sources.filter((s) => s.status === "error").length,
    }),
    [sources],
  );

  const filtered = useMemo(
    () =>
      sources.filter(
        (s) =>
          s.uri.toLowerCase().includes(q.toLowerCase()) ||
          s.botName.toLowerCase().includes(q.toLowerCase()),
      ),
    [sources, q],
  );

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-ink">Knowledge Base</h1>
          <p className="mt-1 text-sm text-ink-muted">
            All data sources powering your AI models, across every bot.
          </p>
        </div>
        <ButtonLink href="/dashboard/bots">
          <Plus className="h-4 w-4" /> Add source
        </ButtonLink>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
        {[
          { label: "Total documents", value: stats.total },
          { label: "Trained", value: stats.ready },
          { label: "Processing", value: stats.processing },
          { label: "Failed", value: stats.error },
        ].map((s) => (
          <Card key={s.label} className="p-6">
            <Label>{s.label}</Label>
            <p className="mt-2 text-3xl font-bold tracking-tight text-ink">
              {loading ? "…" : s.value}
            </p>
          </Card>
        ))}
      </div>

      {/* Documents table */}
      <Card className="p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-ink">Uploaded documents</h2>
          <div className="relative w-64 max-w-full">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search files or bots…"
              className="w-full rounded-lg border border-line bg-surface-card py-2 pl-9 pr-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
            />
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-ink-muted">Loading…</p>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <Database className="h-8 w-8 text-ink-muted" />
            <p className="text-sm text-ink-muted">
              {sources.length === 0
                ? "No sources yet — add documents from a bot's page."
                : "No matches."}
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-line">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-muted text-left">
                  <th className="label-mono px-4 py-2 text-[11px] text-ink-muted">Filename</th>
                  <th className="label-mono px-4 py-2 text-[11px] text-ink-muted">Bot</th>
                  <th className="label-mono px-4 py-2 text-[11px] text-ink-muted">Type</th>
                  <th className="label-mono px-4 py-2 text-[11px] text-ink-muted">Size</th>
                  <th className="label-mono px-4 py-2 text-right text-[11px] text-ink-muted">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filtered.map((s) => (
                  <tr key={s.id} className="hover:bg-surface-hover">
                    <td className="max-w-0 px-4 py-3">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 shrink-0 text-ink-muted" />
                        <span className="truncate text-ink">{s.uri}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/dashboard/bots/${s.botId}`}
                        className="text-brand hover:underline"
                      >
                        {s.botName}
                      </Link>
                    </td>
                    <td className="px-4 py-3 uppercase text-ink-muted">{s.type}</td>
                    <td className="px-4 py-3 text-ink-muted">{formatBytes(s.bytes)}</td>
                    <td className="px-4 py-3 text-right">
                      <StatusBadge status={s.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
