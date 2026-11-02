/**
 * A token's own mark, for the amount field and balance rows.
 *
 * The files are from spothq/cryptocurrency-icons (public/logos/tokens), which is **CC0** — the
 * better-known Cryptofonts/cryptoicons set is GPL-3, and bundling that would put terms on this
 * whole project that it does not otherwise carry. CC0 imposes none, whatever licence the repo
 * itself ends up under.
 *
 * Portaldot's own assets (POT, WPOT) use Portaldot's mark. A wrapped token (wUSDC) shows the mark
 * of what it wraps, since that is what a holder is really looking for. Anything unknown gets the
 * generic coin rather than a broken image.
 */
const FILE: Record<string, string> = {
  usdc: "/logos/tokens/usdc.svg",
  usdt: "/logos/tokens/usdt.svg",
  eth: "/logos/tokens/eth.svg",
  pot: "/logos/chains/portaldot.png",
  wpot: "/logos/chains/portaldot.png",
};

/** "wUSDC" → "usdc": the wrapper shows what it wraps. */
function key(symbol: string): string {
  const s = symbol.trim().toLowerCase();
  if (FILE[s]) return s;
  const unwrapped = s.replace(/^[wp]/, "");
  return FILE[unwrapped] ? unwrapped : "generic";
}

export function TokenIcon({
  symbol,
  size = 24,
  className = "",
}: {
  symbol: string;
  size?: number;
  className?: string;
}) {
  const src = FILE[key(symbol)] ?? "/logos/tokens/generic.svg";
  return (
    // a small static mark: next/image would add nothing here
    // biome-ignore lint/performance/noImgElement: tiny static asset
    <img
      src={src}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      className={`block flex-none rounded-full ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
