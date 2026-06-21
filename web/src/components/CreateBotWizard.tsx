"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  X,
  ArrowRight,
  ArrowLeft,
  Upload,
  Globe,
  FileText,
  Check,
  Copy,
  Send,
  Brain,
  Sparkles,
  Code2,
  Rocket,
} from "lucide-react";
import type { Source } from "@chatforge/shared";
import { Button, StatusBadge } from "@/src/components/ui";
import { Markdown } from "@/src/components/Markdown";

const AI_URL = process.env.NEXT_PUBLIC_AI_SERVICE_URL ?? "http://localhost:8000";

const STEPS = ["Details", "Add data", "Indexing", "Test", "Embed"] as const;
type StepIndex = 0 | 1 | 2 | 3 | 4;

const inputCls =
  "w-full rounded-xl border border-outline-variant bg-surface-container-high px-3 py-2.5 text-body-sm text-on-surface outline-none transition-colors placeholder:text-on-surface-variant/60 focus:border-primary focus:ring-2 focus:ring-primary/20";

export function CreateBotWizard({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const router = useRouter();
  const [step, setStep] = useState<StepIndex>(0);

  // Step 1 — details
  const [name, setName] = useState("");
  const [instructions, setInstructions] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Created bot
  const [botId, setBotId] = useState<string | null>(null);
  const [publicKey, setPublicKey] = useState<string | null>(null);

  // Sources
  const [sources, setSources] = useState<Source[]>([]);

  const loadSources = useCallback(async () => {
    if (!botId) return;
    const res = await fetch(`/api/sources?botId=${botId}`);
    if (res.ok) setSources((await res.json()).sources);
  }, [botId]);

  // Poll while indexing (steps 2 + 3).
  useEffect(() => {
    if (!botId || (step !== 1 && step !== 2)) return;
    const active = sources.some(
      (s) => s.status === "pending" || s.status === "processing" || s.status === "partially_ready",
    );
    if (step === 1 && sources.length === 0) return;
    if (step === 2 && !active) return;
    const id = setInterval(loadSources, 2500);
    return () => clearInterval(id);
  }, [botId, step, sources, loadSources]);

  async function createBotAndNext() {
    if (!name.trim()) {
      setError("Please give your chatbot a name.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // If we already created it (user went back then forward), don't create twice.
      if (botId) {
        setStep(1);
        return;
      }
      const res = await fetch("/api/bots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), systemPrompt: instructions.trim(), status: "active" }),
      });
      if (res.status === 402) throw new Error("Plan limit reached — upgrade to create more bots.");
      if (!res.ok) throw new Error(`Couldn't create the bot (${res.status}).`);
      const { bot } = await res.json();
      setBotId(bot.id);
      setPublicKey(bot.publicKey);
      onCreated(); // refresh the list behind the modal
      setStep(1);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function finish() {
    onClose();
    if (botId) {
      router.push(`/dashboard/bots/${botId}`);
      router.refresh();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="glass-card flex max-h-[90vh] w-full max-w-[44rem] flex-col overflow-hidden rounded-3xl shadow-2xl">
        {/* Header + stepper */}
        <div className="flex items-center justify-between border-b border-white/5 px-6 py-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-container">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <h2 className="font-display text-headline-md font-bold text-on-surface">
              Create Chatbot
            </h2>
          </div>
          <button onClick={onClose} className="text-on-surface-variant transition-colors hover:text-on-surface">
            <X className="h-5 w-5" />
          </button>
        </div>

        <Stepper current={step} />

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {step === 0 && (
            <DetailsStep
              name={name}
              setName={setName}
              instructions={instructions}
              setInstructions={setInstructions}
              error={error}
            />
          )}
          {step === 1 && botId && (
            <AddDataStep botId={botId} sources={sources} onChange={loadSources} />
          )}
          {step === 2 && <IndexingStep sources={sources} />}
          {step === 3 && publicKey && <TestStep publicKey={publicKey} />}
          {step === 4 && publicKey && <EmbedStep publicKey={publicKey} />}
        </div>

        {/* Footer nav */}
        <div className="flex items-center justify-between border-t border-white/5 px-6 py-4">
          <button
            onClick={() => (step === 0 ? onClose() : setStep((s) => (s - 1) as StepIndex))}
            className="inline-flex items-center gap-1.5 text-body-sm font-medium text-on-surface-variant transition-colors hover:text-on-surface"
          >
            {step === 0 ? "Cancel" : (<><ArrowLeft className="h-4 w-4" /> Back</>)}
          </button>

          {step === 0 && (
            <Button onClick={createBotAndNext} disabled={busy}>
              {busy ? "Creating…" : "Next"} <ArrowRight className="h-4 w-4" />
            </Button>
          )}
          {step === 1 && (
            <Button onClick={() => setStep(2)}>
              {sources.length === 0 ? "Skip for now" : "Next"} <ArrowRight className="h-4 w-4" />
            </Button>
          )}
          {step === 2 && (
            <Button onClick={() => setStep(3)}>
              Test it <ArrowRight className="h-4 w-4" />
            </Button>
          )}
          {step === 3 && (
            <Button onClick={() => setStep(4)}>
              Get embed code <ArrowRight className="h-4 w-4" />
            </Button>
          )}
          {step === 4 && (
            <Button onClick={finish}>
              <Rocket className="h-4 w-4" /> Finish
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function Stepper({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-2 px-6 pt-5">
      {STEPS.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <Fragment key={label}>
            <div className="flex items-center gap-2">
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold transition-colors ${
                  done
                    ? "bg-primary text-on-primary"
                    : active
                      ? "bg-primary-container text-white"
                      : "bg-surface-container-highest text-on-surface-variant"
                }`}
              >
                {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span
                className={`hidden text-body-sm font-medium sm:block ${
                  active ? "text-on-surface" : "text-on-surface-variant"
                }`}
              >
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <span className={`h-px flex-1 ${done ? "bg-primary/50" : "bg-white/10"}`} />
            )}
          </Fragment>
        );
      })}
    </div>
  );
}

// ── Step 1: details ──────────────────────────────────────────────────────────
function DetailsStep({
  name,
  setName,
  instructions,
  setInstructions,
  error,
}: {
  name: string;
  setName: (v: string) => void;
  instructions: string;
  setInstructions: (v: string) => void;
  error: string | null;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h3 className="font-headline-md text-on-surface">Name & requirements</h3>
        <p className="mt-1 text-body-sm text-on-surface-variant">
          Give your assistant a name and tell it how to behave.
        </p>
      </div>
      <div>
        <label className="font-label-caps mb-1.5 block text-[10px] uppercase tracking-widest text-on-surface-variant">
          Chatbot name
        </label>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Customer Service"
          className={inputCls}
        />
      </div>
      <div>
        <label className="font-label-caps mb-1.5 block text-[10px] uppercase tracking-widest text-on-surface-variant">
          Instructions <span className="lowercase text-on-surface-variant/60">(optional)</span>
        </label>
        <textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          rows={5}
          placeholder="e.g. You are a friendly support agent for Acme Inc. Answer only from the provided knowledge. Be concise and cite sources. If unsure, say you don't know and offer to connect a human."
          className={`${inputCls} resize-none`}
        />
        <p className="mt-1.5 text-[11px] text-on-surface-variant/70">
          This becomes the bot&rsquo;s system prompt — you can refine it later in settings.
        </p>
      </div>
      {error && <p className="text-body-sm text-error">{error}</p>}
    </div>
  );
}

// ── Step 2: add data ─────────────────────────────────────────────────────────
function AddDataStep({
  botId,
  sources,
  onChange,
}: {
  botId: string;
  sources: Source[];
  onChange: () => void;
}) {
  const [url, setUrl] = useState("");
  const [mode, setMode] = useState<"site" | "page">("site");
  const [crawlMode, setCrawlMode] = useState<"quick" | "standard" | "full">("quick");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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
          deepCrawl: isSitemap ? undefined : mode === "site",
          crawlMode,
        }),
      });
      if (!res.ok) throw new Error(`add url failed (${res.status})`);
      setUrl("");
      onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h3 className="font-headline-md text-on-surface">Add knowledge</h3>
        <p className="mt-1 text-body-sm text-on-surface-variant">
          Upload documents or crawl a website. Add as many sources as you like — indexing starts
          immediately.
        </p>
      </div>

      {/* Upload */}
      <button
        onClick={() => fileRef.current?.click()}
        disabled={busy}
        className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-outline-variant bg-surface-container-high py-8 text-center transition-colors hover:border-primary disabled:opacity-50"
      >
        <Upload className="h-6 w-6 text-on-surface-variant" />
        <span className="text-body-sm font-medium text-on-surface">
          {busy ? "Working…" : "Click to upload a document"}
        </span>
        <span className="text-[11px] text-on-surface-variant">PDF, DOCX, TXT up to 50MB</span>
      </button>
      <input
        ref={fileRef}
        type="file"
        accept=".pdf,.docx,.txt"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0])}
      />

      {/* URL / sitemap */}
      <form onSubmit={addUrl} className="flex flex-col gap-2">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Globe className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant" />
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com or .../sitemap.xml"
              className={`${inputCls} pl-9`}
            />
          </div>
          <Button type="submit" variant="ghost" disabled={busy}>
            Add
          </Button>
        </div>

        {/* Entire website vs single page */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setMode("site")}
            className={`rounded-xl border p-2.5 text-left transition-colors ${
              mode === "site"
                ? "border-primary bg-primary/10"
                : "border-outline-variant hover:bg-surface-container-high"
            }`}
          >
            <div className="text-body-sm font-medium text-on-surface">Entire website ✨</div>
            <div className="text-[11px] text-on-surface-variant">Finds the sitemap & indexes all pages</div>
          </button>
          <button
            type="button"
            onClick={() => setMode("page")}
            className={`rounded-xl border p-2.5 text-left transition-colors ${
              mode === "page"
                ? "border-primary bg-primary/10"
                : "border-outline-variant hover:bg-surface-container-high"
            }`}
          >
            <div className="text-body-sm font-medium text-on-surface">Just this page</div>
            <div className="text-[11px] text-on-surface-variant">Indexes only the URL above</div>
          </button>
        </div>

        {mode === "site" && (
          <label className="flex items-center gap-2 text-[11px] text-on-surface-variant">
            <span className="shrink-0">How many pages:</span>
            <select
              value={crawlMode}
              onChange={(e) => setCrawlMode(e.target.value as "quick" | "standard" | "full")}
              className="rounded-lg border border-outline-variant bg-surface-container-high px-2 py-1 text-[11px] text-on-surface outline-none focus:border-primary"
            >
              <option value="quick">Quick (~50 pages — fastest)</option>
              <option value="standard">Standard (~500 pages)</option>
              <option value="full">Full (all pages)</option>
            </select>
          </label>
        )}
      </form>

      {error && <p className="text-body-sm text-error">{error}</p>}

      {/* Added sources */}
      {sources.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="font-label-caps text-[10px] uppercase tracking-widest text-on-surface-variant">
            {sources.length} source{sources.length > 1 ? "s" : ""} added
          </p>
          {sources.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-surface-container-high px-3 py-2.5"
            >
              <div className="flex min-w-0 items-center gap-2">
                {s.type === "url" || s.type === "sitemap" ? (
                  <Globe className="h-4 w-4 shrink-0 text-on-surface-variant" />
                ) : (
                  <FileText className="h-4 w-4 shrink-0 text-on-surface-variant" />
                )}
                <span className="truncate text-body-sm text-on-surface">{s.uri}</span>
              </div>
              <StatusBadge status={s.status} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Step 3: indexing progress ────────────────────────────────────────────────
function IndexingStep({ sources }: { sources: Source[] }) {
  if (sources.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-container-highest text-on-surface-variant">
          <Brain className="h-6 w-6" />
        </div>
        <p className="text-body-md text-on-surface">No knowledge sources added.</p>
        <p className="max-w-[22rem] text-body-sm text-on-surface-variant">
          Your bot will still chat using its instructions, but won&rsquo;t have grounded answers.
          You can add sources anytime from the bot&rsquo;s page.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="font-headline-md text-on-surface">Building the knowledge base</h3>
        <p className="mt-1 text-body-sm text-on-surface-variant">
          You can move on as soon as a source is ready — the rest keeps indexing in the background.
        </p>
      </div>
      {sources.map((s) => {
        const total = s.totalPages ?? 0;
        const done = s.processedPages ?? 0;
        const ready = s.status === "ready";
        const failed = s.status === "error";
        const pct = ready ? 100 : total > 0 ? Math.round((done / total) * 100) : failed ? 0 : 8;
        return (
          <div
            key={s.id}
            className="rounded-2xl border border-white/5 bg-surface-container-lowest p-5"
          >
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                <Brain className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-headline-md text-on-surface">
                  {ready
                    ? "Knowledge Base Ready"
                    : failed
                      ? "Indexing failed"
                      : "Knowledge Base Syncing…"}
                </p>
                <p className="truncate font-body-sm text-on-surface-variant">
                  {s.type === "sitemap" || s.type === "url" ? "Crawling: " : "Reading: "}
                  {s.uri}
                </p>
              </div>
            </div>
            <div className="mb-2 h-2 w-full overflow-hidden rounded-full bg-surface-container-highest">
              <div
                className={`h-full rounded-full transition-all duration-700 ${
                  failed ? "bg-error" : "bg-primary shadow-[0_0_10px_#c3c0ff]"
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="flex justify-between font-label-mono text-[11px] text-primary">
              <span>
                {total > 0
                  ? `${done} / ${total} Pages`
                  : failed
                    ? (s.error ?? "Error")
                    : "Starting…"}
              </span>
              <span>{failed ? "Failed" : `${pct}% Complete`}</span>
            </div>
            {s.status === "partially_ready" && (
              <p className="mt-2 text-[11px] text-primary">
                ✓ Usable now — indexing the remaining pages in the background…
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Step 4: test ─────────────────────────────────────────────────────────────
function TestStep({ publicKey }: { publicKey: string }) {
  const [input, setInput] = useState("");
  const [answer, setAnswer] = useState("");
  const [streaming, setStreaming] = useState(false);
  const visitorId = useRef(`wizard-${Math.random().toString(36).slice(2)}`);

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
        body: JSON.stringify({ public_key: publicKey, visitor_id: visitorId.current, message: question }),
      });
      if (!res.ok || !res.body) {
        setAnswer(`Error: ${res.status}`);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
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
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="font-headline-md text-on-surface">Take it for a spin</h3>
        <p className="mt-1 text-body-sm text-on-surface-variant">
          Ask something your bot should know from its sources.
        </p>
      </div>
      <div className="min-h-[160px] rounded-2xl border border-white/5 bg-surface-container-lowest p-4 text-body-sm text-on-surface">
        {streaming && !answer ? (
          <div className="flex items-center gap-2 text-on-surface-variant">
            <span className="flex gap-1">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:-0.3s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:-0.15s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary" />
            </span>
            <span className="text-[11px]">Thinking…</span>
          </div>
        ) : answer ? (
          <>
            <Markdown content={answer} />
            {streaming && (
              <span className="ml-0.5 inline-block h-3.5 w-0.5 animate-pulse bg-primary align-middle" />
            )}
          </>
        ) : (
          <span className="text-on-surface-variant">Ask a question to preview your bot&rsquo;s answers.</span>
        )}
      </div>
      <form onSubmit={ask} className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message…"
          className={inputCls}
        />
        <Button type="submit" disabled={streaming} className="px-3">
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}

// ── Step 5: embed ────────────────────────────────────────────────────────────
function EmbedStep({ publicKey }: { publicKey: string }) {
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
    <div className="flex flex-col gap-5">
      <div>
        <h3 className="font-headline-md text-on-surface">Embed your chatbot</h3>
        <p className="mt-1 text-body-sm text-on-surface-variant">
          Your bot is live. Drop it onto any site with one of these snippets.
        </p>
      </div>

      <CodeBlock
        icon={<Code2 className="h-4 w-4" />}
        title="HTML — paste before </body>"
        code={scriptSnippet}
      />
      <CodeBlock
        icon={<Code2 className="h-4 w-4" />}
        title="React / Next.js — add the component once"
        code={reactSnippet}
      />

      <p className="text-[11px] text-on-surface-variant/70">
        Tip: restrict where the widget can run by setting <span className="font-mono">Allowed domains</span> in
        the bot&rsquo;s settings.
      </p>
    </div>
  );
}

function CodeBlock({
  icon,
  title,
  code,
}: {
  icon: React.ReactNode;
  title: string;
  code: string;
}) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-on-surface-variant">
        {icon}
        {title}
      </div>
      <div className="relative">
        <button
          onClick={copy}
          className="absolute right-2 top-2 z-10 rounded-lg bg-white/5 p-1.5 text-on-surface-variant transition-colors hover:bg-white/10 hover:text-on-surface"
          aria-label="Copy code"
        >
          {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
        </button>
        <pre className="overflow-x-auto rounded-xl border border-white/5 bg-surface-container-lowest p-4 pr-12 font-mono text-[12px] leading-relaxed text-on-surface">
          {code}
        </pre>
      </div>
    </div>
  );
}
