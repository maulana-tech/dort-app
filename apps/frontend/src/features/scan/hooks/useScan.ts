"use client";

import { useCallback, useRef, useState } from "react";
import { askStream } from "@/features/ai/services/ask";
import type { AiConfig } from "@/features/ai/types";
import { gatherFacts } from "../facts";
import { type ScanFacts, type ScanInput, scanPrompt } from "../utils/scan";

/**
 * One reading: gather what the chain knows, then stream a review of it.
 *
 * Two phases, both visible. Gathering is the part that cannot be faked — it either got the call
 * tree or it did not — so the page shows the facts the moment they land, before a single token of
 * the review arrives. A reader who only trusts the first half still got something real.
 */
export type ScanPhase = "idle" | "reading" | "reviewing" | "done";

export type ScanState = {
  phase: ScanPhase;
  input: ScanInput | null;
  facts: ScanFacts | null;
  traceNote: string | null;
  review: string;
  error: string | null;
  busy: boolean;
  run: (input: ScanInput) => void;
  stop: () => void;
  reset: () => void;
};

export function useScan(cfg: AiConfig, chainId: number): ScanState {
  const [phase, setPhase] = useState<ScanPhase>("idle");
  const [input, setInput] = useState<ScanInput | null>(null);
  const [facts, setFacts] = useState<ScanFacts | null>(null);
  const [traceNote, setNote] = useState<string | null>(null);
  const [review, setReview] = useState("");
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    abort.current?.abort();
    abort.current = null;
    // whatever text arrived stays on screen: half a review is still worth reading
    setPhase((p) => (p === "idle" ? p : "done"));
  }, []);

  const reset = useCallback(() => {
    abort.current?.abort();
    abort.current = null;
    setPhase("idle");
    setInput(null);
    setFacts(null);
    setNote(null);
    setReview("");
    setError(null);
  }, []);

  const run = useCallback(
    (next: ScanInput) => {
      abort.current?.abort();
      const ctrl = new AbortController();
      abort.current = ctrl;
      setInput(next);
      setFacts(null);
      setNote(null);
      setReview("");
      setError(null);
      setPhase("reading");

      void (async () => {
        let gathered: { facts: ScanFacts; traceNote: string | null };
        try {
          gathered = await gatherFacts(chainId, next);
        } catch (e) {
          if (ctrl.signal.aborted) return;
          setError(
            `Couldn't read that from the chain: ${(e as Error).message}. Check the chain is the right one — an address or hash from another network will not be found here.`,
          );
          setPhase("idle");
          return;
        }
        if (ctrl.signal.aborted) return;
        setFacts(gathered.facts);
        setNote(gathered.traceNote);

        // the facts are the deliverable on their own; a reader with no model configured keeps
        // them rather than being told to come back with a key
        if (cfg.kind === "none") {
          setPhase("done");
          return;
        }

        setPhase("reviewing");
        try {
          for await (const piece of askStream(
            cfg,
            scanPrompt(next, gathered.facts),
            ctrl.signal,
          ))
            setReview((r) => r + piece);
          setPhase("done");
        } catch (e) {
          if ((e as Error).name === "AbortError") return;
          setError((e as Error).message);
          setPhase("done");
        }
      })();
    },
    [cfg, chainId],
  );

  return {
    phase,
    input,
    facts,
    traceNote,
    review,
    error,
    busy: phase === "reading" || phase === "reviewing",
    run,
    stop,
    reset,
  };
}
