"use client";

import { type ReactNode, useEffect, useRef } from "react";
import { type Gsap, useStage } from "./motion";
import "./bento.css";

/** the square the product window grows out of */
const SQ = 56;

/** every chain the exporter can fork, in the order foundry/dort-chains.mjs lists them */
const CHAINS = [
  "Portaldot V3",
  "Ethereum",
  "Arbitrum",
  "Base",
  "Robinhood",
  "HyperEVM",
  "Tempo",
];

/**
 * "Start from your own run": what Dort reads, as a bento of cards, and then the live app growing
 * out of a square in the middle of them.
 *
 * The cards replace a hub diagram — three marks on wires around a core — which looked handsome
 * and said nothing: a reader learned that Dort has something to do with Foundry, Solidity and a
 * chain, which they could already guess. A card can carry the command, the seven testnets and
 * the fact that the exporter has no dependencies, and those are the things that actually answer
 * "what do I do with this?".
 *
 * Genie's move is kept, because it is the page's one big transition: a pinned stage (~2.6
 * viewports) where the cards lift away, a tiny square appears where they were, and it grows into
 * the live app, tilted on the way in and landing flat, its view tabs arriving once it has.
 */
function scatterGrow(root: HTMLElement, gsap: Gsap) {
  const q = gsap.utils.selector(root);
  const cards = q("[data-lp=card]");
  const shot = q("[data-lp=frame]")[0] as HTMLElement;
  const win = shot.firstElementChild as HTMLElement;
  const square = q("[data-lp=square]");
  if (!shot || !win || !square[0]) return;
  const clipFrom = () => {
    const y = shot.offsetHeight / 2 - SQ / 2;
    const x = shot.offsetWidth / 2 - SQ / 2;
    return `inset(${y}px ${x}px ${y}px ${x}px round 14px)`;
  };

  gsap
    .timeline({
      defaults: { ease: "power2.inOut" },
      scrollTrigger: {
        trigger: root,
        start: "top top",
        end: "+=260%",
        pin: true,
        scrub: 0.6,
        invalidateOnRefresh: true,
      },
    })
    // 1. the cards lift away, nearest last, and the heading goes with them
    // (fromTo everywhere: invalidateOnRefresh must never record a later state)
    .fromTo(
      cards,
      { y: 0, autoAlpha: 1, scale: 1 },
      {
        y: -70,
        autoAlpha: 0,
        scale: 0.96,
        duration: 1.6,
        stagger: 0.12,
        ease: "power2.in",
      },
    )
    .fromTo(
      q("[data-lp=head]"),
      { y: 0, autoAlpha: 1 },
      { y: -60, autoAlpha: 0, duration: 1.2 },
      "<0.3",
    )
    // 2. a square takes their place, in the middle of where they were
    .fromTo(
      square,
      { autoAlpha: 0, scale: 0.85 },
      { autoAlpha: 1, scale: 1, duration: 0.6, ease: "back.out(2)" },
      "-=0.3",
    )
    // 3. the square grows into the live window, tilted on the way in, landing flat
    .addLabel("grow")
    .fromTo(
      win,
      { clipPath: clipFrom, autoAlpha: 0 },
      {
        clipPath: "inset(0px 0px 0px 0px round 18px)",
        autoAlpha: 1,
        duration: 3.4,
      },
      "grow",
    )
    .fromTo(
      square,
      { width: SQ, height: SQ, borderRadius: 14 },
      {
        width: () => shot.offsetWidth,
        height: () => shot.offsetHeight,
        borderRadius: 18,
        duration: 3.4,
      },
      "grow",
    )
    .fromTo(
      shot,
      { rotateX: 22, rotateZ: -4, y: () => innerHeight * 0.12 },
      { rotateX: 0, rotateZ: 0, y: 0, duration: 3.4 },
      "grow",
    )
    .fromTo(
      q("[data-lp=bg]"),
      { autoAlpha: 1 },
      { autoAlpha: 0.35, duration: 3.4 },
      "grow",
    )
    .to(square, { autoAlpha: 0, duration: 0.5 }, "grow+=3")
    // 4. the view tabs arrive, then a short hold on the app
    .fromTo(
      q("[data-lp=tabs]"),
      { autoAlpha: 0, y: 24 },
      { autoAlpha: 1, y: 0, duration: 0.8 },
      "grow+=2.9",
    )
    .to({}, { duration: 1.2 });
}

export function ScatterGrow({
  marks,
  children,
}: {
  marks: { title: string; href: string; node: ReactNode }[];
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  useStage(ref, scatterGrow);
  // the packets only loop while the stage is on screen
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      el.toggleAttribute("data-live", e.isIntersecting);
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <section ref={ref} id="product" data-tone="product" className="lp-sg">
      <div data-lp="head" className="lp-sg-head px-4 text-center">
        <h2 className="font-medium text-[clamp(30px,4vw,50px)] text-on-canvas leading-[1.04] tracking-[-0.03em]">
          The code you have to trust
          <br />
          <span className="text-white/70">is rarely yours to read.</span>
        </h2>
      </div>

      {/* what Dort reads, as cards rather than as a diagram of three logos on wires: a card can
          carry the command, the chains and the fact that the exporter has no dependencies, and
          those are what answer "what do I do with this?" */}
      <div className="lp-sg-bento mx-auto grid w-full max-w-[1080px] gap-3 px-4 md:grid-cols-2 md:px-6 lg:grid-cols-6">
        <div aria-hidden="true" data-lp="bg" className="lp-bento-bg" />

        {/* The problem, then what this is. The section opens the page's argument and the
            close-up below shows it running; what you can DO with what you read belongs to
            OnChain further down, which already opens with "Reading is half of it." */}
        <article data-lp="card" className="lp-bento lg:col-span-4">
          <h3 className="font-medium text-[21px] text-on-canvas tracking-[-0.01em]">
            Two bad answers, and nothing in between
          </h3>
          <p className="mt-2.5 max-w-[62ch] text-[13.5px] text-on-canvas-muted leading-relaxed">
            Most of the code you have to trust was written by someone else, and
            the usual ways to look at it are a wall of addresses and opcodes, or
            a chatbot with nothing behind what it says. One cannot be read; the
            other cannot be checked. Dort is the workbench in between: the
            evidence on screen, beside the explanation of it.
          </p>
        </article>

        <article data-lp="card" className="lp-bento lg:col-span-2">
          <h3 className="font-medium text-[18px] text-on-canvas">
            One box, whatever you arrived with
          </h3>
          <p className="mt-2 text-[13.5px] text-on-canvas-muted leading-relaxed">
            A question, a contract address, a transaction hash, or your own{" "}
            <code className="font-mono text-[12.5px]">.sol</code> files. Dort
            works out which it is; you never have to say.
          </p>
        </article>

        <article data-lp="card" className="lp-bento lg:col-span-2">
          <span className="lp-bento-mark">{marks[2]?.node}</span>
          <h3 className="mt-4 font-medium text-[18px] text-on-canvas">
            Evidence under every answer
          </h3>
          <p className="mt-2 text-[13.5px] text-on-canvas-muted leading-relaxed">
            Your own <code className="font-mono text-[12.5px]">forge test</code>
            , or the chain&rsquo;s own call tree read with{" "}
            <code className="font-mono text-[12.5px]">
              debug_traceTransaction
            </code>
            {" — "}
            <span className="text-on-canvas">
              which, of the four chains here, only Portaldot V3 will answer
            </span>
            . Base Sepolia refuses it by filter; Ethereum and Arbitrum Sepolia
            do not have the method at all. Seven testnets can still be forked,
            so the balances and the code are the chain&rsquo;s and not a
            fixture&rsquo;s.
          </p>
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {CHAINS.map((c) => (
              <li
                key={c}
                className="rounded-full bg-white/[.07] px-2.5 py-1 text-[12px] text-on-canvas-muted"
              >
                {c}
              </li>
            ))}
          </ul>
        </article>

        <article data-lp="card" className="lp-bento lg:col-span-4">
          <h3 className="font-medium text-[18px] text-on-canvas">
            Candidates to check — never a verdict
          </h3>
          <p className="mt-2 max-w-[62ch] text-[13.5px] text-on-canvas-muted leading-relaxed">
            Every reading comes back as a list of things worth checking, each
            with the concrete way to confirm or rule it out, and beside it what
            the reading could not look at. No score, no clean bill of health: a
            tool believed when it says &ldquo;no issues found&rdquo; is worse
            than no tool at all, because the person ships, the money goes, and
            the tool caused it.
          </p>
        </article>
      </div>

      <div className="lp-sg-product">{children}</div>
    </section>
  );
}
