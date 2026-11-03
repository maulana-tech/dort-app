/**
 * Saved conversations, kept in this browser only.
 *
 * A chat without history is a chat you cannot come back to: the question you asked yesterday
 * about a run is often the one worth asking again after a fix. So every exchange is kept under
 * `dort.chat` in localStorage — the same place the AI settings and triage notes live, never a
 * server. What was asked about an auditor's unpublished contract is not ours to hold.
 *
 * This file is pure so Node can run it for the check: the storage itself lives in the hook.
 */
import type { Turn } from "./chat";

export const HISTORY_KEY = "dort.chat";

/**
 * Which saved conversation is the one on screen.
 *
 * The threads themselves were already kept; what a refresh lost was *which* of them you were in,
 * so the page came back empty with your work one tab away. A key of its own rather than a field
 * in the list: it changes on every send, and rewriting the whole history to record a cursor is
 * both wasteful and a good way to lose the history to a failed write.
 */
export const OPEN_KEY = "dort.chat.open";

/**
 * What OPEN_KEY holds when the reader pressed New: a deliberate empty box, not a missing cursor.
 * Without it the two are indistinguishable, and restoring "the newest thread" would undo the one
 * thing they just asked for.
 */
export const OPEN_NEW = "new";

/** How many conversations are kept; the oldest fall off the end. */
export const HISTORY_MAX = 30;

export type Conversation = {
  /** stable across saves of the same thread, so editing one does not create a second */
  id: string;
  /** the first question asked, which is what the list shows */
  title: string;
  /** what the conversation was reading: "Your run", "Sample" or "General" */
  mode: string;
  /** when it was last written to */
  at: number;
  turns: Turn[];
};

/** The first question, trimmed to something a narrow list can show whole. */
export function titleOf(turns: Turn[]): string {
  const first = turns.find((t) => t.role === "user")?.content.trim() ?? "";
  const line = first.split("\n")[0];
  return line.length > 72 ? `${line.slice(0, 71)}…` : line || "Untitled";
}

/**
 * Parse what was in storage. Anything unrecognisable is dropped rather than trusted: this value
 * survives upgrades of the app, and a half-written array must not take the page down with it.
 */
export function parseHistory(raw: string | null): Conversation[] {
  if (!raw) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  const out: Conversation[] = [];
  for (const c of data) {
    if (!c || typeof c !== "object") continue;
    const { id, title, mode, at, turns } = c as Record<string, unknown>;
    if (typeof id !== "string" || !Array.isArray(turns)) continue;
    const clean = turns.filter(
      (t): t is Turn =>
        !!t &&
        typeof t === "object" &&
        ((t as Turn).role === "user" || (t as Turn).role === "assistant") &&
        typeof (t as Turn).content === "string" &&
        typeof (t as Turn).at === "number",
    );
    if (!clean.length) continue;
    out.push({
      id,
      title: typeof title === "string" && title ? title : titleOf(clean),
      mode: typeof mode === "string" ? mode : "",
      at: typeof at === "number" ? at : 0,
      turns: clean,
    });
  }
  return out.sort((a, b) => b.at - a.at).slice(0, HISTORY_MAX);
}

/**
 * Put one conversation at the front, replacing an earlier save of the same id. A thread is saved
 * repeatedly as it grows, so matching on id is what keeps the list one row per conversation
 * instead of one row per answer.
 */
export function upsert(
  list: Conversation[],
  next: Conversation,
): Conversation[] {
  const rest = list.filter((c) => c.id !== next.id);
  return [next, ...rest].slice(0, HISTORY_MAX);
}

export const remove = (list: Conversation[], id: string): Conversation[] =>
  list.filter((c) => c.id !== id);

/**
 * Whether a thread is worth keeping. An unanswered question is not: it is what the box looked
 * like when someone closed the tab, and a history full of those buries the real ones.
 */
export const worthSaving = (turns: Turn[]): boolean =>
  turns.some((t) => t.role === "user" && t.content.trim() !== "") &&
  turns.some((t) => t.role === "assistant" && t.content.trim() !== "");

/** A short, human stamp for the list: today's time, or the date. */
export function whenLabel(at: number, now = Date.now()): string {
  if (!at) return "";
  const d = new Date(at);
  const sameDay = new Date(now).toDateString() === d.toDateString();
  if (sameDay)
    return d.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
