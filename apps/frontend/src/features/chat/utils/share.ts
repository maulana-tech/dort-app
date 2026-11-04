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

/**
 * The sentence on its own.
 *
 * Kept apart from the link because the two are wanted separately: the clipboard and the native
 * sheet want one string ending in the URL, while every network here takes the link as its own
 * field and renders a preview card from it. Pasting the URL into the text as well gets you the
 * link twice — once as text, once as the card.
 */
export const SHARE_BLURB =
  "Dort reads a contract you did not write. Paste a transaction hash, an address, or your own .sol files, and it tells you what to check — and what it could not check.";

export function shareText(url: string): string {
  return `${SHARE_BLURB} ${url}`;
}

/** The link to hand out: this deployment, on the page that does the reading. */
export const shareUrl = (origin: string): string =>
  `${origin.replace(/\/+$/, "")}/chat`;

/** One place to send a link. `href` is complete and already encoded. */
export type ShareTarget = {
  id: string;
  label: string;
  href: (url: string) => string;
};

const q = encodeURIComponent;

/**
 * Where a reader can send this, and nothing else.
 *
 * Four, not twelve. A share menu that lists every network anyone ever used is a menu nobody
 * reads, and the ones here are where this tool's readers actually are — auditors and the people
 * who ask them things.
 *
 * Every link is an ordinary compose URL: it opens that network's own composer with the text
 * filled in, and the reader still has to press post. Nothing is sent by opening the menu, no
 * script from any of these networks is loaded into this page, and no identifier of ours rides
 * along — there is no ref, campaign or utm parameter anywhere below, so a link that travels
 * cannot be traced back to who pressed the button.
 *
 * The URL goes in each network's own field rather than inside the text. Farcaster is explicit
 * about this — a link inside `text` produces no embed and no preview — and the others behave
 * the same way in practice.
 */
export const SHARE_TARGETS: ShareTarget[] = [
  {
    id: "x",
    label: "X",
    href: (url) =>
      `https://x.com/intent/tweet?text=${q(SHARE_BLURB)}&url=${q(url)}`,
  },
  {
    id: "farcaster",
    label: "Farcaster",
    href: (url) =>
      `https://farcaster.xyz/~/compose?text=${q(SHARE_BLURB)}&embeds[]=${q(url)}`,
  },
  {
    id: "telegram",
    label: "Telegram",
    href: (url) =>
      `https://t.me/share/url?url=${q(url)}&text=${q(SHARE_BLURB)}`,
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    href: (url) =>
      `https://www.linkedin.com/sharing/share-offsite/?url=${q(url)}`,
  },
];
