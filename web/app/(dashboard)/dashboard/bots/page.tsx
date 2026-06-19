"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bot, Plus, Link2 } from "lucide-react";
import type { Bot as BotType } from "@chatforge/shared";
import { Button, ButtonLink, Card, SectionTitle, StatusBadge, Label } from "@/src/components/ui";
import { CreateBotWizard } from "@/src/components/CreateBotWizard";

export default function MyChatbotsPage() {
  const [bots, setBots] = useState<BotType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/bots");
    if (res.ok) setBots((await res.json()).bots);
    setLoading(false);
  }
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  return (
    <div className="flex flex-col gap-8">
      <SectionTitle
        title="My Chatbots"
        subtitle="Manage and monitor your active AI assistants."
        action={
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" /> Create Chatbot
          </Button>
        }
      />

      {loading ? (
        <p className="text-sm text-ink-muted">Loading…</p>
      ) : bots.length === 0 ? (
        <Card className="flex flex-col items-center gap-4 p-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-soft text-brand">
            <Bot className="h-6 w-6" />
          </div>
          <div>
            <p className="font-semibold text-ink">No chatbots yet</p>
            <p className="text-sm text-ink-muted">Create your first AI assistant to get started.</p>
          </div>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" /> Create Chatbot
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {bots.map((bot) => (
            <Card
              key={bot.id}
              className="group flex flex-col justify-between p-6 transition-all hover:border-brand hover:shadow-sm"
            >
              <div>
                <div className="mb-4 flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-hover text-brand">
                    <Bot className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="truncate text-lg font-semibold leading-tight text-ink">
                      {bot.name}
                    </h3>
                    <div className="mt-1">
                      <StatusBadge status={bot.status} />
                    </div>
                  </div>
                </div>
                <div className="mb-5 flex items-center gap-1.5 truncate font-mono text-xs text-ink-muted">
                  <Link2 className="h-4 w-4 shrink-0" />
                  {bot.publicKey}
                </div>
                <div className="grid grid-cols-2 gap-2 border-t border-line pt-4">
                  <div>
                    <Label>Model</Label>
                    <p className="truncate text-sm font-semibold text-ink">
                      {bot.model.split("/").pop()}
                    </p>
                  </div>
                  <div>
                    <Label>Updated</Label>
                    <p className="text-sm font-semibold text-ink">
                      {new Date(bot.updatedAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </div>
              <div className="mt-5 flex items-center gap-2">
                <ButtonLink href={`/dashboard/bots/${bot.id}`} variant="ghost" className="flex-1">
                  Manage
                </ButtonLink>
                <Link
                  href={`/dashboard/bots/${bot.id}`}
                  className="flex-1 rounded-lg border border-line px-4 py-2 text-center text-sm font-medium text-ink transition-colors hover:bg-surface-hover"
                >
                  Settings
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}

      {showCreate && (
        <CreateBotWizard
          onClose={() => setShowCreate(false)}
          onCreated={load}
        />
      )}
    </div>
  );
}
