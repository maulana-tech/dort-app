"use client";

import dynamic from "next/dynamic";
import { type ReactNode, useRef } from "react";
import { ICON_PATH, type IconKey } from "@/features/atlas/utils/icons";
import { type Gsap, Lazy, MOTION_MQ, useStage } from "./motion";
import type { ChatDemo } from "./stats";

// the visuals are their own chunk, fetched as their spot nears
const visuals = () => import("./WordVisuals");
const AskVisual = dynamic(() => visuals().then((m) => m.AskVisual));
const MoveVisual = dynamic(() => visuals().then((m) => m.MoveVisual));
const LearnVisual = dynamic(() => visuals().then((m) => m.LearnVisual));

type Layout = "left" | "right" | "top";

type Word = {
  word: string;
  line: string;
  /** word + copy left of the visual, right of it, or above it (the word slides up as it rises) */
  layout: Layout;
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
 * Genie: three giant words ('Create' / 'Like' / 'Magic'), each letter dropping in on its own with
 * the scroll, mascots beside them. Here 'Trace' / 'Test' / 'Triage', the three things Dort does,
 * each sharing its screen with the product doing it (WordVisuals): the word and its line on one
 * side, the live UI on the other (or under it, the word sliding up as it rises), the UI scrubbing
 * in (rise, 0.96 → 1, tilted back → flat) with the icon badges orbiting its corners. Phones stack
 * word, line, visual; reduced motion shows everything in place.
 */
function bigWords(root: HTMLElement, gsap: Gsap) {
  const orbit = matchMedia("(min-width: 768px)").matches ? 26 : 8;
  for (const block of gsap.utils.toArray<HTMLElement>("[data-lp=word]", root)) {
    const q = gsap.utils.selector(block);
    const [visual] = q("[data-lp=visual]");
    gsap
      .timeline({
        scrollTrigger: {
          trigger: block,
          start: "top 85%",
          end: "top 25%",
          scrub: 0.6,
        },
      })
      .fromTo(
        q("[data-lp=letter]"),
        {
          yPercent: -140,
          rotate: (i) => TILT[i % TILT.length],
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
    // the visual rises; the word above it slides up out of the way on the same trigger
    const rise = gsap.timeline({
      scrollTrigger: {
        trigger: visual,
        start: "top 100%",
        end: "top 40%",
        scrub: 0.6,
      },
    });
    rise.fromTo(
      visual,
      {
        y: 140,
        scale: 0.96,
        rotateX: 12,
        autoAlpha: 0,
        transformPerspective: 1400,
        transformOrigin: "50% 0%",
      },
      {
        y: 0,
        scale: 1,
        rotateX: 0,
        autoAlpha: 1,
        ease: "power2.out",
      },
      0,
    );
    if (block.dataset.layout === "top")
      rise.fromTo(q("[data-lp=head]"), { y: 60 }, { y: -40, ease: "none" }, 0);
    // the badges circle their corner of the visual while it passes, both on one trigger
    // (a tighter circle on phones, where the badges sit in the gap above and below the visual)
    const spin = gsap.timeline({
      scrollTrigger: {
        trigger: block,
        start: "top bottom",
        end: "bottom top",
        scrub: true,
      },
    });
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

const GRID: Record<Layout, string> = {
  left: "md:grid-cols-[4fr_7fr]",
  right: "md:grid-cols-[7fr_4fr]",
  top: "",
};

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
      layout: "left",
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
      layout: "right",
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
      layout: "top",
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
      {words.map((w) => (
        <div
          key={w.word}
          data-lp="word"
          data-layout={w.layout}
          className={`mx-auto grid max-w-[1240px] items-center gap-12 px-4 py-24 md:min-h-[100svh] md:gap-16 md:px-6 md:py-32 ${GRID[w.layout]}`}
        >
          <div
            data-lp="head"
            className={
              w.layout === "top"
                ? "text-center"
                : w.layout === "right"
                  ? "md:order-last md:text-right"
                  : ""
            }
          >
            <h2
              aria-label={w.word}
              className={`font-light text-on-canvas leading-[0.9] tracking-[-0.06em] ${
                w.layout === "top"
                  ? "text-[clamp(96px,17vw,240px)]"
                  : "text-[clamp(96px,11vw,168px)]"
              }`}
            >
              {[...w.word].map((c, i) => (
                <span
                  // biome-ignore lint/suspicious/noArrayIndexKey: letters repeat, their position is the identity
                  key={i}
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
              className={`mt-6 max-w-[420px] text-balance text-[16px] text-on-canvas-muted leading-relaxed md:text-[18px] ${
                w.layout === "top"
                  ? "mx-auto"
                  : w.layout === "right"
                    ? "md:ml-auto"
                    : ""
              }`}
            >
              {w.line}
            </p>
          </div>
          <div data-lp="visual" className="relative min-w-0">
            {w.glyphs.map((g) => (
              <Glyph key={g.icon} {...g} />
            ))}
            <Lazy className={w.min} wait={w.wait}>
              {w.visual}
            </Lazy>
          </div>
        </div>
      ))}
    </section>
  );
}
