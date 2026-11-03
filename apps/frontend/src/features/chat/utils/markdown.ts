/**
 * The little of Markdown a model actually writes, parsed into something React can draw.
 *
 * Answers came back as one pre-wrapped block, so a careful reply — headings, a list of things to
 * check, each with its own two sub-points, a fenced snippet — arrived as a wall with asterisks
 * in it. The reading is the product; it has to be readable.
 *
 * A parser rather than a library, and a parser that returns *data* rather than HTML. This text
 * is written by a model that has just read a stranger's contract, and some of that contract is
 * in it: handing it to dangerouslySetInnerHTML would make every reviewed file a script a
 * reviewer runs. Nothing here can emit an element the renderer does not already know.
 *
 * Deliberately small. Headings, bullets, numbers, fences, quotes, rules, and four inline marks.
 * Anything it does not recognise stays as the text it was, which is the right failure: an
 * unparsed line reads exactly as the model wrote it.
 */

export type Inline =
  | { t: "text" | "code" | "strong" | "em"; v: string }
  | { t: "link"; v: string; href: string };

export type Block =
  | { k: "p"; spans: Inline[] }
  | { k: "h"; level: number; spans: Inline[] }
  | { k: "ul" | "ol"; items: Inline[][] }
  | { k: "code"; lang: string; code: string }
  | { k: "quote"; spans: Inline[] }
  | { k: "hr" };

/** `[text](url)`, but only where the url is one a browser should be asked to open. */
const SAFE_HREF = /^https?:\/\/[^\s)]+$/i;

const INLINE =
  /(`[^`]+`)|(\*\*[^*]+\*\*)|(__[^_]+__)|(\*[^*\n]+\*)|(_[^_\n]+_)|(\[[^\]]+\]\([^)\s]+\))/;

/**
 * One line of text as marks. Code first and always: a backtick span is literal, so `**x**`
 * inside one is two asterisks and a name, not an instruction to embolden.
 */
export function inlineOf(line: string): Inline[] {
  const out: Inline[] = [];
  let rest = line;
  while (rest) {
    const m = rest.match(INLINE);
    if (!m || m.index === undefined) break;
    if (m.index > 0) out.push({ t: "text", v: rest.slice(0, m.index) });
    const tok = m[0];
    if (tok.startsWith("`")) out.push({ t: "code", v: tok.slice(1, -1) });
    else if (tok.startsWith("**") || tok.startsWith("__"))
      out.push({ t: "strong", v: tok.slice(2, -2) });
    else if (tok.startsWith("[")) {
      const cut = tok.indexOf("](");
      const text = tok.slice(1, cut);
      const href = tok.slice(cut + 2, -1);
      // a link Dort will not open is shown as what it is, text and address both: silently
      // dropping the address would hide where a model wanted to send the reader
      out.push(
        SAFE_HREF.test(href)
          ? { t: "link", v: text, href }
          : { t: "text", v: `${text} (${href})` },
      );
    } else out.push({ t: "em", v: tok.slice(1, -1) });
    rest = rest.slice(m.index + tok.length);
  }
  if (rest) out.push({ t: "text", v: rest });
  return out.length ? out : [{ t: "text", v: line }];
}

const BULLET = /^\s*[-*+]\s+(.*)$/;
const NUMBER = /^\s*\d+[.)]\s+(.*)$/;
const HEADING = /^(#{1,6})\s+(.*)$/;
/** a line that is nothing but one bold run, which is how most models write a heading */
const BOLD_LINE = /^\s*\*\*([^*]+)\*\*:?\s*$/;

export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const out: Block[] = [];
  let para: string[] = [];

  const flush = () => {
    if (!para.length) return;
    out.push({ k: "p", spans: inlineOf(para.join(" ").trim()) });
    para = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // a fence runs to its closing one, or to the end: an unclosed fence is still code, and
    // dropping it would lose the only part of an answer that is meant to be copied
    const fence = line.match(/^\s*```(\w*)\s*$/);
    if (fence) {
      flush();
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i]))
        code.push(lines[i++]);
      out.push({ k: "code", lang: fence[1] ?? "", code: code.join("\n") });
      continue;
    }

    if (!line.trim()) {
      flush();
      continue;
    }

    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      flush();
      out.push({ k: "hr" });
      continue;
    }

    const h = line.match(HEADING);
    if (h) {
      flush();
      out.push({ k: "h", level: h[1].length, spans: inlineOf(h[2]) });
      continue;
    }

    const bold = line.match(BOLD_LINE);
    if (bold) {
      flush();
      out.push({ k: "h", level: 3, spans: [{ t: "text", v: bold[1] }] });
      continue;
    }

    const q = line.match(/^\s*>\s?(.*)$/);
    if (q) {
      flush();
      out.push({ k: "quote", spans: inlineOf(q[1]) });
      continue;
    }

    const li = line.match(BULLET) ?? line.match(NUMBER);
    if (li) {
      flush();
      const kind = BULLET.test(line) ? "ul" : "ol";
      const last = out[out.length - 1];
      if (last?.k === kind) last.items.push(inlineOf(li[1]));
      else out.push({ k: kind, items: [inlineOf(li[1])] });
      continue;
    }

    para.push(line.trim());
  }
  flush();
  return out;
}
