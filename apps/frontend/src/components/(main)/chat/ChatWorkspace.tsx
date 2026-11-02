"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Chip, Panel, PH, PhIcon } from "@/components/ui";
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

const fromFile = (data: RunFile): TraceSource => ({ data, origin: "file" });

/**
 * Chat: ask in a sentence.
 *
 * Every other page here assumes you already know what you are looking at. This one is the way in
 * for someone who does not, and it answers in two modes from the same box — against the loaded
 * Foundry run when there is one, generally when there is not. Which mode is in force is stated
 * above the thread rather than left to be inferred, because an answer about "your project" when
 * no project is loaded is the most convincing kind of wrong.
 *
 * The model is the user's own, always (features/ai). There is no Dort-hosted fallback: an
 * auditor's unpublished source must never pass through our infrastructure, and a chat box is
 * exactly where it would.
 */
export function ChatWorkspace({ source }: { source: TraceSource }) {
  // the same path the old Trace page used, so a dropped dort-data.json grounds the chat on the
  // hosted site too — without this, grounded mode would only ever work with DORT_DATA_PATH set
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
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (atBottom) el.scrollTop = el.scrollHeight;
  }, [chat.turns]);

  const ask = (text: string) => {
    if (!chat.ready) return;
    chat.send(text);
    setDraft("");
  };

  const empty = chat.turns.length === 0;

  return (
    <div className="dot-grid min-h-[calc(100dvh-64px)] w-full overflow-y-auto p-4 md:p-6">
      <div className="mx-auto grid w-full max-w-3xl grid-cols-[minmax(0,1fr)] items-start gap-4">
        <Panel
          label="Chat"
          aside={
            <Chip
              dot
              tone={!digest.loaded ? "warn" : digest.sample ? "info" : "ok"}
            >
              {modeBadge(digest)}
            </Chip>
          }
        >
          <div className="grid grid-cols-[minmax(0,1fr)] gap-4 px-4 pb-4">
            <p className="text-ui-xs text-dim">{modeLine(digest)}</p>

            {!chat.ready && (
              <div className="rounded-card bg-raised px-4 py-3">
                <p className="text-ui-sm text-body leading-relaxed">
                  <strong className="font-medium text-fg">
                    Connect your own AI first.
                  </strong>{" "}
                  Press{" "}
                  <strong className="font-medium text-fg">Connect AI</strong> in
                  the header and pick your Claude Code, a local model, or your
                  own API key. Dort never calls a model of its own — your
                  question and your code go straight from this browser to the
                  provider you chose.
                </p>
              </div>
            )}

            {/* ── the thread ─────────────────────────────────────────── */}
            <div
              ref={thread}
              className="max-h-[52vh] min-h-[180px] overflow-y-auto rounded-card bg-raised px-3 py-3"
            >
              {empty ? (
                <p className="px-1 py-6 text-center text-ui-sm text-dim">
                  Ask anything about{" "}
                  {digest.loaded ? "this project" : "smart contracts"}. Plain
                  language is fine.
                </p>
              ) : (
                <div className="grid gap-3">
                  {chat.turns.map((t) => (
                    <div
                      key={t.at}
                      className={
                        t.role === "user"
                          ? "justify-self-end rounded-card bg-primary px-3.5 py-2 text-ui-sm text-primary-fg md:max-w-[80%]"
                          : "justify-self-start rounded-card bg-surface px-3.5 py-2 text-ui-sm text-body leading-relaxed md:max-w-[90%]"
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

            {/* ── starters, while the thread is empty ─────────────────── */}
            {empty && (
              <div className="grid gap-1.5">
                {starters.map((q) => (
                  <button
                    key={q}
                    type="button"
                    disabled={!chat.ready}
                    onClick={() => ask(q)}
                    className="rounded-tile bg-raised px-3 py-2 text-left text-ui-sm text-muted transition-colors hover:bg-hover hover:text-fg disabled:pointer-events-none disabled:opacity-40"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}

            {/* ── grounding, where the Start page used to live ────────── */}
            {!digest.loaded && (
              <div className="grid gap-2 rounded-card bg-raised px-4 py-3">
                <p className="text-ui-sm text-body leading-relaxed">
                  <strong className="font-medium text-fg">
                    Answer about real code instead.
                  </strong>{" "}
                  Drop a <code className="font-mono">dort-data.json</code> from
                  your own project, or look at the bundled demo vault. Either
                  one is read in this tab only and never uploaded.
                </p>
                <DropZone onLoaded={() => undefined} />
                <button
                  type="button"
                  onClick={() => setSample(true)}
                  className="justify-self-start rounded-tile bg-surface px-3 py-1.5 text-ui-xs text-muted transition-colors hover:text-fg"
                >
                  Try the sample vault
                </button>
              </div>
            )}

            {/* ── the box ────────────────────────────────────────────── */}
            <div className="grid gap-2">
              <textarea
                value={draft}
                rows={3}
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
                className="w-full resize-y rounded-card bg-field px-3.5 py-2.5 text-ui-sm text-fg outline-none placeholder:text-dim focus-visible:ring-2 focus-visible:ring-white/25 disabled:opacity-50"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={
                    !chat.ready || (!chat.busy && !canSend(draft, chat.busy))
                  }
                  onClick={() => (chat.busy ? chat.stop() : ask(draft))}
                  className="h-10 flex-1 rounded-chip bg-primary text-ui-md text-primary-fg outline-none transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-white/25 disabled:pointer-events-none disabled:bg-raised disabled:text-dim"
                >
                  {sendLabel(chat.busy)}
                </button>
                {!empty && (
                  <button
                    type="button"
                    onClick={chat.reset}
                    className="h-10 rounded-chip bg-raised px-4 text-ui-sm text-muted transition-colors hover:bg-hover hover:text-fg"
                  >
                    New
                  </button>
                )}
              </div>
              {chat.error && (
                <p className="text-ui-xs text-red">{chat.error}</p>
              )}
              <p className="flex items-center gap-1.5 text-ui-xs text-dim">
                <PhIcon d={PH.sparkle} className="size-3.5" />
                Dort helps with defensive review only — it explains code and
                writes tests for intended behaviour, never exploits.
              </p>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
