/* biome-ignore-all lint/performance/noImgElement: tiny static brand assets, no next/image optimisation needed */

/** Brand mark: the Dort starburst on its white rounded tile (public/brand/mark-tile.png). */
export function LogoMark({ size = 36 }: { size?: number }) {
  return (
    <img
      src="/brand/mark-tile.png"
      alt=""
      width={size}
      height={size}
      className="shrink-0 rounded-tile shadow-soft"
    />
  );
}

/**
 * Full wordmark: the star over "DORT" (public/brand/logo-text.png).
 *
 * White letters inside a brand-blue outline, with a white star rising above them — so it is
 * drawn on the blue canvas and nowhere else. The one place it sits over something pale, the
 * landing's hub core, gives itself a blue tile for exactly this reason (hub.css).
 *
 * 495 x 288, trimmed to the artwork's own bounds: 1.719 wide for every 1 tall. The old mark was
 * 3.01, and the difference is the star — which is why the heights at the call sites went up
 * when this one arrived. At a given height the letters here are larger than the old wordmark's,
 * not smaller, because they are only two thirds of the picture.
 */
const RATIO = 495 / 288;

export function LogoText({ height = 36 }: { height?: number }) {
  return (
    <img
      src="/brand/logo-text.png"
      alt="Dort"
      width={Math.round(height * RATIO)}
      height={height}
      className="shrink-0"
    />
  );
}
