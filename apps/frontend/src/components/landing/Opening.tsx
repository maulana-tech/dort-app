import { sampleRun } from "./stats";
import "./opening.css";

/*
 * Twentieth pass (2026-11-05, user ref: a travel site's opening screen).
 *
 *  O1 user screenshot — a small grey eyebrow centred over one enormous headline, and under it a
 *     pale isometric model of a city seen from above, its far edge dissolving into the page.
 *     Small white pills float over single buildings carrying one number each, and one object in
 *     the model is picked out while everything else stays neutral.
 *     → this section: eyebrow → headline → an isometric model, the pills carrying the sample
 *       run's real numbers, and the one lit block being the piece a finding sits in.
 *
 * What was deliberately NOT copied. The reference sets its headline in heavy uppercase; DESIGN.md
 * forbids both (`No uppercase`, weights 400/500 only — the landing's own headings go lighter
 * still). So size carries the emphasis and the weight stays light. The reference is white-on-white
 * with a lime accent; here the only colour is the red finding dot, because red means finding.
 *
 * Two things this file does rather than eyeball:
 *  - the faces are opaque, each one its own colour lerped toward the page behind it by depth.
 *    Translucent faces let the blocks behind show through and the model read as stacked glass;
 *    atmospheric fade is also how the reference pushes its far edge away.
 *  - the pills are anchored to the computed apex of a real block, not to guessed percentages.
 *    The first attempt used hand-written left/top and every pill landed below the fold.
 *
 * The numbers are read, not written: the same `sampleRun()` the rest of the page uses, so a
 * re-export moves them and no pill can drift into a claim the run does not support.
 */

/** 2:1 isometric: half the width of a cell, and half its depth. */
const HW = 46;
const HD = 23;
const N = 9;
/** The SVG's own box. The pills are positioned as percentages of it. */
const VB = { x: -430, y: -180, w: 860, h: 600 };

/** The page behind the model, and the three faces before any depth fade. */
const BG = [9, 74, 180];
const FACE = {
  top: [112, 150, 211],
  left: [78, 125, 201],
  right: [53, 107, 194],
};
const LIT = {
  top: [255, 255, 255],
  left: [214, 228, 250],
  right: [185, 205, 240],
};

const mix = (c: number[], t: number) =>
  `rgb(${c.map((v, k) => Math.round(v + (BG[k] - v) * t)).join(",")})`;

/**
 * A deterministic height per cell. A seeded hash rather than Math.random: the server and the
 * client must draw the same city, and a re-render must not reshuffle it.
 */
function heightAt(i: number, j: number): number {
  const h = Math.sin(i * 12.9898 + j * 78.233) * 43758.5453;
  return h - Math.floor(h);
}

type Block = {
  i: number;
  j: number;
  h: number;
  cx: number;
  cy: number;
  /** where the apex sits in the SVG box, 0–1, which is where a pill is hung */
  xf: number;
  yf: number;
  /** 0 at the front, 1 at the far edge */
  depth: number;
};

/** The model, back to front — painter's order, so a nearer block covers the one behind it. */
function model(): Block[] {
  const out: Block[] = [];
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const r = heightAt(i, j);
      // a quarter of the plot stays empty, so the model reads as a place and not a bar chart
      if (r < 0.26) continue;
      const h = 26 + r * 132;
      const cx = (i - j) * HW;
      const cy = (i + j) * HD;
      out.push({
        i,
        j,
        h,
        cx,
        cy,
        xf: (cx - VB.x) / VB.w,
        yf: (cy - h - VB.y) / VB.h,
        depth: 1 - (i + j) / (2 * (N - 1)),
      });
    }
  }
  return out.sort((a, b) => a.i + a.j - (b.i + b.j));
}

/** The three faces of one block. Top catches the light, then the left, then the right. */
function Box({ b, lit }: { b: Block; lit: boolean }) {
  const { cx, cy, h } = b;
  const t = cy - h;
  const f = lit ? LIT : FACE;
  // the lit block is the subject: it keeps its full value however far back it stands
  const d = lit ? 0 : b.depth * 0.68;
  return (
    <g>
      <polygon
        points={`${cx},${t} ${cx + HW},${t + HD} ${cx},${t + HD * 2} ${cx - HW},${t + HD}`}
        fill={mix(f.top, d)}
      />
      <polygon
        points={`${cx - HW},${t + HD} ${cx},${t + HD * 2} ${cx},${cy + HD * 2} ${cx - HW},${cy + HD}`}
        fill={mix(f.left, d)}
      />
      <polygon
        points={`${cx + HW},${t + HD} ${cx},${t + HD * 2} ${cx},${cy + HD * 2} ${cx + HW},${cy + HD}`}
        fill={mix(f.right, d)}
      />
    </g>
  );
}

/** Pick one stat by a word in its label, so a reordered `stats` array cannot swap two pills. */
const pick = (s: { value: string; label: string }[], w: string) =>
  s.find((x) => x.label.includes(w));

/**
 * The tallest block standing in a horizontal band and high enough in the box that its pill is
 * on screen. Hanging a label off a real apex is what keeps the pills on buildings at every width.
 */
function anchor(
  bs: Block[],
  from: number,
  to: number,
  top: number,
  bottom: number,
  used: Block[],
) {
  return bs
    .filter(
      (b) =>
        b.xf >= from &&
        b.xf <= to &&
        // below the dissolving far edge and above the fold: where a building is solid
        b.yf > top &&
        b.yf < bottom &&
        !used.includes(b),
    )
    .sort((a, b) => a.yf - b.yf)[0];
}

export async function Opening() {
  const { stats } = await sampleRun();
  const bs = model();

  // the subject first: the piece a finding sits in, picked near the middle so it reads as the
  // thing the whole model is about
  const used: Block[] = [];
  const lit = anchor(bs, 0.36, 0.58, 0.26, 0.5, used) ?? bs[0];
  used.push(lit);

  // each pill gets its own band, across and down, or they all pick the same tall row and the
  // labels end up stacked in one corner — which is what the first arrangement did
  const spots = [
    {
      s: pick(stats, "trace frames"),
      w: "frames decoded",
      b: anchor(bs, 0.06, 0.28, 0.34, 0.62, used),
    },
    { s: pick(stats, "findings"), w: "findings", b: lit, bad: true },
    {
      s: pick(stats, "forge tests"),
      w: "tests traced",
      b: anchor(bs, 0.68, 0.92, 0.4, 0.68, used),
    },
    {
      s: pick(stats, "line coverage"),
      w: "line coverage",
      b: anchor(bs, 0.34, 0.6, 0.56, 0.8, used),
    },
  ];
  for (const sp of spots) if (sp.b) used.push(sp.b);
  const pills = spots.filter((p) => p.s && p.b);

  return (
    <section
      data-tone="opening"
      aria-label="What Dort shows you"
      className="lo relative overflow-hidden"
    >
      <div className="relative mx-auto flex min-h-[calc(100svh-76px)] max-w-[1240px] flex-col px-4 pt-10 md:px-6 md:pt-12">
        <div className="lo-head relative z-20 text-center">
          <p className="text-[clamp(13px,1.3vw,16px)] text-on-canvas-dim">
            Know what it
          </p>
          {/* one line, sized to fill the measure. Light weight on purpose — see the note above */}
          <h1 className="mt-1 font-light text-[clamp(44px,11.5vw,162px)] text-on-canvas leading-[0.92] tracking-[-0.045em]">
            actually did.
          </h1>
        </div>

        {/* the model runs off the bottom of the screen, as the reference's city does: you are
            looking down at something that continues past the frame */}
        <div className="lo-stage relative z-10 grow">
          <div className="lo-model">
            <svg
              viewBox={`${VB.x} ${VB.y} ${VB.w} ${VB.h}`}
              aria-hidden="true"
              className="block w-full"
            >
              <title>An isometric model of a contract under review</title>
              {bs.map((b) => (
                <Box key={`${b.i}-${b.j}`} b={b} lit={b === lit} />
              ))}
            </svg>

            {pills.map((p) => (
              <span
                key={p.w}
                className="lo-pill"
                style={{
                  left: `${(p.b as Block).xf * 100}%`,
                  top: `${(p.b as Block).yf * 100}%`,
                }}
              >
                <span className={`lo-dot ${p.bad ? "lo-dot-bad" : ""}`} />
                <span className="font-mono text-[13px]">{p.s?.value}</span>
                <span className="text-[12.5px] opacity-55">{p.w}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
