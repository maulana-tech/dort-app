"use client";

import { useEffect, useState } from "react";

/**
 * Whether this Dort has a model of its own to offer (app/api/bedrock).
 *
 * Asked of the route rather than threaded through as a prop, because the answer depends on the
 * server's environment and the settings dialog lives in the header, far from any page that could
 * pass it down. The route replies with a boolean and nothing else — the key itself never leaves
 * the server, so there is nothing here that could leak it.
 *
 * Asked once per page load and shared: a dozen components wanting to know must not become a
 * dozen requests. Until the answer arrives the offer is not made, so a Dort without a key never
 * flashes a provider it does not have.
 */
export type HostedAi = {
  ready: boolean;
  /** the models the operator will pay for, their default first; empty when not offered */
  models: string[];
};

const OFF: HostedAi = { ready: false, models: [] };
let cached: Promise<HostedAi> | null = null;

const probe = (): Promise<HostedAi> => {
  cached ??= fetch("/api/bedrock", { method: "GET" })
    .then((r) => (r.ok ? r.json() : OFF))
    .then((j: { ready?: unknown; models?: unknown }) =>
      j.ready === true
        ? {
            ready: true,
            models: Array.isArray(j.models)
              ? j.models.filter((m): m is string => typeof m === "string")
              : [],
          }
        : OFF,
    )
    .catch(() => OFF);
  return cached;
};

export function useHostedAi(): HostedAi {
  const [state, setState] = useState<HostedAi>(OFF);
  useEffect(() => {
    let live = true;
    void probe().then((r) => {
      if (live) setState(r);
    });
    return () => {
      live = false;
    };
  }, []);
  return state;
}
