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
          Start from your own run,
          <br />
          <span className="text-white/70">not a blank file.</span>
        </h2>
      </div>

      {/* what Dort reads, as cards rather than as a diagram of three logos on wires: a card can
          carry the command, the chains and the fact that the exporter has no dependencies, and
          those are what answer "what do I do with this?" */}
      <div className="lp-sg-bento mx-auto grid w-full max-w-[1080px] gap-3 px-4 md:grid-cols-2 md:px-6 lg:grid-cols-6">
        <div aria-hidden="true" data-lp="bg" className="lp-bento-bg" />

        <article data-lp="card" className="lp-bento lg:col-span-4">
          <span className="lp-bento-mark">{marks[0]?.node}</span>
          <h3 className="mt-4 font-medium text-[21px] text-on-canvas tracking-[-0.01em]">
            Your own <code className="font-mono text-[19px]">forge test</code>
          </h3>
          <p className="mt-2.5 max-w-[62ch] text-[13.5px] text-on-canvas-muted leading-relaxed">
            One command writes one file. It runs your suite, decodes every frame
            with your project&rsquo;s own ABIs and solc source maps, and writes{" "}
            <code className="font-mono text-[13px]">dort-data.json</code>. Dort
            reads that file and draws it — it never runs analysis of its own, so
            there is nothing of ours between you and what Foundry said.
          </p>
          <p className="lp-bento-cmd mt-4 self-start rounded-full border border-white/[.12] bg-white/[.06] px-3.5 py-1.5 font-mono text-[12.5px] text-on-canvas">
            node dort-export.mjs
          </p>
        </article>

        <article data-lp="card" className="lp-bento lg:col-span-2">
          <span className="lp-bento-mark">{marks[2]?.node}</span>
          <h3 className="mt-4 font-medium text-[18px] text-on-canvas">
            Seven testnets, forked
          </h3>
          <p className="mt-2 text-[13.5px] text-on-canvas-muted leading-relaxed">
            <code className="font-mono text-[12.5px]">
              --chain base-sepolia
            </code>{" "}
            runs the same suite against a fork, so the balances and the code are
            the chain&rsquo;s, not a fixture&rsquo;s.
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

        {/* no mark: the Solidity one sat here while this card was about source lines, and a
            logo that no longer matches its card is worse than none */}
        <article data-lp="card" className="lp-bento lg:col-span-2">
          <h3 className="font-medium text-[18px] text-on-canvas">
            Or a transaction that already happened
          </h3>
          <p className="mt-2 text-[13.5px] text-on-canvas-muted leading-relaxed">
            Paste a hash and Dort asks the node for the call tree —{" "}
            <code className="font-mono text-[12.5px]">
              debug_traceTransaction
            </code>{" "}
            on Portaldot V3 — then reads what the transaction actually did,
            rather than guessing from a function name.
          </p>
        </article>

        <article data-lp="card" className="lp-bento lg:col-span-4">
          <h3 className="font-medium text-[18px] text-on-canvas">
            Plain Node, nothing else
          </h3>
          <p className="mt-2 text-[13.5px] text-on-canvas-muted leading-relaxed">
            The exporter is a handful of{" "}
            <code className="font-mono text-[12.5px]">.mjs</code> files you curl
            into your project. They import each other and{" "}
            <code className="font-mono text-[12.5px]">node:</code>, and nothing
            from npm — so there is no install to audit before you can run it.
          </p>
        </article>
      </div>

      <div className="lp-sg-product">{children}</div>
    </section>
  );
}
