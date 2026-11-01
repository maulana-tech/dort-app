"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SLIDE } from "@/components/ui";

const ROUTES = [
  { href: "/trace", label: "Trace" },
  { href: "/atlas", label: "Atlas" },
  { href: "/bridge", label: "Bridge" },
  { href: "/explore", label: "Explore" },
  { href: "/exploits", label: "Exploits" },
] as const;

export function RouteTabs() {
  const path = usePathname();
  return (
    <nav className="flex gap-1.5">
      {ROUTES.map((r) => {
        const on = path.startsWith(r.href);
        return (
          <Link
            key={r.href}
            href={r.href}
            aria-current={on ? "page" : undefined}
            className={`relative isolate inline-flex h-9 items-center rounded-tile px-4 text-[14px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-white/25 ${on ? "text-primary" : "text-on-canvas hover:bg-white/15"}`}
          >
            {on && (
              <motion.span
                layoutId="route-tab"
                transition={SLIDE}
                className="absolute inset-0 -z-10 rounded-tile bg-on-canvas shadow-soft"
              />
            )}
            {r.label}
          </Link>
        );
      })}
    </nav>
  );
}
