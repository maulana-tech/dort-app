"use client";

import { useCallback, useRef, useState } from "react";
import { askWithTools } from "@/features/ai/services/ask";
import type { AiConfig } from "@/features/ai/types";
import { aiReady } from "@/features/ai/utils/provider";
import type { ToolCall } from "@/features/ai/utils/tools";
import { builtinAnswer } from "../utils/builtin";
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
  /**
   * whether a question can be asked at all. True even with no provider configured: the "none"
   * provider answers from the run's own figures (utils/builtin), so the box is never dead.
   */
  ready: boolean;
  /** the answers are Dort's own text, not a model's — the page has to say so */
  builtin: boolean;
  /** a model answered, but it was this deployment's, not the reader's */
  hosted: boolean;
  /**
   * `text` is what the thread shows. `sent`, when given, is what the model receives instead —
   * a contract handed in reads as a sentence and travels as its call tree.
   */
  send: (text: string, sent?: string) => void;
  stop: () => void;
  reset: () => void;
  /** put a saved conversation back on screen (features/chat history) */
  load: (turns: Turn[]) => void;
};

export function useChat(
  cfg: AiConfig,
  digest: RunDigest,
  /** runs a tool the model asked for; without it the model is never offered any */
  runTool?: (call: ToolCall) => Promise<string>,
): ChatState {
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

  const load = useCallback(
    (saved: Turn[]) => {
      stop();
      setError(null);
      setTurns(saved);
    },
    [stop],
  );

  const send = useCallback(
    (text: string, sent?: string) => {
      const q = text.trim();
      if (!q || busy) return;
      setError(null);

      const asked: Turn = {
        role: "user",
        content: q,
        at: Date.now(),
        ...(sent ? { sent } : {}),
      };
      const next = [...turns, asked];
      // the assistant's turn exists before the first token so the thread does not jump
      setTurns([
        ...next,
        { role: "assistant", content: "", at: Date.now() + 1 },
      ]);
      setBusy(true);

      // no provider configured: answer from the run's figures, here, with no request at all.
      // Dort hosts no model, and this is the honest middle — real answers to the questions
      // arithmetic can settle, and a plain hand-off to the reader's own model for the rest.
      if (cfg.kind === "none") {
        const text = builtinAnswer(digest, q);
        setTurns((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = {
            role: "assistant",
            content: text,
            at: Date.now() + 1,
          };
          return copy;
        });
        setBusy(false);
        return;
      }

      const ctrl = new AbortController();
      abort.current = ctrl;

      void (async () => {
        try {
          // the working and the cost land on the same turn as the answer, so the panel beside
          // it is always describing the reply it is next to and never the one before
          const onLast = (edit: (t: Turn) => Turn) =>
            setTurns((prev) => {
              const copy = [...prev];
              const last = copy[copy.length - 1];
              if (last?.role === "assistant")
                copy[copy.length - 1] = edit(last);
              return copy;
            });

          for await (const piece of askWithTools(
            cfg,
            toMessages(digest, next),
            ctrl.signal,
            {
              onThinking: (t) =>
                onLast((last) => ({
                  ...last,
                  thinking: (last.thinking ?? "") + t,
                })),
              onUsage: (u) => onLast((last) => ({ ...last, usage: u })),
            },
            (name, arg) =>
              onLast((last) => ({
                ...last,
                tools: [...(last.tools ?? []), { name, arg }],
              })),
            runTool,
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
    [busy, turns, cfg, digest, runTool],
  );

  return {
    turns,
    busy,
    error,
    ready: aiReady(cfg) || cfg.kind === "none",
    builtin: cfg.kind === "none",
    hosted: cfg.kind === "dort",
    send,
    stop,
    reset,
    load,
  };
}
