import { Fragment } from "react";
import { type Inline, parseMarkdown } from "@/features/chat";

/**
 * An answer drawn as the document it is.
 *
 * Every element here is written out by hand — there is no path from the model's text to markup.
 * The parser returns data (features/chat/utils/markdown), this turns that data into elements it
 * already knows, and a mark it does not recognise arrives as the characters the model typed.
 * The text has a stranger's contract in it; it is not something to hand to a parser that can
 * build a DOM.
 *
 * Sized to sit inside a chat bubble rather than a page: headings are a step up from the body
 * rather than a shout, and the spacing is tight enough that a list of six things to check still
 * reads as one answer.
 */
function Spans({ spans }: { spans: Inline[] }) {
  return (
    <>
      {spans.map((s, i) => {
        const key = `${s.t}-${i}-${s.v.slice(0, 12)}`;
        if (s.t === "code")
          return (
            <code
              key={key}
              className="rounded bg-raised px-1 py-px font-mono text-[12px] text-fg"
            >
              {s.v}
            </code>
          );
        if (s.t === "strong")
          return (
            <strong key={key} className="font-medium text-fg">
              {s.v}
            </strong>
          );
        if (s.t === "em")
          return (
            <em key={key} className="text-fg italic">
              {s.v}
            </em>
          );
        if (s.t === "link")
          return (
            <a
              key={key}
              href={s.href}
              target="_blank"
              // noreferrer as well as noopener: the model chose this address, not the reader
              rel="noopener noreferrer"
              className="text-primary underline underline-offset-2"
            >
              {s.v}
            </a>
          );
        return <Fragment key={key}>{s.v}</Fragment>;
      })}
    </>
  );
}

export function Markdown({ text }: { text: string }) {
  const blocks = parseMarkdown(text);
  return (
    <div className="flex flex-col gap-2.5">
      {blocks.map((b, i) => {
        const key = `${b.k}-${i}`;
        if (b.k === "hr")
          return <hr key={key} className="my-0.5 border-border" />;
        if (b.k === "code")
          return (
            <pre
              key={key}
              className="overflow-x-auto rounded-inner border border-border bg-inner-grad px-3 py-2.5 font-mono text-[12px] text-body leading-relaxed"
            >
              <code>{b.code}</code>
            </pre>
          );
        if (b.k === "quote")
          return (
            <blockquote
              key={key}
              className="border-border border-l-2 pl-3 text-dim italic"
            >
              <Spans spans={b.spans} />
            </blockquote>
          );
        if (b.k === "h")
          return (
            <p
              key={key}
              className={`font-medium text-fg ${b.level <= 2 ? "mt-1 text-[14.5px]" : "text-[13.5px]"}`}
            >
              <Spans spans={b.spans} />
            </p>
          );
        if (b.k === "ul" || b.k === "ol")
          return (
            <ul key={key} className="flex flex-col gap-1.5">
              {b.items.map((item, j) => (
                <li
                  // biome-ignore lint/suspicious/noArrayIndexKey: an item's position is its identity
                  key={j}
                  className="flex gap-2"
                >
                  <span className="flex-none select-none text-muted tabular-nums">
                    {b.k === "ol" ? `${j + 1}.` : "•"}
                  </span>
                  <span className="min-w-0">
                    <Spans spans={item} />
                  </span>
                </li>
              ))}
            </ul>
          );
        if (b.k === "p")
          return (
            <p key={key}>
              <Spans spans={b.spans} />
            </p>
          );
        return null;
      })}
    </div>
  );
}
