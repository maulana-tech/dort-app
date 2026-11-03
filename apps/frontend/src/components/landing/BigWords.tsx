"use client";

import dynamic from "next/dynamic";
import { type ReactNode, useRef } from "react";
import { ICON_PATH, type IconKey } from "@/features/atlas/utils/icons";
import { type Gsap, Lazy, MOTION_MQ, useStage } from "./motion";
import "./words.css";
import type { ChatDemo } from "./stats";

// the visuals are their own chunk, fetched as their spot nears
const visuals = () => import("./WordVisuals");
const AskVisual = dynamic(() => visuals().then((m) => m.AskVisual));
const MoveVisual = dynamic(() => visuals().then((m) => m.MoveVisual));
const LearnVisual = dynamic(() => visuals().then((m) => m.LearnVisual));

type Word = {
  word: string;
  line: string;
  /** two icon badges orbiting the visual: icon, where they sit on its edge, finding dot */
  glyphs: { icon: IconKey; at: string; bad?: boolean }[];
  /** the empty spot's height until the visual mounts (Lazy): the mounted height per breakpoint,
   *  measured, so mounting barely moves the page (each height change re-measures every trigger) */
  min: string;
  visual: ReactNode;
  /** what the visual needs loaded before it mounts (Lazy) */
  wait: () => Promise<unknown>;
};

/** a letter's tumble while it drops in (the last letters trail, like Genie's 'Creat e') */
const TILT = [-14, 9, -6, 12, -10, 16];

/**
 * Genie: three giant words, each letter dropping in on its own with the scroll, mascots beside
 * them. Here 'Ask' / 'Move' / 'Learn', the three things Dort does, and the screen is shared
 * rather than taken in turns: the word holds still on the left while the product doing it
 * travels in from the right.
 *
 * One pinned trigger drives everything, which is the point — the reader scrolls down, as they
 * always do, and the movement they get is sideways. Two triggers (one for the words, one for the
 * track) would drift apart on a fast flick and show the wrong word over the wrong panel, which
 * is the one failure this section cannot have.
 *
 * The step is measured, not assumed: one panel's width, read at refresh (invalidateOnRefresh),
 * so a resize or an address bar appearing does not leave the track half a panel out.
 */
function bigWords(root: HTMLElement, gsap: Gsap) {
  for (const block of gsap.utils.toArray<HTMLElement>("[data-lp=word]", root)) {
    const q = gsap.utils.selector(block);
    const [plate] = q("[data-lp=plate]");

    // the word drops in as its block arrives
    gsap
      .timeline({
        scrollTrigger: {
          trigger: block,
          start: "top 80%",
          end: "top 30%",
          scrub: 0.6,
        },
      })
      .fromTo(
        q("[data-lp=letter]"),
        {
          yPercent: -140,
          rotate: (i: number) => TILT[i % TILT.length],
          autoAlpha: 0,
        },
        {
          yPercent: 0,
          rotate: 0,
          autoAlpha: 1,
          ease: "bounce.out",
          stagger: 0.12,
          duration: 1,
        },
      )
      .fromTo(
        q("[data-lp=line]"),
        { autoAlpha: 0, y: 24 },
        { autoAlpha: 1, y: 0, duration: 0.6 },
        "-=0.4",
      );

    // the panel comes in from the right — the sideways move, done inside the block's own space
    // so it can never travel over the words. A short distance on purpose: far enough to read as
    // horizontal, near enough that it is already legible when it settles.
    gsap.fromTo(
      plate,
      { x: 120, autoAlpha: 0 },
      {
        x: 0,
        autoAlpha: 1,
        ease: "power2.out",
        scrollTrigger: {
          trigger: plate,
          start: "top 92%",
          end: "top 45%",
          scrub: 0.6,
        },
      },
    );

    // the badges circle their corner while the block passes
    const spin = gsap.timeline({
      scrollTrigger: {
        trigger: block,
        start: "top bottom",
        end: "bottom top",
        scrub: true,
      },
    });
    const orbit = 22;
    for (const [i, g] of q("[data-lp=glyph]").entries()) {
      const r = i ? -orbit : orbit;
      spin.to(
        g,
        {
          // easeEach belongs INSIDE the keyframes object; as a sibling GSAP rejects it
          // ("Invalid property easeEach") and every orbit step runs linear instead of eased.
          keyframes: {
            x: [0, r, 0, -r, 0],
            y: [-r, 0, r, 0, -r],
            easeEach: "sine.inOut",
          },
          rotate: i ? -40 : 40,
          ease: "none",
        },
        0,
      );
    }
  }
}

function Glyph({ icon, at, bad }: Word["glyphs"][number]) {
  return (
    <span
      data-lp="glyph"
      aria-hidden="true"
      className={`absolute z-10 grid size-11 place-items-center rounded-full border border-white/[.1] bg-card-grad text-on-canvas-muted shadow-soft md:size-14 ${at}`}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="size-5 md:size-6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={ICON_PATH[icon]} />
      </svg>
      {bad && (
        <span className="absolute top-1 right-1 size-2 rounded-full bg-red" />
      )}
    </span>
  );
}

export function BigWords({
  chat,
  protocols,
  incidents,
}: {
  chat: ChatDemo;
  protocols: string[];
  incidents: { name: string; year: string; loss: string }[];
}) {
  const ref = useRef<HTMLElement>(null);
  useStage(ref, bigWords, MOTION_MQ);
  const words: Word[] = [
    {
      word: "Ask",
      line: "A question in your own words, answered from the run that really happened.",
      glyphs: [
        { icon: "waves", at: "-top-12 left-3 md:-top-16 md:-left-4" },
        { icon: "fn", at: "-bottom-12 right-3 md:-right-4 md:-bottom-16" },
      ],
      min: "min-h-[494px] md:min-h-[517px] lg:min-h-[640px] xl:min-h-[700px]",
      visual: <AskVisual demo={chat} />,
      wait: visuals,
    },
    {
      word: "Move",
      line: "Deposit, swap and bridge on Portaldot V3 — told what happens first.",
      glyphs: [
        { icon: "plug", at: "-top-12 right-3 md:-top-16 md:-right-4" },
        { icon: "user", at: "-bottom-12 left-3 md:-bottom-16 md:-left-4" },
      ],
      min: "min-h-[474px] md:min-h-[491px] lg:min-h-[620px] xl:min-h-[660px]",
      visual: <MoveVisual />,
      wait: visuals,
    },
    {
      word: "Learn",
      line: "How the protocols you depend on work, and how others lost the money.",
      glyphs: [
        { icon: "warn", at: "-top-12 left-3 md:-top-16 md:-left-4", bad: true },
        { icon: "check", at: "-bottom-12 right-3 md:-right-4 md:-bottom-16" },
      ],
      min: "min-h-[700px] md:min-h-[505px] lg:min-h-[634px] xl:min-h-[674px]",
      visual: <LearnVisual protocols={protocols} incidents={incidents} />,
      wait: visuals,
    },
  ];
  return (
    <section ref={ref} data-tone="words" aria-label="Ask, move, learn">
      {/* one point, one block. Each keeps its own space on the page, so no word can ever be
          printed over a panel and no panel can be cut in half — which is what a pinned stage
          clipping across two columns did. */}
      {words.map((w, i) => (
        <div
          key={w.word}
          data-lp="word"
          className="mx-auto grid max-w-[1240px] items-start gap-10 px-4 py-20 md:grid-cols-[minmax(0,clamp(240px,26vw,360px))_1fr] md:gap-16 md:px-6 md:py-0"
        >
          <div data-lp="head" className="lp-words-head">
            <p className="mb-4 font-mono text-[12px] text-on-canvas-muted tracking-[0.08em]">
              {`${String(i + 1).padStart(2, "0")} / ${String(words.length).padStart(2, "0")}`}
            </p>
            <h2
              aria-label={w.word}
              className="font-light text-[clamp(76px,10vw,150px)] text-on-canvas leading-[0.9] tracking-[-0.06em]"
            >
              {[...w.word].map((c, j) => (
                <span
                  // biome-ignore lint/suspicious/noArrayIndexKey: letters repeat, their position is the identity
                  key={j}
                  data-lp="letter"
                  aria-hidden="true"
                  className="inline-block"
                >
                  {c}
                </span>
              ))}
            </h2>
            <p
              data-lp="line"
              className="mt-6 max-w-[420px] text-balance text-[16px] text-on-canvas-muted leading-relaxed md:text-[18px]"
            >
              {w.line}
            </p>
          </div>

          {/* the panel's own plate, with room inside it for the badges that hang off the
              visual's corners — they are inside the block, so nothing is ever clipped */}
          {/* the cell is a screen tall so the word beside it has something to stay level with;
              the plate inside hugs its visual rather than becoming a screen-tall empty box */}
          <div className="flex min-w-0 items-center justify-center md:min-h-[100svh]">
            <div data-lp="plate" className="lp-words-plate relative w-full">
              {w.glyphs.map((g) => (
                <Glyph key={g.icon} {...g} />
              ))}
              <Lazy className={`w-full ${w.min} md:min-h-0`} wait={w.wait}>
                {w.visual}
              </Lazy>
            </div>
          </div>
        </div>
      ))}
    </section>
  );
}
