import Link from "next/link";
import type { ReactNode } from "react";
import { LogoText, MotionRoot } from "@/components/ui";
import { RunProvider } from "@/features/run";
import { DataBadge } from "../onboarding/DataBadge";
import { GuideButton } from "../onboarding/GuideButton";
import { RunDialog } from "../onboarding/RunDialog";
import { AiSettings } from "./AiSettings";
import { RouteTabs } from "./RouteTabs";
import "./header.css";

/** App frame shared by every route: floating brand + route tiles over the dot-grid canvas. */
export function MainShell({ children }: { children: ReactNode }) {
  return (
    <MotionRoot>
      <RunProvider>
        <div className="flex h-dvh flex-col overflow-hidden font-sans text-[13px] text-fg dot-grid">
          <header className="flex min-w-0 flex-none items-center gap-1.5 px-3 pt-3 pb-2">
            {/* the brand goes home, as on every site */}
            <Link
              href="/"
              aria-label="Dort home"
              title="Dort home"
              className="mr-2 ml-1 hidden flex-none rounded-tile outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-white/25 sm:block"
            >
              <LogoText height={24} />
            </Link>
            <RouteTabs />
            <div className="ml-auto flex flex-none items-center gap-2">
              <GuideButton />
              <DataBadge />
              <AiSettings />
            </div>
          </header>
          {/* min-w-0: without it a flex item is at least its min-content wide, so a page that
              does not fit pushes past the frame and the overflow-hidden above clips it away.
              overflow-x-hidden with it: a page can now size itself to the viewport, and one that
              still wants more width scrolls inside its own panels rather than dragging the whole
              document sideways. */}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden">
            {children}
          </div>
        </div>
        <RunDialog />
      </RunProvider>
    </MotionRoot>
  );
}
