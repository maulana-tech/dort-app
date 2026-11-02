"use client";

import { useCallback, useRef, useState } from "react";
import { askStream } from "@/features/ai/services/ask";
import type { AiConfig } from "@/features/ai/types";
import { aiReady } from "@/features/ai/utils/provider";
import { type RunDigest, type Turn, toMessages } from "../utils/chat";

/**
 * One conversation, streamed from the user's own provider.
 *
 * The assistant's turn is appended empty and then grown in place as tokens arrive, so the page
 * can show the answer forming instead of a spinner. A send is abortable: the same control that
 * sends becomes Stop while a stream is open, and stopping keeps whatever text already arrived
 * rather than throwing the half-answer away.
 */
export type ChatState = {
  turns: Turn[];
  busy: boolean;
  error: string | null;
  /** false until the user has configured their own AI; the page then points at the settings */
  ready: boolean;
  send: (text: string) => void;
  stop: () => void;
  reset: () => void;
};

export function useChat(cfg: AiConfig, digest: RunDigest): ChatState {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    abort.current?.abort();
    abort.current = null;
    setBusy(false);
  }, []);

  const reset = useCallback(() => {
    stop();
    setTurns([]);
    setError(null);
  }, [stop]);

  const send = useCallback(
    (text: string) => {
      const q = text.trim();
      if (!q || busy) return;
      setError(null);

      const asked: Turn = { role: "user", content: q, at: Date.now() };
      const next = [...turns, asked];
      // the assistant's turn exists before the first token so the thread does not jump
      setTurns([
        ...next,
        { role: "assistant", content: "", at: Date.now() + 1 },
      ]);
      setBusy(true);

      const ctrl = new AbortController();
      abort.current = ctrl;

      void (async () => {
        try {
          for await (const piece of askStream(
            cfg,
            toMessages(digest, next),
            ctrl.signal,
          )) {
            setTurns((prev) => {
              const copy = [...prev];
              const last = copy[copy.length - 1];
              if (last?.role === "assistant")
                copy[copy.length - 1] = {
                  ...last,
                  content: last.content + piece,
                };
              return copy;
            });
          }
        } catch (e) {
          // an abort is the user pressing Stop, not a failure to report
          if ((e as { name?: string }).name !== "AbortError")
            setError(e instanceof Error ? e.message : String(e));
        } finally {
          if (abort.current === ctrl) abort.current = null;
          setBusy(false);
          // an answer that never produced a token leaves an empty bubble behind
          setTurns((prev) => {
            const last = prev[prev.length - 1];
            return last?.role === "assistant" && last.content === ""
              ? prev.slice(0, -1)
              : prev;
          });
        }
      })();
    },
    [busy, turns, cfg, digest],
  );

  return { turns, busy, error, ready: aiReady(cfg), send, stop, reset };
}
