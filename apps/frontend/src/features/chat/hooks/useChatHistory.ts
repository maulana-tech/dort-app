"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Turn } from "../utils/chat";
import {
  type Conversation,
  HISTORY_KEY,
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
  remove: (id: string) => void;
  clear: () => void;
};

const newId = () =>
  `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export function useChatHistory(): ChatHistory {
  const [list, setList] = useState<Conversation[]>([]);
  const id = useRef<string>(newId());
  const [current, setCurrent] = useState<string | null>(null);

  useEffect(() => {
    try {
      setList(parseHistory(localStorage.getItem(HISTORY_KEY)));
    } catch {
      /* private window, blocked site data: start empty rather than fail */
    }
  }, []);

  const write = useCallback((next: Conversation[]) => {
    setList(next);
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
    } catch {
      /* quota or blocked storage: the thread on screen still works */
    }
  }, []);

  const save = useCallback((turns: Turn[], mode: string) => {
    if (!worthSaving(turns)) return;
    const row: Conversation = {
      id: id.current,
      title: titleOf(turns),
      mode,
      at: Date.now(),
      turns,
    };
    setCurrent(row.id);
    setList((prev) => {
      const next = upsert(prev, row);
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  const fresh = useCallback(() => {
    id.current = newId();
    setCurrent(null);
  }, []);

  const open = useCallback(
    (openId: string) => {
      const found = list.find((c) => c.id === openId);
      if (!found) return null;
      id.current = found.id;
      setCurrent(found.id);
      return found.turns;
    },
    [list],
  );

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

  return { list, current, save, fresh, open, remove, clear };
}
