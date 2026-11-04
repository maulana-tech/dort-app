"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Chip } from "@/components/ui";

type Server = {
  name: string;
  command: string;
  tools: { name: string; description: string }[];
  skipped: string[];
  truncated: boolean;
  error?: string;
};
type Listing = {
  config: string;
  explicit: boolean;
  missing: boolean;
  servers: Server[];
  problems: string[];
  error?: string;
};

/**
 * What this machine lets Dort use: the other half of the MCP story.
 *
 * The list is read by app/api/mcp, which starts each server and asks it — so what is shown here
 * is what actually answered, not what the file claims. A server that is in the config and broken
 * appears with its own error, because a tool list that silently omits it is how you spend twenty
 * minutes wondering why the model never calls your server.
 *
 * On a hosted Dort the route answers 404 by design (it starts child processes), so this says so
 * rather than showing an empty list that looks like a missing config.
 */
export function McpServers() {
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [data, setData] = useState<Listing | null>(null);

  // useCallback so the effect below can depend on it honestly: a plain function would be a new
  // value every render, and a dependency array holding it would refetch forever.
  const load = useCallback(async () => {
    setState("busy");
    try {
      const r = await fetch("/api/mcp", { cache: "no-store" });
      const j = (await r.json()) as Listing;
      setData(r.ok ? j : { ...j, servers: [], problems: [], missing: false });
    } catch (e) {
      setData({
        config: "",
        explicit: false,
        missing: false,
        servers: [],
        problems: [],
        error: (e as Error).message,
      });
    }
    setState("done");
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const total = data?.servers.reduce((n, s) => n + s.tools.length, 0) ?? 0;

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <h3 className="text-[13px] text-fg">
          Servers this machine offers Dort
        </h3>
        {state === "done" && !data?.error && (
          <Chip dot tone={total > 0 ? "ok" : "neutral"}>
            {total > 0
              ? `${total} tool${total === 1 ? "" : "s"}`
              : "none found"}
          </Chip>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto"
          disabled={state === "busy"}
          onClick={load}
        >
          {state === "busy" ? "Asking…" : "Reload"}
        </Button>
      </div>

      {data?.error ? (
        // the route refuses on a hosted deploy, and that is the answer, not a failure
        <p className="flex items-start gap-2 text-[12.5px] text-muted leading-normal">
          <span className="mt-1.5 size-1.5 flex-none rounded-full bg-dim" />
          {data.error} Dort starts these as child processes, so it only does it
          on your own machine — run it locally (
          <code className="font-mono">pnpm dev</code>) to use them.
        </p>
      ) : (
        <>
          <p className="text-[12.5px] text-muted leading-normal">
            Read from{" "}
            <code className="font-mono text-body">{data?.config || "…"}</code>
            {data && !data.explicit && (
              <>
                {" "}
                — the default. Set{" "}
                <code className="font-mono text-body">DORT_MCP_CONFIG</code> to
                point at a file you already have, such as{" "}
                <code className="font-mono text-body">~/.cursor/mcp.json</code>.
              </>
            )}{" "}
            Paths inside it must be absolute: Dort starts these itself and does
            not run them through your shell.
          </p>

          {data?.missing && (
            <p className="flex items-start gap-2 text-[12.5px] text-muted leading-normal">
              <span className="mt-1.5 size-1.5 flex-none rounded-full bg-dim" />
              No config there yet. Copy{" "}
              <code className="font-mono text-body">.mcp.json.example</code> to{" "}
              <code className="font-mono text-body">.mcp.json</code> in the repo
              root and fill in the paths.
            </p>
          )}

          {data?.servers.map((s) => (
            <div
              key={s.name}
              className="flex flex-col gap-1.5 rounded-tile border border-border bg-inset p-2.5"
            >
              <div className="flex items-center gap-2">
                <span
                  className={`size-1.5 flex-none rounded-full ${s.error ? "bg-red" : "bg-green"}`}
                />
                <span className="text-[12.5px] text-fg">{s.name}</span>
                <span className="ml-auto text-[11.5px] text-dim">
                  {s.error ? "did not answer" : `${s.tools.length} tools`}
                </span>
              </div>
              <code className="truncate font-mono text-[11.5px] text-dim">
                {s.command}
              </code>
              {s.error ? (
                <p className="text-[12px] text-body leading-normal">
                  {s.error}
                </p>
              ) : (
                <ul className="flex flex-wrap gap-1">
                  {s.tools.map((t) => (
                    // the description is the tooltip: a wall of them inline would bury the
                    // names, and the names are what you scan for
                    <li key={t.name} title={t.description}>
                      <Chip>
                        <span className="font-mono text-[11.5px]">
                          {t.name}
                        </span>
                      </Chip>
                    </li>
                  ))}
                </ul>
              )}
              {s.skipped.length > 0 && (
                <p className="text-[12px] text-muted leading-normal">
                  Skipped {s.skipped.length}: a tool name has to be letters,
                  digits, underscores or hyphens to be callable.
                </p>
              )}
            </div>
          ))}

          {data?.problems.map((p) => (
            <p
              key={p}
              className="flex items-start gap-2 text-[12.5px] text-body leading-normal"
            >
              <span className="mt-1.5 size-1.5 flex-none rounded-full bg-red" />
              {p}
            </p>
          ))}
        </>
      )}
    </section>
  );
}
