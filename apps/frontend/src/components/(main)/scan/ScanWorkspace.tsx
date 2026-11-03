"use client";

import Link from "next/link";
import { type DragEvent, useMemo, useRef, useState } from "react";
import { Chip, Dropdown, PH, PhIcon, Tabs } from "@/components/ui";
import { useAiConfig } from "@/features/ai/hooks/useAiConfig";
import { useHostedAi } from "@/features/ai/hooks/useHostedAi";
import { DORT_AI } from "@/features/ai/utils/provider";
import { PORTALDOT_ID, VAULT_CHAINS } from "@/features/bridge/chains";
import {
  detect,
  EXAMPLES,
  joinSources,
  MAX_SOURCE,
  NOT_CHECKED,
  type ScanKind,
  traceSummary,
  useScan,
  whyNot,
} from "@/features/scan";
import { TraceRow } from "../trace/TraceRow";

/**
 * Scan: read a contract that is not yours.
 *
 * Three doors to the same reading — a transaction hash, a contract address, or Solidity files —
 * because a person arriving with a question has whichever one they have, and asking them to
 * classify it first is asking them to know the answer already (utils/scan `detect`).
 *
 * The layout puts the model in the middle and the *evidence* on the right, and that ordering is
 * the argument: the facts panel is read from the chain and would stand without any model at all,
 * so a reader who distrusts the review still leaves with the call tree. A tool that showed only
 * prose would be asking to be believed.
 *
 * What it never does is pass judgement. Every reading names what it could not look at, in the
 * panel and again in the prompt, because the dangerous outcome here is not a missed bug — it is
 * a reader who takes silence for a clean bill of health and ships.
 */

const DOOR: Record<ScanKind, { label: string; icon: string }> = {
  tx: { label: "Transaction", icon: PH.path },
  address: { label: "Contract", icon: PH.stack },
  source: { label: "Solidity source", icon: PH.code },
};

export function ScanWorkspace() {
  // the same provider rule as Chat: the reader's own model, or this Dort's if they have chosen
  // nothing and one is offered. Source they upload is unpublished code, so the page says which.
  const stored = useAiConfig();
  const hostedAi = useHostedAi().ready;
  const cfg = stored.kind === "none" && hostedAi ? DORT_AI : stored;
  const hosted = cfg.kind === "dort";

  const [chain, setChain] = useState<number>(PORTALDOT_ID);
  const scan = useScan(cfg, chain);
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [tooBig, setTooBig] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [right, setRight] = useState<"facts" | "trace">("facts");
  const picker = useRef<HTMLInputElement>(null);

  const input = useMemo(
    () => detect(text, fileName ?? undefined),
    [text, fileName],
  );
  const frames = scan.facts?.frames ?? [];
  const maxGas = Math.max(1, ...frames.map((f) => f.gas ?? 0));

  async function take(list: FileList | null) {
    if (!list?.length) return;
    setTooBig(null);
    const files = Array.from(list);
    const total = files.reduce((n, f) => n + f.size, 0);
    if (total > MAX_SOURCE) {
      setTooBig(
        `That is ${Math.round(total / 1024)} KB. Dort reads up to ${Math.round(MAX_SOURCE / 1024)} KB of source — pick the contracts that matter rather than the whole repository.`,
      );
      return;
    }
    const joined = joinSources(
      await Promise.all(
        files.map(async (f) => ({ name: f.name, text: await f.text() })),
      ),
    );
    if (!joined) {
      setTooBig("Those files were empty.");
      return;
    }
    setFileName(joined.name);
    setText(joined.text);
  }

  const drop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    void take(e.dataTransfer?.files ?? null);
  };

  const start = () => {
    if (input && !scan.busy) scan.run(input);
  };

  const clear = () => {
    setText("");
    setFileName(null);
    setTooBig(null);
    scan.reset();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 px-3 pb-3 lg:flex-row">
      {/* ── left: what you are handing in ──────────────────────────────── */}
      <aside className="flex w-full flex-none flex-col overflow-auto rounded-card border border-border bg-card-grad p-2.5 shadow-soft lg:w-[320px]">
        <Dropdown
          ariaLabel="Chain"
          label="Chain"
          value={String(chain)}
          onChange={(v) => setChain(Number(v))}
          options={VAULT_CHAINS.map((c) => ({
            value: String(c.id),
            label: c.name,
            hint: String(c.id),
          }))}
        />
        <p className="mt-1.5 mb-3 px-1 text-[11.5px] text-dim leading-normal">
          Where an address or a hash is looked up. Source files are read here
          and need no chain.
        </p>

        {/* the one input, whichever of the three it turns out to be */}
        {/* biome-ignore lint/a11y/noStaticElementInteractions: a drop target, not a control */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={drop}
          className={`rounded-inner border border-dashed p-2 transition-colors ${over ? "border-primary bg-primary/[.06]" : "border-border bg-inner-grad"}`}
        >
          <textarea
            value={text}
            rows={7}
            onChange={(e) => {
              setText(e.target.value);
              setFileName(null);
              setTooBig(null);
            }}
            placeholder={
              "Paste a transaction hash, a contract address,\nor Solidity source — or drop .sol files here."
            }
            className="w-full resize-none rounded-tile bg-field px-3 py-2.5 font-mono text-[12px] text-fg outline-none placeholder:font-sans placeholder:text-dim focus-visible:ring-2 focus-visible:ring-white/25"
          />
          <div className="mt-2 flex items-center gap-2">
            <input
              ref={picker}
              type="file"
              multiple
              accept=".sol,.txt,text/plain"
              className="hidden"
              onChange={(e) => void take(e.target.files)}
            />
            <button
              type="button"
              onClick={() => picker.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-tile bg-raised px-3 py-1.5 text-[12.5px] text-muted transition-colors hover:bg-hover hover:text-fg"
            >
              <PhIcon d={PH.code} className="size-[14px]" />
              Choose .sol files
            </button>
            {(text || fileName) && (
              <button
                type="button"
                onClick={clear}
                className="ml-auto rounded-tile px-2 py-1.5 text-[12.5px] text-dim transition-colors hover:text-fg"
              >
                Clear
              </button>
            )}
          </div>
          {fileName && (
            <p className="mt-2 flex items-center gap-1.5 px-1 text-[12px] text-body">
              <PhIcon d={PH.check} className="size-[13px] text-green" />
              {fileName}
            </p>
          )}
          {tooBig && (
            <p className="mt-2 px-1 text-[12px] text-red leading-normal">
              {tooBig}
            </p>
          )}
        </div>

        {/* what the page made of it, before anything is sent anywhere */}
        <div className="mt-2 min-h-[34px] px-1">
          {input ? (
            <p className="flex items-center gap-1.5 text-[12.5px] text-body">
              <PhIcon
                d={DOOR[input.kind].icon}
                className="size-[14px] text-muted"
              />
              Read as a{" "}
              <span className="text-fg">
                {DOOR[input.kind].label.toLowerCase()}
              </span>
            </p>
          ) : (
            text.trim() && (
              <p className="text-[12px] text-dim leading-normal">
                {whyNot(text)}
              </p>
            )
          )}
        </div>

        <button
          type="button"
          disabled={!input && !scan.busy}
          onClick={() => (scan.busy ? scan.stop() : start())}
          className="mt-1 h-11 flex-none rounded-chip bg-primary px-6 text-[14px] text-primary-fg outline-none transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-white/25 disabled:pointer-events-none disabled:bg-raised disabled:text-dim"
        >
          {scan.busy ? "Stop" : "Read it"}
        </button>

        {/* the three doors, for a reader who has none of them yet */}
        {scan.phase === "idle" && (
          <section className="mt-4 rounded-inner border border-border bg-inner-grad p-3">
            <p className="mb-2 flex items-center gap-2 text-[13px] text-fg">
              <PhIcon d={PH.search} className="size-[15px] text-muted" />
              Three ways in
            </p>
            <ul className="flex flex-col gap-2">
              {EXAMPLES.map((e) => (
                <li key={e.kind}>
                  <span className="block text-[12.5px] text-body">
                    {e.label}
                  </span>
                  <span className="block text-[11.5px] text-dim leading-normal">
                    {e.hint}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <p className="mt-3 px-1 text-[11.5px] text-dim leading-normal">
          {hosted ? (
            <>
              Answered by this Dort&rsquo;s own Bedrock, so the source you drop
              goes through the AWS account of whoever runs it. Reviewing
              something unpublished? Bring your own model in{" "}
              <Link
                href="/settings"
                className="text-fg underline underline-offset-2"
              >
                AI settings
              </Link>
              .
            </>
          ) : cfg.kind === "none" ? (
            <>
              No model configured, so Dort will read the chain and stop there —
              the facts, no review. Add one in{" "}
              <Link
                href="/settings"
                className="text-fg underline underline-offset-2"
              >
                AI settings
              </Link>
              .
            </>
          ) : (
            <>Reviewed by your own model. Nothing passes through Dort.</>
          )}
        </p>
      </aside>

      {/* ── middle: the reading ────────────────────────────────────────── */}
      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-card border border-border bg-card-grad shadow-soft">
        <header className="flex flex-none flex-wrap items-center gap-2 px-5 pt-4 pb-3">
          <span className="flex items-center gap-2 text-[14px] text-fg">
            <span className="size-1.5 rounded-full bg-primary" />
            Scan
          </span>
          {scan.input && (
            <Chip dot tone="info">
              {DOOR[scan.input.kind].label}
            </Chip>
          )}
          <span className="text-[12px] text-dim">
            {scan.phase === "reading"
              ? "Reading the chain…"
              : scan.phase === "reviewing"
                ? "Reviewing"
                : scan.phase === "done"
                  ? "Candidates to check — not an audit"
                  : "Hand in a contract, a hash, or source"}
          </span>
          {scan.phase !== "idle" && (
            <button
              type="button"
              onClick={clear}
              className="ml-auto rounded-tile bg-raised px-3 py-1.5 text-[12.5px] text-muted transition-colors hover:bg-hover hover:text-fg"
            >
              New
            </button>
          )}
        </header>

        <div className="min-h-0 flex-1 overflow-auto px-5 pb-4">
          {scan.phase === "idle" && !scan.error ? (
            <div className="grid h-full place-items-center">
              <div className="max-w-[460px] text-center">
                <p className="text-[15px] text-body leading-relaxed">
                  Dort reads it and tells you what to check.
                </p>
                <p className="mt-2 text-[12.5px] text-dim leading-relaxed">
                  A transaction becomes its real call tree, read from the node —
                  not a guess from the function name. A contract becomes what is
                  actually deployed there. Source becomes a first pass over the
                  code.
                </p>
                <p className="mt-3 text-[12.5px] text-dim leading-relaxed">
                  What comes back is a list of candidates and how to confirm
                  each one, plus what was not looked at. It is never a verdict,
                  and it is never a reason to skip an audit.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {scan.error && (
                <p className="rounded-card bg-red/[.08] px-3.5 py-2.5 text-[12.5px] text-body leading-relaxed">
                  {scan.error}
                </p>
              )}
              {scan.traceNote && (
                <p className="rounded-card bg-raised px-3.5 py-2.5 text-[12.5px] text-body leading-relaxed">
                  {scan.traceNote}
                </p>
              )}
              {scan.phase === "reading" && (
                <p className="text-[12.5px] text-dim">
                  Asking the chain what is there…
                </p>
              )}
              {scan.review && (
                <div className="rounded-card bg-raised px-3.5 py-3 text-[13px] text-body leading-relaxed">
                  <span className="whitespace-pre-wrap break-words">
                    {scan.review}
                  </span>
                  {scan.phase === "reviewing" && (
                    <span className="ml-1 text-dim">▍</span>
                  )}
                </div>
              )}
              {scan.phase === "done" && !scan.review && !scan.error && (
                <p className="text-[12.5px] text-dim leading-relaxed">
                  {cfg.kind === "none"
                    ? "The facts are on the right. For a reading of them, add a model in AI settings."
                    : "The model returned nothing."}
                </p>
              )}
              {/* the disclaimer rides with the answer, not in a footer nobody reads */}
              {scan.input && scan.phase === "done" && (
                <section className="rounded-card border border-border p-3.5">
                  <p className="mb-2 flex items-center gap-2 text-[13px] text-fg">
                    <span className="size-1.5 rounded-full bg-yellow" />
                    Not checked here
                  </p>
                  <ul className="flex flex-col gap-1">
                    {NOT_CHECKED[scan.input.kind].map((l) => (
                      <li
                        key={l}
                        className="flex gap-2 text-[12.5px] text-dim leading-normal"
                      >
                        <span className="mt-[7px] size-1 flex-none rounded-full bg-border" />
                        <span>{l}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}
        </div>
      </main>

      {/* ── right: the evidence, which stands without the model ────────── */}
      <div
        className={`hidden min-h-0 flex-none xl:flex ${right === "trace" ? "w-[520px]" : "w-[340px]"}`}
      >
        <section className="flex min-h-0 w-full flex-col overflow-hidden rounded-card border border-border bg-card-grad shadow-soft">
          <header className="flex-none px-3 pt-3 pb-2">
            <Tabs
              size="sm"
              value={right}
              onChange={setRight}
              options={[
                { value: "facts", label: "Facts" },
                {
                  value: "trace",
                  label: frames.length ? `Trace (${frames.length})` : "Trace",
                },
              ]}
            />
          </header>

          {right === "facts" ? (
            <div className="min-h-0 flex-1 overflow-auto px-3 pb-3">
              {!scan.facts ? (
                <p className="px-1 text-[12.5px] text-dim leading-normal">
                  What the chain says will appear here, before any model is
                  asked. It is read directly from the node, so it holds whether
                  you trust the review or not.
                </p>
              ) : (
                <dl className="flex flex-col gap-2">
                  {factRows(scan).map(([k, v]) => (
                    <div
                      key={k}
                      className="rounded-inner border border-border bg-inner-grad px-3 py-2"
                    >
                      <dt className="text-[11.5px] text-dim">{k}</dt>
                      <dd className="break-all font-mono text-[12px] text-fg">
                        {v}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-auto px-2 pb-3">
              {frames.length === 0 ? (
                <p className="px-1 text-[12.5px] text-dim leading-normal">
                  A transaction hash gets a call tree here, when the
                  chain&rsquo;s RPC allows debug_traceTransaction. Portaldot V3
                  does.
                </p>
              ) : (
                <>
                  <p className="px-1 pb-2 text-[11.5px] text-dim">
                    {traceSummary(frames)}
                  </p>
                  {/* the rows want a full-width panel: let them keep their real width and
                      scroll sideways rather than crushing the call out of the line */}
                  <div className="min-w-[620px]">
                    {frames.map((f, i) => (
                      <TraceRow
                        key={`${i}-${f.fn}`}
                        index={i}
                        frame={f}
                        maxGas={maxGas}
                        selected={false}
                        inRange={false}
                        onSelect={() => {}}
                        fold={(frames[i + 1]?.d ?? -1) > f.d ? "open" : null}
                        onFold={() => {}}
                        ask={null}
                        onAsk={() => {}}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

/** The gathered facts as rows, in the order a reader would ask for them. */
function factRows(scan: ReturnType<typeof useScan>): [string, string][] {
  const f = scan.facts;
  if (!f || !scan.input) return [];
  const rows: [string, string][] = [["Chain", f.chain]];
  if (scan.input.kind === "address") {
    rows.push(["Address", scan.input.value]);
    rows.push([
      "Deployed code",
      f.bytecodeBytes ? `${f.bytecodeBytes} bytes` : "nothing at this address",
    ]);
    rows.push([
      "ERC-20 metadata",
      f.token ? `${f.token.symbol}, ${f.token.decimals} decimals` : "no answer",
    ]);
  }
  if (scan.input.kind === "tx") {
    rows.push(["Transaction", scan.input.value]);
    rows.push(["Status", f.status ?? "unknown"]);
    if (f.block !== undefined) rows.push(["Block", String(f.block)]);
    if (f.from) rows.push(["From", f.from]);
    if (f.to) rows.push(["To", f.to]);
    if (f.value && f.value !== "0") rows.push(["Value", `${f.value} wei`]);
    rows.push([
      "Calls traced",
      f.frames?.length ? String(f.frames.length) : "none",
    ]);
  }
  if (scan.input.kind === "source") {
    rows.push(["Source", scan.input.name ?? "pasted"]);
    rows.push([
      "Size",
      `${scan.input.value.split("\n").length} lines, ${Math.round(scan.input.value.length / 1024)} KB`,
    ]);
    rows.push(["Read from", "your browser — the chain was not asked"]);
  }
  return rows;
}
