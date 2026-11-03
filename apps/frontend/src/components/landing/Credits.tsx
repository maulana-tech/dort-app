import { creditsFrom, TIERS } from "@/features/ai/utils/allowance";
import "./bento.css";

/**
 * Why connecting a wallet does something here.
 *
 * The honest framing, and the only one this page is allowed: Dort offers a model somebody pays
 * for, so it needs a brake, and it uses the chain instead of a login. A faucet claim is the
 * price. That is access control, not an economy — there is no token, nothing is transferred and
 * nothing is recorded on a chain — and calling it anything grander would be the exact move the
 * rest of this product exists to refuse. A page that will not let a model say "safe" does not
 * get to call a rate limit a game.
 *
 * The numbers are imported rather than written, so the page cannot drift from the server: change
 * a tier and this section changes with it.
 */
const ONE = 10n ** 18n;

const RUNGS: { label: string; calls: number; how: string }[] = [
  {
    label: "Just arrived",
    calls: TIERS.anon.calls,
    how: "No wallet, nothing signed. Enough to see whether any of this is for you — a page that is dead until you connect is a page most people close.",
  },
  {
    label: "Wallet proved",
    calls: TIERS.wallet.calls,
    how: "One signature, good for the hour. It moves nothing and approves nothing; it says the address asking is yours, so your questions are counted as yours rather than shared with everyone behind the same exit address.",
  },
  {
    label: "Been to a faucet",
    calls: creditsFrom(ONE),
    how: "Hold anything on a chain Dort reads and it counts as credit, ten questions per whole token. Any chain it supports — history on Base is not told to go and use Portaldot first.",
  },
];

export function Credits() {
  return (
    <section data-tone="credits" aria-label="Why connect a wallet">
      <div className="mx-auto grid max-w-[1080px] gap-10 px-4 py-24 md:px-6 md:py-32 lg:grid-cols-[minmax(0,420px)_1fr] lg:gap-16">
        <div>
          <h2 className="font-light text-[clamp(32px,4.2vw,56px)] text-on-canvas leading-[1.02] tracking-[-0.03em]">
            A wallet,
            <br />
            <span className="text-white/70">not a login.</span>
          </h2>
          <p className="mt-6 max-w-[420px] text-[15px] text-on-canvas-muted leading-relaxed md:text-[16px]">
            Dort can answer with a model somebody pays for, so it needs a brake.
            It uses the chain for one instead of an account you have to make: a
            faucet claim is the price of asking more.
          </p>
          <p className="mt-4 max-w-[420px] text-[13.5px] text-on-canvas-muted leading-relaxed">
            Which is all it is. There is no token, nothing is transferred and
            nothing is written to a chain — this buys a faucet&rsquo;s worth of
            friction, not an identity, and a wallet&rsquo;s tokens can be moved
            to a second address and counted again. A page that will not let a
            model say &ldquo;safe&rdquo; does not get to oversell its own rate
            limit.
          </p>
          {/* Where this is meant to go, marked as intent because it is intent: no contract here
              charges anything today. The vault takes no fee and neither does the escrow — the
              only "fee" in either is the code that handles a fee-on-transfer *asset* — and the
              30 bps on a swap belongs to Portaldot's own pools, not to us. Saying otherwise in
              the present tense would be the move this whole product refuses. */}
          <p className="mt-5 max-w-[420px] border-white/[.12] border-l-2 pl-4 text-[13px] text-on-canvas-muted leading-relaxed">
            <span className="text-on-canvas">Where this is going.</span> On a
            mainnet the allowance should be funded by what the protocol earns —
            a small cut of a bridged transfer, of a vault&rsquo;s yield — rather
            than by whoever runs the deployment. On a testnet it should not: the
            tokens are free, so a fee there would be theatre, and a contract
            that takes one in rehearsal is a contract nobody can read as the one
            that ships. So none of these charges anything today, the operator
            pays, and this page says so rather than implying a business model it
            has not built.
          </p>
        </div>

        <ul className="grid gap-3 self-center">
          {RUNGS.map((r) => (
            <li key={r.label} className="lp-bento">
              <div className="flex items-baseline gap-3">
                <span className="font-mono text-[26px] text-on-canvas tabular-nums">
                  {r.calls}
                </span>
                <span className="text-[13px] text-on-canvas-muted">
                  questions an hour
                </span>
                <span className="ml-auto text-[13px] text-on-canvas">
                  {r.label}
                </span>
              </div>
              <p className="mt-2 text-[13px] text-on-canvas-muted leading-relaxed">
                {r.how}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
