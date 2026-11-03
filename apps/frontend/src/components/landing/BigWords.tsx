"use client";

import dynamic from "next/dynamic";
import { type ReactNode, useRef } from "react";
import { ICON_PATH, type IconKey } from "@/features/atlas/utils/icons";
import { type Gsap, Lazy, useStage } from "./motion";
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
 * The row only exists where it can work: wide enough for a word and a card side by side, and
 * only when motion is allowed. words.css carries the same query, so the layout and the timeline
 * can never disagree about which one is on screen — gated on motion alone, the script pinned
 * and translated a vertical stack sideways on every phone.
 */
const WORDS_MQ =
  "(prefers-reduced-motion: no-preference) and (min-width: 768px)";

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
  const q = gsap.utils.selector(root);
  const [track] = q("[data-lp=track]");
  const slides = q("[data-lp=slide]");
  const n = slides.length;
  if (!track || n < 2) return;

  // the distance is (n-1) stage widths. Measured, not expressed as a percentage: xPercent is a
  // share of the element's OWN width, and this track is one stage wide with its slides
  // overflowing it — so the usual -100*(n-1)/n would have moved two thirds of one screen
  // instead of two whole ones. offsetWidth is re-read on every refresh (invalidateOnRefresh),
  // so a resize cannot leave the row between slides.
  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: root,
      start: "top top",
      // one screen of scrolling per slide change: enough that a flick cannot skip one
      end: () => `+=${(n - 1) * 100}%`,
      pin: true,
      scrub: 1,
      invalidateOnRefresh: true,
      anticipatePin: 1,
    },
  });
  // one time unit per slide change, so a letter tween can be placed at the moment its slide
  // arrives rather than at a fraction nobody can read
  tl.to(
    track,
    {
      x: () => -(n - 1) * (track as HTMLElement).offsetWidth,
      ease: "none",
      duration: n - 1,
    },
    0,
  );

  // each word's letters tumble in as its slide comes level. The first slide is already on
  // screen when the pin takes hold, so its letters are left alone: a fromTo would hide them at
  // setup and the scrub's catch-up would show a wordless card for a beat.
  slides.forEach((_, i) => {
    if (i === 0) return;
    tl.fromTo(
      q(`[data-lp=slide]:nth-child(${i + 1}) [data-lp=letter]`),
      {
        yPercent: -120,
        rotate: (j: number) => TILT[j % TILT.length],
        autoAlpha: 0,
      },
      {
        yPercent: 0,
        rotate: 0,
        autoAlpha: 1,
        ease: "bounce.out",
        stagger: 0.08,
        duration: 0.5,
      },
      Math.max(0, i - 0.45),
    );
  });

  // the badges circle their corner for the whole stretch, on the same timeline so they cannot
  // run on past it
  const orbit = 20;
  for (const [i, g] of q("[data-lp=glyph]").entries()) {
    const r = i % 2 ? -orbit : orbit;
    tl.to(
      g,
      {
        // easeEach belongs INSIDE the keyframes object; as a sibling GSAP rejects it
        // ("Invalid property easeEach") and every orbit step runs linear instead of eased.
        keyframes: {
          x: [0, r, 0, -r, 0],
          y: [-r, 0, r, 0, -r],
          easeEach: "sine.inOut",
        },
        rotate: i % 2 ? -30 : 30,
        duration: tl.duration() || 1,
        ease: "none",
      },
      0,
    );
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
  useStage(ref, bigWords, WORDS_MQ);
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
      <div className="lp-words-stage mx-auto w-full max-w-[1320px] px-4 py-20 md:px-6">
        <div
          data-lp="track"
          className="lp-words-track flex flex-col gap-16 md:gap-0"
        >
          {words.map((w, i) => (
            // one point, one slide: the word and its card travel together, so nothing can ever
            // be printed over anything else however far the row moves
            <div key={w.word} data-lp="slide" className="lp-words-slide">
              {/* every slide is the same card: one height for all three, so the row does not
                  change shape as it moves and nothing is taller than the window that clips it.
                  Sized off the viewport, since that window is exactly one screen tall. */}
              <article className="grid items-center gap-8 rounded-[32px] bg-white p-6 shadow-float md:h-[min(78svh,720px)] md:grid-cols-[minmax(0,clamp(260px,26vw,380px))_1fr] md:gap-12 md:p-14">
                <div data-lp="head" className="min-w-0">
                  <p className="mb-4 font-mono text-[12px] text-primary/55 tracking-[0.08em]">
                    {`${String(i + 1).padStart(2, "0")} / ${String(words.length).padStart(2, "0")}`}
                  </p>
                  <h2
                    aria-label={w.word}
                    className="font-light text-[clamp(64px,8vw,132px)] text-primary leading-[0.9] tracking-[-0.06em]"
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
                    className="mt-5 max-w-[420px] text-balance text-[15px] text-body leading-relaxed md:text-[17px]"
                  >
                    {w.line}
                  </p>
                </div>

                {/* the badges hang off the visual's corners; the card's padding is what keeps
                    them inside the slide, where the window cannot cut them */}
                <div className="flex min-w-0 items-center justify-center md:h-full md:overflow-hidden">
                  <div className="relative w-full">
                    {w.glyphs.map((g) => (
                      <Glyph key={g.icon} {...g} />
                    ))}
                    <Lazy
                      className={`w-full ${w.min} md:min-h-0`}
                      margin="100% 200%"
                      wait={w.wait}
                    >
                      {w.visual}
                    </Lazy>
                  </div>
                </div>
              </article>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
