"use client";

import dynamic from "next/dynamic";
import { type CSSProperties, Fragment, type ReactNode, useRef } from "react";
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
 * The pinned layout only exists where it can work: wide enough for a word and a panel side by
 * side, and only when motion is allowed. Below that the section stays three plain blocks, which
 * is what the markup is without any of this. words.css matches this query exactly, so the CSS
 * and the timeline can never disagree about which layout is on screen.
 */
const WORDS_MQ =
  "(prefers-reduced-motion: no-preference) and (min-width: 768px)";

/** the letters of one word, dropping in with the bounce the section is built around */
const dropIn = (tl: gsap.core.Timeline, letters: Element[], at: string) =>
  tl.fromTo(
    letters,
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
      stagger: 0.1,
      duration: 0.9,
    },
    at,
  );

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
  const heads = q("[data-lp=head]");
  const panels = q("[data-lp=panel]");
  if (panels.length < 2) return;
  // one cell's width: what a panel has to travel for the next one to take its place. Measured
  // at every refresh, so a resize or a phone's address bar never leaves the row half a step out.
  const step = () => panels[0].getBoundingClientRect().width;

  const tl = gsap.timeline({
    defaults: { ease: "none" },
    scrollTrigger: {
      trigger: root,
      start: "top top",
      // ~1.3 screens of scroll per panel, so a flick never skips one; scrub 1 eases the
      // catch-up, which is what makes a sideways move read as one deliberate slide
      end: () => `+=${panels.length * 130}%`,
      pin: true,
      scrub: 1,
      invalidateOnRefresh: true,
    },
  });

  panels.forEach((_, k) => {
    const at = `p${k}`;
    tl.addLabel(at);
    const letters = q(
      `[data-lp=head]:nth-child(${k * 2 + 1}) [data-lp=letter]`,
    );
    const line = q(`[data-lp=head]:nth-child(${k * 2 + 1}) [data-lp=line]`);
    if (k === 0) {
      dropIn(tl, letters, at);
      tl.fromTo(
        line,
        { autoAlpha: 0, y: 24 },
        { autoAlpha: 1, y: 0, duration: 0.5 },
        `${at}+=0.5`,
      );
    } else {
      // the row and the word move together: a word is never left standing over a panel it does
      // not belong to, not even for the length of a crossfade
      tl.to(panels, { x: (i: number) => (i - k) * step(), duration: 1 }, at)
        .to(heads[k - 1], { autoAlpha: 0, y: -40, duration: 0.4 }, at)
        .set(heads[k], { autoAlpha: 1, y: 0 }, `${at}+=0.38`);
      dropIn(tl, letters, `${at}+=0.38`);
      tl.fromTo(
        line,
        { autoAlpha: 0, y: 24 },
        { autoAlpha: 1, y: 0, duration: 0.4 },
        `${at}+=0.75`,
      );
    }
    // the panel holds still a while before the next one takes its place
    tl.to({}, { duration: 0.9 });
  });

  // the badges circle their corner for the whole pinned stretch, on the same timeline so they
  // cannot run on past it. Added last, with the length the timeline turned out to have.
  const total = tl.duration();
  const orbit = 26;
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
        rotate: i % 2 ? -40 : 40,
        duration: total,
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
    <section
      ref={ref}
      data-tone="words"
      aria-label="Ask, move, learn"
      className="lp-words"
    >
      {/* word, panel, word, panel, word, panel — the order a phone reads and a screen reader
          follows. words.css deals them into two columns from md up; nothing here depends on it */}
      <div className="lp-words-stage mx-auto flex max-w-[1240px] flex-col gap-12 px-4 py-24 md:px-6">
        {words.map((w, i) => (
          <Fragment key={w.word}>
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
            <div
              data-lp="panel"
              // --i is the panel's place in the row; words.css turns it into the offset that
              // makes a row out of three things sharing one grid cell, before any script runs
              style={{ "--i": i } as CSSProperties}
              className="lp-words-panel flex items-center justify-center md:py-16"
            >
              {/* the badges hang off the visual's corners, and the stage clips: the room for
                  them has to be inside it, which is what the panel's padding is for */}
              <div className="relative w-full">
                {w.glyphs.map((g) => (
                  <Glyph key={g.icon} {...g} />
                ))}
                {/* a wide horizontal margin: panels two and three sit off to the right, outside
                    the viewport, so without it they would only mount as they slid in, and pop.
                    The measured min heights hold the empty spot in the stacked layout; pinned,
                    the panel sizes to the visual, which has a whole screen to fit in */}
                <Lazy
                  className={`w-full ${w.min} md:min-h-0`}
                  margin="100% 200%"
                  wait={w.wait}
                >
                  {w.visual}
                </Lazy>
              </div>
            </div>
          </Fragment>
        ))}
      </div>
    </section>
  );
}
