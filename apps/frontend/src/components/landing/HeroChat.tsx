"use client";

import Image from "next/image";
import Link from "next/link";
import { Chip, PH, PhIcon } from "@/components/ui";
import { modeLine } from "@/features/chat";
import type { ChatDemo } from "./stats";

/**
 * The hero's product: Chat, as the app really draws it.
 *
 * It replaces the contract graph that stood here while Trace and Atlas were the product. The
 * window, the bubbles and the prompt box are the shapes `/chat` uses, and the answer is not copy:
 * `chatDemo()` composes it from the sample run's own numbers, so the hero cannot drift from the
 * run it claims to be reading. No model is called to draw a landing page — the real page sends
 * these same facts to whichever model the reader brings.
 */
export function HeroChat({ demo }: { demo: ChatDemo }) {
  const { digest, question, answer } = demo;
  return (
    <div className="lp-chat relative h-full w-full overflow-hidden rounded-t-[24px] border border-white/[.08] border-b-0 bg-[#ffffff]">
      {/* the app's own header row: the panel's name, the mode badge, the way in */}
      <div className="absolute inset-x-0 top-0 z-10 flex min-w-0 items-center gap-3 p-3 md:p-4">
        <span className="flex items-center gap-2 text-[13px] text-fg">
          <span className="size-1.5 rounded-full bg-primary" />
          Chat
        </span>
        <Chip dot tone="info">
          Sample
        </Chip>
        <span className="hidden truncate font-mono text-[11.5px] text-dim md:block">
          /chat
        </span>
        <Link
          href="/chat"
          className="group hdr-pill lit ml-auto flex-none"
          aria-label="Open Chat in the app"
        >
          <PhIcon
            d={PH.sparkle}
            className="size-[15px] transition-transform duration-500 group-hover:scale-110 motion-reduce:transition-none"
          />
          Open the Chat
          <PhIcon d={PH.caretRight} className="size-3 text-dim" />
        </Link>
      </div>

      {/* the thread, in the same bubbles /chat uses */}
      <div className="dot-grid-soft absolute inset-x-0 top-[60px] bottom-0 overflow-hidden px-4 pt-3 md:px-6 md:pt-4">
        <div className="mx-auto grid max-w-[720px] gap-3">
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

          {/* the prompt box's shape, not a working one: the hero does not call a model */}
          <div className="mt-1 rounded-card bg-field px-3.5 py-2.5 text-[13px] text-dim">
            Ask in your own words…
          </div>
          <p className="flex items-center gap-1.5 text-[11.5px] text-dim">
            <Image
              src="/logos/chains/portaldot.png"
              alt=""
              width={14}
              height={14}
              className="size-3.5 rounded-[3px]"
            />
            Answered by the model you bring — Dort hosts none of its own.
          </p>
        </div>
      </div>
    </div>
  );
}
