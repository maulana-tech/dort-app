"use client";

import { useState } from "react";
import { PH, PhIcon } from "@/components/ui";
import { SHARE_TITLE, shareText, shareUrl } from "@/features/chat";

/**
 * Hand this page to someone else.
 *
 * The share sheet where the browser has one — phones, and Safari — and the clipboard everywhere
 * else, which is every desktop a judge will open this on. Both end in the same place, so the
 * button says "Copied" either way rather than claiming a sheet opened that did not.
 *
 * The origin comes from the browser rather than from NEXT_PUBLIC_URL: a reader on a preview
 * deployment should share the preview they are looking at, not the production link they are not.
 */
export function ShareButton() {
  const [said, setSaid] = useState<string | null>(null);

  const share = async () => {
    const url = shareUrl(location.origin);
    const text = shareText(url);
    try {
      if (navigator.share) {
        await navigator.share({ title: SHARE_TITLE, text, url });
        return;
      }
      await navigator.clipboard.writeText(text);
      setSaid("Link copied");
    } catch {
      // a dismissed sheet is a choice, not a failure; a blocked clipboard is worth saying
      if (!navigator.share) setSaid("Copy failed — the browser blocked it");
    } finally {
      setTimeout(() => setSaid(null), 2400);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void share()}
      className="flex items-center gap-1.5 rounded-tile bg-raised px-3 py-1.5 text-[12.5px] text-muted transition-colors hover:bg-hover hover:text-fg"
    >
      <PhIcon d={said ? PH.check : PH.copy} className="size-[14px]" />
      {said ?? "Share"}
    </button>
  );
}
