"use client";

import { useState } from "react";

/**
 * A command or snippet, with its own Copy button.
 *
 * The button floats over the corner rather than sitting in a bar of its own. That bar cost a
 * row of chrome and 16px of padding on every block, which is invisible on a twenty-line snippet
 * and absurd on `npx dort-skill` — a one-word command came out taller than the paragraph
 * explaining it. The right padding keeps the first line clear of the button, so nothing hides
 * under it when the line is long.
 */
export function CodeBlock({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };
  return (
    <div className="relative overflow-hidden rounded-inner border border-border bg-inset">
      <pre className="overflow-x-auto py-2.5 pr-20 pl-3.5 font-mono text-[12.5px] text-fg leading-[1.7]">
        {text}
      </pre>
      <button
        type="button"
        onClick={copy}
        className="absolute top-1.5 right-1.5 rounded-full px-2.5 py-0.5 text-[12px] text-dim transition-colors hover:bg-white/[.05] hover:text-fg"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
