"use client";

import { Fragment, use, useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Upload,
  Globe,
  FileText,
  Send,
  Power,
  Save,
  Copy,
  Check,
  Trash2,
  CircleStop,
} from "lucide-react";
import type { Bot, Source } from "@chatforge/shared";
import { Card, Button, StatusBadge, Label } from "@/src/components/ui";
import { Markdown } from "@/src/components/Markdown";

const AI_URL = process.env.NEXT_PUBLIC_AI_SERVICE_URL ?? "http://localhost:8000";

const MODELS = [
  { id: "openai/gpt-oss-20b:free", label: "GPT-OSS 20B (free)" },
  { id: "meta-llama/llama-3.3-70b-instruct:free", label: "Llama 3.3 70B (free)" },
  { id: "anthropic/claude-haiku-4.5", label: "Claude Haiku 4.5 (paid)" },
  { id: "anthropic/claude-sonnet-4.6", label: "Claude Sonnet 4.6 (paid)" },
];

export default function BotDetailPage({
  params,
}: {
  params: Promise<{ botId: string }>;
}) {
  const { botId } = use(params);
  const [bot, setBot] = useState<Bot | null>(null);
  const [sources, setSources] = useState<Source[]>([]);

  const loadBot = useCallback(async () => {
    const res = await fetch(`/api/bots/${botId}`);
    if (res.ok) setBot((await res.json()).bot);
  }, [botId]);

  const loadSources = useCallback(async () => {
    const res = await fetch(`/api/sources?botId=${botId}`);
    if (res.ok) setSources((await res.json()).sources);
  }, [botId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadBot();
    loadSources();
  }, [loadBot, loadSources]);

  useEffect(() => {
    const active = sources.some(
      (s) => s.status === "pending" || s.status === "processing" || s.status === "partially_ready",
    );
    if (!active) return;
    const id = setInterval(loadSources, 3000);
    return () => clearInterval(id);
  }, [sources, loadSources]);

  if (!bot) return <p className="text-sm text-ink-muted">Loading…</p>;

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div>
        <Link
          href="/dashboard/bots"
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" /> My Chatbots
        </Link>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight text-ink">{bot.name}</h1>
            <StatusBadge status={bot.status} />
          </div>
          <div className="flex items-center gap-2">
            <ActivateButton bot={bot} onChange={loadBot} />
            <DeleteBotButton botId={botId} name={bot.name} />
          </div>
        </div>
        <p className="mt-1 font-mono text-xs text-ink-muted">{bot.publicKey}</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <KnowledgeSection botId={botId} sources={sources} onChange={loadSources} />
          <SettingsSection bot={bot} onSaved={loadBot} />
        </div>
        <div className="flex flex-col gap-6">
          <Playground publicKey={bot.publicKey} />
          <EmbedSection publicKey={bot.publicKey} />
        </div>
      </div>
    </div>
  );
}

function ActivateButton({ bot, onChange }: { bot: Bot; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const active = bot.status === "active";
  async function toggle() {
    setBusy(true);
    await fetch(`/api/bots/${bot.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: active ? "draft" : "active" }),
    });
    await onChange();
    setBusy(false);
  }
  return (
    <Button variant={active ? "ghost" : "primary"} onClick={toggle} disabled={busy}>
      <Power className="h-4 w-4" />
      {active ? "Deactivate" : "Activate bot"}
    </Button>
  );
}

function DeleteBotButton({ botId, name }: { botId: string; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (
      !window.confirm(
        `Delete "${name}"? This permanently removes the bot and all its sources, ` +
        `documents, conversations, and indexed data. This cannot be undone.`,
      )
    )
      return;
    setBusy(true);
    const res = await fetch(`/api/bots/${botId}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/dashboard/bots");
      router.refresh();
    } else {
      setBusy(false);
      window.alert(`Delete failed (${res.status}).`);
    }
  }

  return (
    <button
      onClick={remove}
      disabled={busy}
      className="inline-flex items-center justify-center gap-2 rounded-xl border border-error/40 px-4 py-2.5 text-body-sm font-bold text-error transition-all hover:bg-error/10 active:scale-95 disabled:pointer-events-none disabled:opacity-50"
    >
      <Trash2 className="h-4 w-4" />
      {busy ? "Deleting…" : "Delete"}
    </button>
  );
}

function KnowledgeSection({
  botId,
  sources,
  onChange,
}: {
  botId: string;
  sources: Source[];
  onChange: () => void;
}) {
  const [url, setUrl] = useState("");
  const [deepCrawl, setDeepCrawl] = useState(false);
  const [crawlMode, setCrawlMode] = useState<"quick" | "standard" | "full">("standard");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // Per-source baseline (first in-progress observation) → ETA = remaining / crawl-rate.
  // Computed in an effect (on each poll) and stored in state, so render stays ref-free.
  const etaBase = useRef<Record<string, { p: number; t: number }>>({});
  const [etaLabels, setEtaLabels] = useState<Record<string, string>>({});

  useEffect(() => {
    const now = Date.now();
    const labels: Record<string, string> = {};
    for (const s of sources) {
      const active = s.status === "processing" || s.status === "partially_ready";
      const total = s.totalPages ?? 0;
      const done = s.processedPages ?? 0;
      if (!active || total <= 0) {
        delete etaBase.current[s.id];
        continue;
      }
      if (!etaBase.current[s.id]) etaBase.current[s.id] = { p: done, t: now };
      const base = etaBase.current[s.id];
      const dp = done - base.p;
      const dt = (now - base.t) / 1000;
      if (done >= total) continue;
      if (dp <= 0 || dt < 1.5) {
        labels[s.id] = "estimating…";
      } else {
        const secs = Math.round((total - done) / (dp / dt));
        labels[s.id] = secs < 60 ? `≈ ${secs}s remaining` : `≈ ${Math.ceil(secs / 60)} min remaining`;
      }
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEtaLabels(labels);
  }, [sources]);

  async function uploadFile(file: File) {
    setBusy(true);
    setError(null);
    try {
      const presign = await fetch("/api/sources/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          botId,
          filename: file.name,
          contentType: file.type || "application/octet-stream",
          bytes: file.size,
        }),
      });
      if (!presign.ok) throw new Error(`presign failed (${presign.status})`);
      const { uploadUrl, sourceId } = await presign.json();
      const put = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!put.ok) throw new Error(`upload failed (${put.status})`);
      const ingest = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceId }),
      });
      if (!ingest.ok) throw new Error(`ingest failed (${ingest.status})`);
      onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function addUrl(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const isSitemap = /sitemap.*\.xml($|\?)/i.test(url.trim());
      const res = await fetch("/api/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          botId,
          type: isSitemap ? "sitemap" : "url",
          uri: url.trim(),
          deepCrawl: isSitemap ? undefined : deepCrawl,
          crawlMode,
        }),
      });
      if (!res.ok) throw new Error(`add url failed (${res.status})`);
      setUrl("");
      setDeepCrawl(false);
      onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function stopSource(id: string) {
    setActingId(id);
    await fetch(`/api/sources/${id}`, { method: "PATCH" });
    await onChange();
    setActingId(null);
  }

  async function deleteSource(id: string, uri: string) {
    if (!window.confirm(`Delete "${uri}" and everything indexed from it? This can't be undone.`))
      return;
    setActingId(id);
    const res = await fetch(`/api/sources/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setActingId(null);
      window.alert(`Delete failed (${res.status}).`);
      return;
    }
    await onChange();
    setActingId(null);
  }

  return (
    <Card className="p-6">
      <h2 className="mb-1 text-lg font-semibold text-ink">Knowledge base</h2>
      <p className="mb-4 text-sm text-ink-muted">Data sources that power this bot&rsquo;s answers.</p>

      {/* Add source */}
      <div className="mb-5 flex flex-col gap-3">
        <button
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-line bg-surface-muted py-8 text-center transition-colors hover:border-brand disabled:opacity-50"
        >
          <Upload className="h-6 w-6 text-ink-muted" />
          <span className="text-sm font-medium text-ink">Drag &amp; drop or click to upload</span>
          <span className="text-xs text-ink-muted">PDF, DOCX, TXT up to 50MB</span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.docx,.txt"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0])}
        />
        <form onSubmit={addUrl} className="flex flex-col gap-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Globe className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com/page or .../sitemap.xml"
                className="w-full rounded-lg border border-line bg-surface-card py-2 pl-9 pr-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
              />
            </div>
            <Button type="submit" variant="ghost" disabled={busy}>
              Crawl URL
            </Button>
          </div>
          <label className="flex items-center gap-2 text-xs text-ink-muted">
            <input
              type="checkbox"
              checked={deepCrawl}
              onChange={(e) => setDeepCrawl(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-line accent-brand"
            />
            Crawl the whole site — automatically finds the site&rsquo;s sitemap for an exact
            page count, or follows internal links if there isn&rsquo;t one.
          </label>
          <label className="flex items-center gap-2 text-xs text-ink-muted">
            <span className="shrink-0">Crawl scope:</span>
            <select
              value={crawlMode}
              onChange={(e) => setCrawlMode(e.target.value as "quick" | "standard" | "full")}
              className="rounded-lg border border-line bg-surface-card px-2 py-1 text-xs text-ink outline-none focus:border-brand"
            >
              <option value="quick">Quick (~50 pages — fastest)</option>
              <option value="standard">Standard (~500 pages)</option>
              <option value="full">Full (all pages)</option>
            </select>
            <span className="text-ink-muted/70">Applies to sitemap / whole-site crawls.</span>
          </label>
        </form>
        {error && <p className="text-sm text-rose-600">{error}</p>}
      </div>

      {/* Sources table */}
      {sources.length === 0 ? (
        <p className="text-sm text-ink-muted">No sources yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full min-w-[34rem] text-sm">
            <thead>
              <tr className="bg-surface-muted text-left">
                <th className="label-mono px-4 py-2 text-[11px] text-ink-muted">Filename</th>
                <th className="label-mono px-4 py-2 text-[11px] text-ink-muted">Type</th>
                <th className="label-mono px-4 py-2 text-right text-[11px] text-ink-muted">
                  Status
                </th>
                <th className="label-mono px-4 py-2 text-right text-[11px] text-ink-muted">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {sources.map((s) => {
                const inProgress = s.status === "processing" || s.status === "partially_ready";
                const total = s.totalPages ?? 0;
                const pct = total > 0 ? Math.round(((s.processedPages ?? 0) / total) * 100) : 0;
                return (
                  <Fragment key={s.id}>
                    <tr>
                      <td className="max-w-0 px-4 py-3">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 shrink-0 text-ink-muted" />
                          <span className="truncate text-ink">{s.uri}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 uppercase text-ink-muted">{s.type}</td>
                      <td className="px-4 py-3 text-right">
                        <StatusBadge status={s.status} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {(inProgress || s.status === "pending") && (
                            <button
                              onClick={() => stopSource(s.id)}
                              disabled={actingId === s.id}
                              title="Stop crawling (keep pages indexed so far)"
                              className="rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-amber-500/10 hover:text-amber-400 disabled:opacity-40"
                            >
                              <CircleStop className="h-4 w-4" />
                            </button>
                          )}
                          <button
                            onClick={() => deleteSource(s.id, s.uri)}
                            disabled={actingId === s.id}
                            title="Delete source and its indexed data"
                            className="rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-error/10 hover:text-error disabled:opacity-40"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {inProgress && total > 0 && (
                      <tr>
                        <td colSpan={4} className="px-4 pb-3">
                          <div className="mb-1 flex items-center justify-between text-[11px]">
                            <span className="font-medium text-ink">
                              Crawled {s.processedPages ?? 0} of {total} pages
                              <span className="text-ink-muted"> · {pct}%</span>
                            </span>
                            <span className="text-ink-muted">{etaLabels[s.id] ?? ""}</span>
                          </div>
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
                            <div
                              className="h-full rounded-full bg-brand transition-all duration-500"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          {s.status === "partially_ready" && (
                            <p className="mt-1 text-[11px] text-blue-300">
                              ✓ Bot available now — indexing the remaining pages in the
                              background…
                            </p>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function SettingsSection({ bot, onSaved }: { bot: Bot; onSaved: () => void }) {
  const [model, setModel] = useState(bot.model);
  const [systemPrompt, setSystemPrompt] = useState(bot.systemPrompt);
  const [domains, setDomains] = useState((bot.allowedDomains ?? []).join(", "));
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setSaved(false);
    await fetch(`/api/bots/${bot.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        systemPrompt,
        allowedDomains: domains.split(",").map((d) => d.trim()).filter(Boolean),
      }),
    });
    setBusy(false);
    setSaved(true);
    onSaved();
  }

  return (
    <Card className="p-6">
      <h2 className="mb-4 text-lg font-semibold text-ink">Configuration</h2>
      <form onSubmit={save} className="flex flex-col gap-4">
        {/* <div>
          <Label>Model</Label>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full rounded-lg border border-line bg-surface-card px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
          >
            {MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
            {!MODELS.some((m) => m.id === model) && <option value={model}>{model}</option>}
          </select>
        </div> */}
        <div>
          <Label>System prompt</Label>
          <textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            rows={4}
            placeholder="Extra instructions for how the bot should respond…"
            className="w-full rounded-lg border border-line bg-surface-card px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
          />
        </div>
        <div>
          <Label>Allowed domains (comma-separated)</Label>
          <input
            value={domains}
            onChange={(e) => setDomains(e.target.value)}
            placeholder="example.com, app.example.com (empty = any)"
            className="w-full rounded-lg border border-line bg-surface-card px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
          />
        </div>
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={busy}>
            <Save className="h-4 w-4" /> {busy ? "Saving…" : "Save changes"}
          </Button>
          {saved && <span className="text-sm text-emerald-600">Saved</span>}
        </div>
      </form>
    </Card>
  );
}

function Playground({ publicKey }: { publicKey: string }) {
  const [input, setInput] = useState("");
  const [answer, setAnswer] = useState("");
  const [streaming, setStreaming] = useState(false);
  const visitorId = useRef(`dash-${useId()}`);

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || streaming) return;
    setStreaming(true);
    setAnswer("");
    const question = input;
    setInput("");
    try {
      const res = await fetch(`${AI_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          public_key: publicKey,
          visitor_id: visitorId.current,
          message: question,
        }),
      });
      if (!res.ok || !res.body) {
        setAnswer(`Error: ${res.status}`);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (; ;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const evt = JSON.parse(line.slice(6));
          if (evt.type === "token") setAnswer((a) => a + evt.text);
          if (evt.type === "error") setAnswer((a) => (a ? a + "\n\n" : "") + (evt.message ?? "Something went wrong. Please try again."));
        }
      }
    } finally {
      setStreaming(false);
    }
  }

  return (
    <Card className="flex flex-col p-6">
      <h2 className="mb-4 text-lg font-semibold text-ink">Test chat</h2>
      <div className="mb-3 min-h-[120px] rounded-lg border border-line bg-surface-muted p-3 text-sm text-ink">
        {streaming && !answer ? (
          <div className="flex items-center gap-2 text-ink-muted">
            <span className="flex gap-1">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand [animation-delay:-0.3s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand [animation-delay:-0.15s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand" />
            </span>
            <span className="text-xs">Thinking&hellip;</span>
          </div>
        ) : answer ? (
          <>
            <Markdown content={answer} />
            {streaming && (
              <span className="ml-0.5 inline-block h-3.5 w-0.5 animate-pulse bg-brand align-middle" />
            )}
          </>
        ) : (
          <span className="text-ink-muted">Ask a question to preview your bot&rsquo;s answers.</span>
        )}
      </div>
      <form onSubmit={ask} className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message…"
          className="flex-1 rounded-lg border border-line bg-surface-card px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
        />
        <Button type="submit" disabled={streaming} className="px-3">
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </Card>
  );
}

function EmbedSection({ publicKey }: { publicKey: string }) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const scriptSnippet = `<script src="${origin}/widget.js" data-bot="${publicKey}" async></script>`;
  const reactSnippet = `import { useEffect } from "react";

export function ChatForgeWidget() {
  useEffect(() => {
    const s = document.createElement("script");
    s.src = "${origin}/widget.js";
    s.dataset.bot = "${publicKey}";
    s.async = true;
    document.body.appendChild(s);
    return () => { s.remove(); };
  }, []);
  return null;
}`;

  return (
    <Card className="p-6">
      <h2 className="mb-1 text-lg font-semibold text-ink">Embed widget</h2>
      <p className="mb-4 text-sm text-ink-muted">
        Add your chatbot to any site with one of these snippets.
      </p>
      <div className="flex flex-col gap-4">
        <EmbedSnippet label="HTML — paste before </body>" code={scriptSnippet} />
        <EmbedSnippet label="React / Next.js — add the component once" code={reactSnippet} />
      </div>
    </Card>
  );
}

function EmbedSnippet({ label, code }: { label: string; code: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-medium text-ink-muted">{label}</p>
      <div className="relative">
        <button
          onClick={copy}
          className="absolute right-2 top-2 z-10 rounded-lg bg-white/5 p-1.5 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          aria-label="Copy snippet"
        >
          {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
        </button>
        <pre className="overflow-x-auto rounded-lg border border-line p-3 pr-12 font-mono text-xs text-white">
          {code}
        </pre>
      </div>
    </div>
  );
}
