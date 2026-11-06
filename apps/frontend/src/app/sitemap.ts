import type { MetadataRoute } from "next";
import { SITE_URL } from "@/config/site";
import { hrefOf, PAGES } from "@/features/docs/pages";

/** The landing, every section, every protocol map and incident post-mortem, and the docs. */
export default function sitemap(): MetadataRoute.Sitemap {
  const page = (path: string, priority: number) => ({
    url: `${SITE_URL}${path}`,
    priority,
  });
  return [
    page("", 1),
    page("/chat", 0.8),
    page("/vault", 0.7),
    page("/bridge", 0.7),
    page("/swap", 0.7),
    page("/settings", 0.4),
    ...PAGES.map((p) => page(hrefOf(p), p.slug ? 0.5 : 0.7)),
  ];
}
