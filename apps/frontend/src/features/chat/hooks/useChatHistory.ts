"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Turn } from "../utils/chat";
import {
  type Conversation,
  HISTORY_KEY,
  OPEN_KEY,
  OPEN_NEW,
  parseHistory,
  remove as removeOne,
  titleOf,
  upsert,
  worthSaving,
} from "../utils/history";

/**
 * The saved conversations, read from and written to this browser's localStorage.
 *
 * Storage is read once on mount rather than on every render: the page must render the same
 * markup on the server and on the client's first paint, and localStorage exists on neither the
 * server nor during a prerender. Every access is wrapped, because a private window or blocked
 * site data makes the accessor itself throw — losing the history is acceptable there, taking the
 * page down with it is not.
 */
export type ChatHistory = {
  list: Conversation[];
  /** the thread on screen, so the list can mark it */
  current: string | null;
  /** save (or update) the open thread; a thread with no answer in it is not kept */
  save: (turns: Turn[], mode: string) => void;
  /** start a new thread: the next save writes a new row rather than editing this one */
  fresh: () => void;
  open: (id: string) => Turn[] | null;
  /** the thread this browser was in when it last left, once the list has loaded */
  resume: () => Turn[] | null;
  remove: (id: string) => void;
  clear: () => void;
};

const newId = () =>
  `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export function useChatHistory(): ChatHistory {
  const [list, setList] = useState<Conversation[]>([]);
  const id = useRef<string>(newId());
  const [current, setCurrent] = useState<string | null>(null);
  /** the reader pressed New before leaving, so coming back must not undo it */
  const chose = useRef(false);

  useEffect(() => {
    try {
      setList(parseHistory(localStorage.getItem(HISTORY_KEY)));
      const open = localStorage.getItem(OPEN_KEY);
      if (open === OPEN_NEW) chose.current = true;
      else if (open) {
        id.current = open;
        setCurrent(open);
      }
    } catch {
      /* private window, blocked site data: start empty rather than fail */
    }
  }, []);

  /** remembering the cursor must never be able to take the page down with it */
  const mark = useCallback((value: string | null) => {
    try {
      if (value) localStorage.setItem(OPEN_KEY, value);
      else localStorage.removeItem(OPEN_KEY);
    } catch {}
  }, []);

  const write = useCallback((next: Conversation[]) => {
    setList(next);
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
    } catch {
      /* quota or blocked storage: the thread on screen still works */
    }
  }, []);

  const save = useCallback(
    (turns: Turn[], mode: string) => {
      if (!worthSaving(turns)) return;
      const row: Conversation = {
        id: id.current,
        title: titleOf(turns),
        mode,
        at: Date.now(),
        turns,
      };
      setCurrent(row.id);
      mark(row.id);
      setList((prev) => {
        const next = upsert(prev, row);
        try {
          localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
        } catch {}
        return next;
      });
    },
    [mark],
  );

  const fresh = useCallback(() => {
    id.current = newId();
    setCurrent(null);
    chose.current = true;
    mark(OPEN_NEW);
  }, [mark]);

  const open = useCallback(
    (openId: string) => {
      const found = list.find((c) => c.id === openId);
      if (!found) return null;
      id.current = found.id;
      setCurrent(found.id);
      chose.current = false;
      mark(found.id);
      return found.turns;
    },
    [list, mark],
  );

  /**
   * The thread to put back on screen after a refresh.
   *
   * The cursor first, then simply the newest saved thread. Relying on the cursor alone was the
   * bug: it is only written when a thread is saved, and a thread is only saved once it has an
   * answer in it — so leaving mid-question, or on anything the builtin had not answered yet,
   * came back to an empty box with the work one tab away. The newest row is what "where I was"
   * means to a reader, and it is never wrong by more than one conversation.
   *
   * Reads from `list`, so it answers only once storage has been read; the caller waits for it.
   * Returning a thread also moves the cursor onto it, so the next save edits that row instead
   * of opening a second copy of the same conversation.
   */
  const resume = useCallback((): Turn[] | null => {
    if (chose.current) return null;
    const found = (current && list.find((c) => c.id === current)) || list[0];
    if (!found) return null;
    id.current = found.id;
    setCurrent(found.id);
    mark(found.id);
    return found.turns;
  }, [current, list, mark]);

  const remove = useCallback(
    (removeId: string) => {
      write(removeOne(list, removeId));
      if (current === removeId) fresh();
    },
    [list, current, write, fresh],
  );

  const clear = useCallback(() => {
    write([]);
    fresh();
  }, [write, fresh]);

  return { list, current, save, fresh, open, resume, remove, clear };
}
