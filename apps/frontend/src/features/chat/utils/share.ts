/**
 * What a shared link says about itself.
 *
 * Share buttons usually carry a slogan. This one carries the one sentence that tells someone
 * whether to click: what they can do when they land, in their own terms rather than ours.
 *
 * No referral code and no credit for pressing it. A share cannot be verified — a button that
 * opens a compose window has no idea whether anything was posted — so a credit paid for pressing
 * it is a credit paid for pressing it, and the first reader who notices presses it a thousand
 * times. Rewarding a referral is possible, but only by remembering who proved what, which is a
 * ledger and not a button (features/ai/utils/allowance has the same note).
 */
export const SHARE_TITLE = "Dort";

export function shareText(url: string): string {
  return `Dort reads a contract you did not write. Paste a transaction hash, an address, or your own .sol files, and it tells you what to check — and what it could not check. ${url}`;
}

/** The link to hand out: this deployment, on the page that does the reading. */
export const shareUrl = (origin: string): string =>
  `${origin.replace(/\/+$/, "")}/chat`;
