"use client";

import { useEffect } from "react";

/**
 * Marks the document while a light surface is under the nav's band, so the bar can swap text
 * tokens instead of colour-shifting.
 *
 * mix-blend-mode was tried first and is the only CSS that guarantees contrast against any
 * backdrop — but what it guarantees is the *inverse* of what is underneath, and the inverse of
 * this page's blue is amber. White is the inverse of black, not of blue. The tokens already name
 * the right two colours for the two surfaces this app has: --on-canvas for text on the blue,
 * --fg for text on a light panel. All that was missing was knowing which one is there.
 *
 * An IntersectionObserver whose root is cropped to the top `band` pixels answers exactly that,
 * and costs nothing while nothing crosses it — a scroll handler would run on every frame of
 * every scroll to answer a question whose answer changes three times a page.
 */
export function NavTone({ band = 76 }: { band?: number }) {
  useEffect(() => {
    const lights = [
      ...document.querySelectorAll<HTMLElement>('[data-nav="light"]'),
    ];
    if (!lights.length) return;

    const over = new Set<Element>();
    let io: IntersectionObserver | null = null;

    const build = () => {
      io?.disconnect();
      over.clear();
      io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (e.isIntersecting) over.add(e.target);
            else over.delete(e.target);
          }
          document.documentElement.toggleAttribute(
            "data-nav-light",
            over.size > 0,
          );
        },
        // the root, cropped to the band the bar occupies: an element "intersects" only while it
        // is actually behind the nav
        { rootMargin: `0px 0px -${Math.max(0, innerHeight - band)}px 0px` },
      );
      for (const el of lights) io.observe(el);
    };

    build();
    // the band is a share of the viewport, so a resize changes what counts as behind the bar
    let t = 0;
    const onResize = () => {
      clearTimeout(t);
      t = window.setTimeout(build, 150);
    };
    addEventListener("resize", onResize);

    return () => {
      clearTimeout(t);
      removeEventListener("resize", onResize);
      io?.disconnect();
      document.documentElement.removeAttribute("data-nav-light");
    };
  }, [band]);

  return null;
}
