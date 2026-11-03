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
let cached: Promise<boolean> | null = null;

const probe = (): Promise<boolean> => {
  cached ??= fetch("/api/bedrock", { method: "GET" })
    .then((r) => (r.ok ? r.json() : { ready: false }))
    .then((j: { ready?: unknown }) => j.ready === true)
    .catch(() => false);
  return cached;
};

export function useHostedAi(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let live = true;
    void probe().then((r) => {
      if (live) setReady(r);
    });
    return () => {
      live = false;
    };
  }, []);
  return ready;
}
