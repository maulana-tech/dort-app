"use client";

import { modeLine } from "@/features/chat";
import type { ChatDemo } from "./stats";

/**
 * The conversation itself, in the bubbles `/chat` uses — shared by the hero's window and the
 * product tour so the page cannot show two different Chats.
 *
 * The answer is not copy: `chatDemo()` composes it from the sample run's own numbers. A landing
 * page has no business calling a model, and a made-up answer in the assistant's place would be
 * exactly the thing this product exists to argue against.
 */
export function ChatThread({
  demo,
  compact = false,
}: {
  demo: ChatDemo;
  /** the tour's window is shorter than the hero's: drop the prompt box and the footnote */
  compact?: boolean;
}) {
  const { digest, question, answer } = demo;
  return (
    <div className="grid gap-3">
      <p className="text-[12.5px] text-dim">{modeLine(digest)}</p>

      <div className="justify-self-end rounded-card bg-primary px-3.5 py-2 text-[13px] text-primary-fg md:max-w-[80%]">
        {question}
      </div>

      <div className="justify-self-start rounded-card bg-surface px-3.5 py-2.5 text-[13px] text-body leading-relaxed shadow-soft md:max-w-[92%]">
        {answer.map((line) => (
          <p key={line} className="not-first:mt-2">
            {line}
          </p>
        ))}
      </div>

      {/* what the question was answered from, stated rather than implied */}
      <div className="flex flex-wrap items-center gap-1.5 justify-self-start">
        {[
          `${digest.total} tests`,
          `${digest.contracts.length} contracts`,
          `${digest.files.length} files`,
        ].map((t) => (
          <span
            key={t}
            className="rounded-full bg-raised px-2.5 py-1 font-mono text-[11px] text-muted"
          >
            {t}
          </span>
        ))}
      </div>

      {!compact && (
        <div className="mt-1 rounded-card bg-field px-3.5 py-2.5 text-[13px] text-dim">
          Ask in your own words…
        </div>
      )}
    </div>
  );
}
