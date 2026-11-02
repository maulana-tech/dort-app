"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Chip, PH, PhIcon } from "@/components/ui";
import { useAiConfig } from "@/features/ai/hooks/useAiConfig";
import {
  canSend,
  digestOf,
  EMPTY_DIGEST,
  modeBadge,
  modeLine,
  sendLabel,
  suggestionsFor,
  useChat,
} from "@/features/chat";
import { type RunFile, useRun, useShownSource } from "@/features/run";
import type { TraceSource } from "@/features/trace/types";
import { DropZone } from "../onboarding/RunDialog";
import { Sidebar } from "../shell/Sidebar";

const fromFile = (data: RunFile): TraceSource => ({ data, origin: "file" });

/**
 * Chat: ask in a sentence.
 *
 * Laid out in three panels like the Trace view it replaces — the run on the left, the
 * conversation in the middle, what the conversation is grounded in on the right. A newcomer's
 * real first question is "what is it reading?", and a centred box with nothing around it answers
 * that with nothing: these panels make the answer's provenance part of the page instead of a
 * claim in a sentence.
 *
 * Two modes, one box: against the loaded Foundry run when there is one, generally when there is
 * not. Which is in force is stated in the header and again on the left, never left to be
 * inferred — an answer about "your project" when no project is loaded is the most convincing
 * kind of wrong.
 *
 * The model is the user's own, always (features/ai). There is no Dort-hosted fallback: an
 * auditor's unpublished source must never pass through our infrastructure, and a chat box is
 * exactly where it would.
 */
export function ChatWorkspace({ source }: { source: TraceSource }) {
  // the same path the Trace page used, so a dropped dort-data.json grounds the chat on the hosted
  // site too — without this, grounded mode would only ever work with DORT_DATA_PATH set
  const shown = useShownSource(source, fromFile);
  const { setSample } = useRun();
  const digest = useMemo(
    () =>
      shown.source ? digestOf(shown.source.data, shown.origin) : EMPTY_DIGEST,
    [shown],
  );
  const cfg = useAiConfig();
  const chat = useChat(cfg, digest);
  const [draft, setDraft] = useState("");
  const thread = useRef<HTMLDivElement>(null);
  const starters = useMemo(() => suggestionsFor(digest), [digest]);

  // follow the stream, but only while the user is already at the bottom: yanking the view back
  // down while they are reading something further up is worse than not following at all
  // biome-ignore lint/correctness/useExhaustiveDependencies: the turns' text is what scrolls
  useEffect(() => {
    const el = thread.current;
    if (!el) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 120)
      el.scrollTop = el.scrollHeight;
  }, [chat.turns]);

  const ask = (text: string) => {
    if (!chat.ready) return;
    chat.send(text);
    setDraft("");
  };
  const empty = chat.turns.length === 0;

  return (
    <div className="flex min-h-0 flex-1 gap-3 px-3 pb-3">
      {/* ── left: what is loaded, and what to ask it ───────────────────── */}
      <div className="hidden flex-none overflow-hidden lg:flex">
        <Sidebar>
          <p className="mb-1 flex items-center gap-2 text-[13px] text-fg">
            <PhIcon d={PH.sparkle} className="size-[15px] text-muted" />
            {modeBadge(digest)}
          </p>
          <p className="mb-3 text-[12.5px] text-dim leading-normal">
            {modeLine(digest)}
          </p>

          {digest.loaded ? (
            <dl className="mb-3 grid gap-1">
              {[
                ["Tests", String(digest.total)],
                ["Passing", String(digest.passed)],
                ["Failing", String(digest.failed)],
                // without this a run with skipped tests reads as though the counts were wrong
                ...(digest.skipped
                  ? [["Skipped", String(digest.skipped)]]
                  : []),
                ["Contracts", String(digest.contracts.length)],
                ["Files", String(digest.files.length)],
              ].map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between">
                  <dt className="text-[12px] text-muted">{k}</dt>
                  <dd className="font-mono text-[12.5px] text-fg tabular-nums">
                    {v}
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <div className="mb-3 grid gap-2 rounded-inner border border-border bg-inner-grad p-3">
              <p className="text-[12.5px] text-body leading-normal">
                Drop a <code className="font-mono">dort-data.json</code> to
                answer about real code. It is read in this tab only and never
                uploaded.
              </p>
              <DropZone onLoaded={() => undefined} />
              <button
                type="button"
                onClick={() => setSample(true)}
                className="justify-self-start rounded-tile bg-raised px-3 py-1.5 text-[12px] text-muted transition-colors hover:text-fg"
              >
                Try the sample vault
              </button>
            </div>
          )}

          <p className="mt-1 mb-1.5 text-[12px] text-muted">Start with</p>
          <div className="grid gap-1.5">
            {starters.map((q) => (
              <button
                key={q}
                type="button"
                disabled={!chat.ready}
                onClick={() => ask(q)}
                className="rounded-tile bg-raised px-2.5 py-2 text-left text-[12.5px] text-muted leading-snug transition-colors hover:bg-hover hover:text-fg disabled:pointer-events-none disabled:opacity-40"
              >
                {q}
              </button>
            ))}
          </div>
        </Sidebar>
      </div>

      {/* ── middle: the conversation ───────────────────────────────────── */}
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-card border border-border bg-card-grad shadow-soft">
        <header className="flex flex-none items-center gap-2 px-5 pt-4 pb-3">
          <span className="flex items-center gap-2 text-[14px] text-fg">
            <span className="size-1.5 rounded-full bg-primary" />
            Chat
          </span>
          <Chip
            dot
            tone={!digest.loaded ? "warn" : digest.sample ? "info" : "ok"}
          >
            {modeBadge(digest)}
          </Chip>
          {!empty && (
            <button
              type="button"
              onClick={chat.reset}
              className="ml-auto rounded-tile bg-raised px-3 py-1.5 text-[12.5px] text-muted transition-colors hover:bg-hover hover:text-fg"
            >
              New
            </button>
          )}
        </header>

        <div ref={thread} className="min-h-0 flex-1 overflow-auto px-5 pb-4">
          {empty ? (
            <div className="grid h-full place-items-center">
              <div className="max-w-[420px] text-center">
                <p className="text-[15px] text-body leading-relaxed">
                  Ask anything about{" "}
                  {digest.loaded ? "this run" : "smart contracts"}. Plain
                  language is fine.
                </p>
                {!chat.ready && (
                  <p className="mt-2 text-[12.5px] text-dim leading-relaxed">
                    Press <strong className="text-fg">Connect AI</strong> in the
                    header first and pick your Claude Code, a local model, or
                    your own key. Dort never calls a model of its own.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="grid gap-3">
              {chat.turns.map((t) => (
                <div
                  key={t.at}
                  className={
                    t.role === "user"
                      ? "max-w-[80%] justify-self-end rounded-card bg-primary px-3.5 py-2 text-[13px] text-primary-fg"
                      : "max-w-[92%] justify-self-start rounded-card bg-raised px-3.5 py-2.5 text-[13px] text-body leading-relaxed"
                  }
                >
                  <span className="whitespace-pre-wrap break-words">
                    {t.content}
                  </span>
                  {t.role === "assistant" &&
                    chat.busy &&
                    t === chat.turns[chat.turns.length - 1] && (
                      <span className="ml-1 text-dim">▍</span>
                    )}
                </div>
              ))}
            </div>
          )}
        </div>

        <footer className="flex-none border-border border-t p-3">
          <div className="flex items-end gap-2">
            <textarea
              value={draft}
              rows={2}
              disabled={!chat.ready}
              placeholder={
                chat.ready
                  ? "Ask in your own words…"
                  : "Connect your AI to start"
              }
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                // Enter sends, Shift+Enter breaks the line: a chat box, not a form field
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (canSend(draft, chat.busy)) ask(draft);
                }
              }}
              className="min-w-0 flex-1 resize-none rounded-card bg-field px-3.5 py-2.5 text-[13px] text-fg outline-none placeholder:text-dim focus-visible:ring-2 focus-visible:ring-white/25 disabled:opacity-50"
            />
            <button
              type="button"
              disabled={
                !chat.ready || (!chat.busy && !canSend(draft, chat.busy))
              }
              onClick={() => (chat.busy ? chat.stop() : ask(draft))}
              className="h-[52px] flex-none rounded-chip bg-primary px-6 text-[14px] text-primary-fg outline-none transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-white/25 disabled:pointer-events-none disabled:bg-raised disabled:text-dim"
            >
              {sendLabel(chat.busy)}
            </button>
          </div>
          {chat.error && (
            <p className="mt-2 text-[12px] text-red">{chat.error}</p>
          )}
        </footer>
      </main>

      {/* ── right: what the answer is grounded in ───────────────────────── */}
      <div className="hidden min-h-0 w-[360px] flex-none xl:flex">
        <section className="flex min-h-0 w-full flex-col overflow-auto rounded-card border border-border bg-card-grad p-3 shadow-soft">
          <p className="mb-1 flex items-center gap-2 text-[13px] text-fg">
            <PhIcon d={PH.code} className="size-[15px] text-muted" />
            What it answers from
          </p>
          <p className="mb-3 text-[12.5px] text-dim leading-normal">
            {digest.loaded
              ? "A summary of the run, attached to your first message. Whole traces would be tens of thousands of tokens of mostly noise."
              : "Nothing yet. Load a run and this panel lists exactly what gets sent."}
          </p>

          {digest.failed > 0 && (
            <section className="mb-3 rounded-inner border border-border bg-inner-grad p-3">
              <p className="mb-1.5 text-[12.5px] text-fg">
                Failures ({digest.failed})
              </p>
              <ul className="grid gap-1.5">
                {digest.failures.slice(0, 6).map((f) => (
                  <li key={`${f.suite}.${f.name}`} className="text-[12px]">
                    <span className="font-mono text-fg">{f.name}</span>
                    <span className="block text-dim leading-snug">
                      {f.reason}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {digest.contracts.length > 0 && (
            <section className="mb-3">
              <p className="mb-1.5 text-[12px] text-muted">
                Contracts the calls went through
              </p>
              <div className="flex flex-wrap gap-1">
                {digest.contracts.slice(0, 14).map((c) => (
                  <span
                    key={c}
                    className="rounded-full bg-raised px-2 py-0.5 font-mono text-[11.5px] text-muted"
                  >
                    {c}
                  </span>
                ))}
              </div>
            </section>
          )}

          {digest.forks.length > 0 && (
            <section className="mb-3">
              <p className="mb-1.5 text-[12px] text-muted">Also run on</p>
              <div className="flex flex-wrap gap-1">
                {digest.forks.map((f) => (
                  <span
                    key={f}
                    className="rounded-full bg-raised px-2 py-0.5 text-[11.5px] text-muted"
                  >
                    {f}
                  </span>
                ))}
              </div>
            </section>
          )}

          <p className="mt-auto pt-3 text-[11.5px] text-dim leading-relaxed">
            Defensive review only: Dort explains code and writes Foundry tests
            for intended behaviour, and refuses to write exploits. Your question
            goes straight from this browser to the model you chose.
          </p>
        </section>
      </div>
    </div>
  );
}
