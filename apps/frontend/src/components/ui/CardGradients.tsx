/**
 * SVG <defs> for the blue card gradients (DESIGN.md "Cards"), so SVG views can use
 * `fill: url(#g-card)` / `url(#g-inner)` like the HTML `bg-card-grad` / `bg-inner-grad`.
 * Static ids keep it SSR-safe; only one atlas view renders at a time.
 */
export function CardGradients() {
  return (
    <defs>
      <linearGradient id="g-card" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ffffff" />
        <stop offset="1" stopColor="#f3f7fe" />
      </linearGradient>
      <linearGradient id="g-inner" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#f8fbff" />
        <stop offset="1" stopColor="#eef4fd" />
      </linearGradient>
    </defs>
  );
}
