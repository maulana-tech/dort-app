"use client";

import type { CSSProperties } from "react";
import { modeLine } from "@/features/chat";
import type { ChatDemo } from "./stats";
import "./chat.css";

/**
 * The conversation itself, in the bubbles `/chat` uses — shared by the hero's window and the
 * product tour so the page cannot show two different Chats.
 *
 * The answers are not copy: `chatDemo()` composes every one of them from the sample run's own
 * numbers. A landing page has no business calling a model, and a made-up answer in the
 * assistant's place would be exactly the thing this product exists to argue against.
 *
 * It types itself out. Each turn arrives on a delay, and an assistant's turn shows the three
 * dots first and then the text — because a chat that is simply *there* reads as a screenshot,
 * and the one thing worth showing about this page is that an answer arrives. The whole effect is
 * CSS animation-delay: no timers, no state, nothing to tidy up when the tour moves on, and
 * nothing that costs anything while the section is off screen (chat.css turns it all off under
 * prefers-reduced-motion, where every turn is simply present).
 */

/** seconds before a turn appears: question, then its answer once the dots have had their turn */
const ASK = 1.15;
const REPLY = 0.75;
const delay = (i: number, half: 0 | 1) => i * (ASK + REPLY) + half * REPLY;

export function ChatThread({
  demo,
  compact = false,
}: {
  demo: ChatDemo;
  /** the tour's window is shorter than the hero's: drop the prompt box and the footnote */
  compact?: boolean;
}) {
  const { digest, turns } = demo;
  return (
    <div className="lp-chat grid gap-3">
      <p className="text-[12.5px] text-dim">{modeLine(digest)}</p>

      {turns.map((t, i) => (
        <div key={t.q} className="grid gap-3">
          <div
            className="lp-chat-in justify-self-end rounded-card bg-primary px-3.5 py-2 text-[13px] text-primary-fg md:max-w-[80%]"
            style={{ "--d": `${delay(i, 0)}s` } as CSSProperties}
          >
            {t.q}
          </div>

          {/* the dots and the text share the bubble: the dots sit over it and fade as the text
              fades in, so the answer does not jump the page when it lands */}
          <div
            className="lp-chat-in relative justify-self-start rounded-card bg-surface px-3.5 py-2.5 text-[13px] text-body leading-relaxed shadow-soft md:max-w-[92%]"
            style={{ "--d": `${delay(i, 1)}s` } as CSSProperties}
          >
            <span
              aria-hidden="true"
              className="lp-chat-dots"
              style={{ "--d": `${delay(i, 1) + 0.85}s` } as CSSProperties}
            >
              <i />
              <i />
              <i />
            </span>
            <span
              className="lp-chat-said block"
              style={{ "--d": `${delay(i, 1) + 0.85}s` } as CSSProperties}
            >
              {t.a.map((line) => (
                <span key={line} className="block not-first:mt-2">
                  {line}
                </span>
              ))}
            </span>
          </div>
        </div>
      ))}

      {/* what the questions were answered from, stated rather than implied */}
      <div
        className="lp-chat-in flex flex-wrap items-center gap-1.5 justify-self-start"
        style={{ "--d": `${delay(turns.length, 0)}s` } as CSSProperties}
      >
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
