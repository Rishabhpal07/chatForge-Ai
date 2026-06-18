"use client";

import { useEffect, useState } from "react";
import { MessageSquare, User } from "lucide-react";
import { Card } from "@/src/components/ui";

interface Conversation {
  id: string;
  botName: string;
  visitorId: string;
  startedAt: string;
  messageCount: number;
}
interface Message {
  id: string;
  role: string;
  content: string;
  createdAt: string;
}

export default function HistoryPage() {
  const [convos, setConvos] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/conversations");
      if (res.ok) setConvos((await res.json()).conversations);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!selected) return;
    (async () => {
      const res = await fetch(`/api/conversations/${selected}`);
      if (res.ok) setMessages((await res.json()).messages);
    })();
  }, [selected]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-ink">Chat History</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Conversations your visitors have had with your bots.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* List */}
        <Card className="p-2 lg:col-span-1">
          {loading ? (
            <p className="p-4 text-sm text-ink-muted">Loading…</p>
          ) : convos.length === 0 ? (
            <p className="p-4 text-sm text-ink-muted">No conversations yet.</p>
          ) : (
            <ul className="flex flex-col">
              {convos.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => setSelected(c.id)}
                    className={`flex w-full flex-col items-start gap-1 rounded-lg px-3 py-3 text-left transition-colors ${
                      selected === c.id ? "bg-brand-soft" : "hover:bg-surface-hover"
                    }`}
                  >
                    <span className="flex w-full items-center justify-between">
                      <span className="font-medium text-ink">{c.botName}</span>
                      <span className="label-mono text-[10px] text-ink-muted">
                        {c.messageCount} msgs
                      </span>
                    </span>
                    <span className="flex items-center gap-1.5 font-mono text-xs text-ink-muted">
                      <User className="h-3 w-3" /> {c.visitorId.slice(0, 16)}
                    </span>
                    <span className="text-xs text-ink-muted">
                      {new Date(c.startedAt).toLocaleString()}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Transcript */}
        <Card className="flex min-h-[400px] flex-col p-6 lg:col-span-2">
          {!selected ? (
            <div className="flex flex-1 flex-col items-center justify-center text-center text-ink-muted">
              <MessageSquare className="mb-2 h-8 w-8" />
              <p className="text-sm">Select a conversation to read the transcript.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`max-w-[85%] rounded-xl px-4 py-2 text-sm ${
                    m.role === "user"
                      ? "self-end bg-brand text-white"
                      : "self-start border border-line bg-surface-muted text-ink"
                  }`}
                >
                  <span className="whitespace-pre-wrap">{m.content}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
