import { DocsSearch } from "@/components/docs/DocsSearch";
import { DocsSidebar } from "@/components/docs/DocsSidebar";
import { Footer } from "@/components/landing/Closing";
import { Nav } from "@/components/landing/Hero";

/**
 * /docs: the landing's nav (Docs lit), the pages in a left column and the page on the right, the
 * landing's footer under it. Shape from onorca.dev/docs (D1): search over grouped pages, one
 * reading column, Previous / Next at the foot.
 */
export default function DocsLayout({ children }: LayoutProps<"/docs">) {
  return (
    <div className="min-h-full bg-canvas">
      <Nav active="docs" />
      <div className="mx-auto flex max-w-[1240px] flex-col px-4 pt-10 md:px-6 lg:flex-row lg:gap-14">
        <DocsSidebar />
        {/* The article is a reading surface, so it is a white panel on the blue page; the sidebar
            stays on the blue and uses the on-canvas tones. */}
        <main className="min-w-0 flex-1 rounded-card border border-border bg-surface px-5 py-6 shadow-soft md:px-8 md:py-8">
          {children}
        </main>
      </div>
      <Footer />
      <DocsSearch />
    </div>
  );
}
