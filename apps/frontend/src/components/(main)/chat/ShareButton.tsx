"use client";

import { useEffect, useRef, useState } from "react";
import { PH, PhIcon } from "@/components/ui";
import {
  SHARE_TARGETS,
  SHARE_TITLE,
  shareText,
  shareUrl,
} from "@/features/chat";

/**
 * Hand this page to someone else — but let them choose where.
 *
 * It used to copy on the spot (or open the native sheet where there is one), which is fine until
 * you wanted to post it somewhere: you got a string in your clipboard and still had to find the
 * compose box yourself. A menu costs one click and removes that step, and it also makes the
 * quiet thing visible — you can see exactly where a link can go before anything moves.
 *
 * Every network entry is a plain link to that network's own composer. No script from any of them
 * is loaded here, nothing is sent by opening the menu, and the composer still needs you to press
 * post. The native sheet stays, first, where the browser has one, because on a phone it is the
 * better answer than a list of four.
 *
 * The origin comes from the browser rather than from NEXT_PUBLIC_URL: a reader on a preview
 * deployment should share the preview they are looking at, not the production link they are not.
 */
export function ShareButton() {
  const [open, setOpen] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const [native, setNative] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  // navigator.share only exists on some browsers, and reading it during render would make the
  // server's HTML disagree with the client's
  useEffect(() => setNative(typeof navigator.share === "function"), []);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    addEventListener("mousedown", away);
    addEventListener("keydown", key);
    return () => {
      removeEventListener("mousedown", away);
      removeEventListener("keydown", key);
    };
  }, [open]);

  const link = () => shareUrl(location.origin);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareText(link()));
      setSaid("Link copied");
    } catch {
      setSaid("Copy failed — the browser blocked it");
    }
    setOpen(false);
    setTimeout(() => setSaid(null), 2400);
  };

  const sheet = async () => {
    const url = link();
    try {
      await navigator.share({ title: SHARE_TITLE, text: shareText(url), url });
    } catch {
      // a dismissed sheet is a choice, not a failure
    }
    setOpen(false);
  };

  const item =
    "flex w-full items-center gap-2 rounded-tile px-2.5 py-1.5 text-left text-[12.5px] text-muted transition-colors hover:bg-hover hover:text-fg";

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-tile bg-raised px-3 py-1.5 text-[12.5px] text-muted transition-colors hover:bg-hover hover:text-fg"
      >
        <PhIcon d={said ? PH.check : PH.copy} className="size-[14px]" />
        {said ?? "Share"}
      </button>

      {/* role=menu on a div: the items are a button and four links, which no single semantic
          element models */}
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1.5 w-52 rounded-card border border-border bg-card-grad p-1 shadow-float"
        >
          {native && (
            <button
              type="button"
              role="menuitem"
              onClick={sheet}
              className={item}
            >
              <PhIcon d={PH.rocket} className="size-[14px] flex-none" />
              Share sheet…
            </button>
          )}
          <button type="button" role="menuitem" onClick={copy} className={item}>
            <PhIcon d={PH.copy} className="size-[14px] flex-none" />
            Copy link
          </button>
          <div className="my-1 border-border border-t" />
          {SHARE_TARGETS.map((t) => (
            <a
              key={t.id}
              role="menuitem"
              href={t.href(link())}
              target="_blank"
              // noreferrer as well as noopener: the composer has no business knowing which page
              // the reader came from
              rel="noreferrer noopener"
              onClick={() => setOpen(false)}
              className={item}
            >
              <span className="size-1.5 flex-none rounded-full bg-dim" />
              {t.label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
