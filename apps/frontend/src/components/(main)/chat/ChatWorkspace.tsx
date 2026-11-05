"use client";

import Link from "next/link";
import {
  type DragEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Chip, Dropdown, PH, PhIcon, Tabs } from "@/components/ui";
import { useAiConfig } from "@/features/ai/hooks/useAiConfig";
import { useHostedAi } from "@/features/ai/hooks/useHostedAi";
import { useWalletProof } from "@/features/ai/hooks/useWalletProof";
import { DORT_AI } from "@/features/ai/utils/provider";
import type { ToolCall } from "@/features/ai/utils/tools";
import { PORTALDOT_ID, VAULT_CHAINS } from "@/features/bridge/chains";
import {
  canSend,
  digestOf,
  EMPTY_DIGEST,
  modeBadge,
  modeLine,
  sendLabel,
  suggestionsFor,
  useChat,
  useChatHistory,
  whenLabel,
} from "@/features/chat";
import { type RunFile, useRun, useShownSource } from "@/features/run";
import {
  addressesIn,
  detect,
  displayFrames,
  EXAMPLES,
  gatherFacts,
  hasChildren,
  hiddenByFold,
  joinSources,
  MAX_SOURCE,
  NOT_CHECKED,
  runTool,
  type ScanFacts,
  type ScanInput,
  scanPrompt,
  shortHex,
  subjectLabel,
  traceSummary,
  whyNot,
} from "@/features/scan";
import type { TraceSource } from "@/features/trace/types";
import { DropZone } from "../onboarding/RunDialog";
import { CopyPill } from "../shell/CopyPill";
import { Sidebar } from "../shell/Sidebar";
import { TraceRow } from "../trace/TraceRow";
import { Markdown } from "./Markdown";
import { ShareButton } from "./ShareButton";

const fromFile = (data: RunFile): TraceSource => ({ data, origin: "file" });

/**
 * Chat: ask in a sentence.
 *
 * Laid out in three panels like the Trace view it replaces — the run on the left, the
 * conversation in the middle, what the conversation is grounded in on the right. A newcomer's
 * real first question is "what is it reading?", and a centred box with nothing around it answers
 * that with nothing: these panels make the answer's provenance part of the page instead of a
 * claim in a sentence.
 *
 * Three modes, one box: against the loaded Foundry run when there is one, against a contract the
 * reader hands in, and generally when there is neither. Which is in force is stated in the header
 * and again on the left, never left to be inferred — an answer about "your project" when no
 * project is loaded is the most convincing kind of wrong.
 *
 * Handing something in is the same box, not a second page. A reader arrives with whichever of the
 * three they have — a transaction hash, a contract address, or .sol files — and `detect` works
 * out which; asking them to classify it first is asking them to know the answer already. The
 * reading that comes back is a list of candidates with what was *not* checked beside it, never a
 * verdict (features/scan): a tool believed when it says "no issues found" is worse than no tool.
 *
 * The model is the user's own, always (features/ai). There is no Dort-hosted fallback: an
 * auditor's unpublished source must never pass through our infrastructure, and a chat box is
 * exactly where it would.
 */
export function ChatWorkspace({ source }: { source: TraceSource }) {
  // the same path the Trace page used, so a dropped dort-data.json grounds the chat on the hosted
  // site too — without this, grounded mode would only ever work with DORT_DATA_PATH set
  const shown = useShownSource(source, fromFile);
  const { setSample } = useRun();
  const digest = useMemo(
    () =>
      shown.source ? digestOf(shown.source.data, shown.origin) : EMPTY_DIGEST,
    [shown],
  );
  // with nothing chosen, this Dort's own model answers when it has one — so a first-time visitor
  // can ask something without opening an AWS console first. Choosing any provider in AI settings
  // replaces it, and the page says which of the two is answering either way.
  const stored = useAiConfig();
  const hostedAi = useHostedAi().ready;
  const cfg = stored.kind === "none" && hostedAi ? DORT_AI : stored;
  const history = useChatHistory();
  const [draft, setDraft] = useState("");
  const [left, setLeft] = useState<"run" | "history">("run");
  // two panels, not three. The facts are what the answer was made from, which is exactly what
  // Context is for; a tab of their own that only ever appeared after a hand-in was a door most
  // readers never saw open.
  const [right, setRight] = useState<"context" | "trace">("context");
  // what the reader handed in, if anything: the subject of the conversation beside the run
  const [chain, setChain] = useState<number>(PORTALDOT_ID);
  // the model may ask the chain for a transaction or an address it was not given. The chain is
  // the one picked on the left, never one the model names: a tool that took an endpoint would be
  // a model-controlled request from the reader's own browser.
  const run = useCallback((call: ToolCall) => runTool(call, chain), [chain]);
  // the proof is signed on request and never on its own: a wallet popup nobody asked for is
  // how a page teaches people to click through them
  const proof = useWalletProof();
  const chat = useChat(cfg, digest, run, proof.claim);
  const [subject, setSubject] = useState<ScanInput | null>(null);
  const [facts, setFacts] = useState<ScanFacts | null>(null);
  const [traceNote, setTraceNote] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [handErr, setHandErr] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const [testAt, setTestAt] = useState(0);
  const thread = useRef<HTMLDivElement>(null);
  const starters = useMemo(() => suggestionsFor(digest), [digest]);

  // the tests, for the Trace tab: the calls the answer was grounded in, as the run recorded them
  const tests = shown.source?.data.tests ?? [];
  const test = tests[Math.min(testAt, Math.max(0, tests.length - 1))];
  const frames = test?.frames ?? [];
  const _maxGas = Math.max(1, ...frames.map((f) => f.gas ?? 0));

  // put back the thread this browser was in. Once only, and only into an empty chat: a resume
  // that fired again after the list settled would wipe whatever had been typed since.
  const resumed = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the saved list arriving is the trigger
  useEffect(() => {
    if (resumed.current) return;
    const saved = history.resume();
    if (!saved?.length) return;
    resumed.current = true;
    chat.load(saved);
  }, [history.list]);

  // keep the open thread saved as it grows; an unanswered question is not kept (worthSaving)
  // biome-ignore lint/correctness/useExhaustiveDependencies: the turns' content is the trigger
  useEffect(() => {
    if (!chat.busy) history.save(chat.turns, modeBadge(digest));
  }, [chat.turns, chat.busy]);

  // follow the stream, but only while the user is already at the bottom: yanking the view back
  // down while they are reading something further up is worse than not following at all
  // biome-ignore lint/correctness/useExhaustiveDependencies: the turns' text is what scrolls
  useEffect(() => {
    const el = thread.current;
    if (!el) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 120)
      el.scrollTop = el.scrollHeight;
  }, [chat.turns]);

  // the frames on the right: the subject's own call tree when one was handed in, the loaded
  // run's otherwise. One panel, because a reader only ever has one of the two in mind.
  const liveFrames = facts?.frames ?? [];
  const shownFrames = subject ? liveFrames : frames;
  const shownRows = useMemo(() => displayFrames(shownFrames), [shownFrames]);
  const shownGas = Math.max(1, ...shownFrames.map((f) => f.gas ?? 0));
  const shownCalls = shownFrames.filter((f) => f.kind !== "EVENT").length;
  // the rows were drawn with a fold box and a click target that did nothing, copied from a
  // read-only preview. A call you cannot open is a picture of a call.
  const [folded, setFolded] = useState<ReadonlySet<number>>(() => new Set());
  const [pick, setPick] = useState<number | null>(null);
  const hidden = useMemo(
    () => hiddenByFold(shownFrames, folded),
    [shownFrames, folded],
  );
  const toggleFold = (i: number) =>
    setFolded((prev) => {
      const next = new Set(prev);
      if (!next.delete(i)) next.add(i);
      return next;
    });
  /** ask about one call, with the call itself attached rather than described */
  const askAboutCall = (i: number) => {
    const f = shownFrames[i];
    if (!f || !chat.ready) return;
    const where = `${f.kind} ${f.to}.${f.fn}${f.args ? `(${f.args})` : ""}`;
    chat.send(
      `What should I check about ${f.fn} on ${shortHex(f.to)}?`,
      `In the trace above, call ${i} is:\n\n${where}${f.ok ? "" : ` — which reverted: ${f.status}`}${
        f.gas ? `\nGas: ${f.gas}` : ""
      }${f.ret ? `\nIt returned: ${f.ret}` : ""}\n\nWhat is worth checking about this one call, and how would I confirm it? If the trace does not say enough to tell, say so plainly.`,
    );
  };
  const touched = useMemo(() => addressesIn(liveFrames), [liveFrames]);
  // what the box would make of what is in it, so the control can say so before it is pressed
  const detected = useMemo(() => detect(draft), [draft]);
  const chainName =
    VAULT_CHAINS.find((c) => c.id === chain)?.name ?? `chain ${chain}`;

  const ask = (text: string) => {
    if (!chat.ready) return;
    chat.send(text);
    setDraft("");
  };

  /**
   * Something handed in: read the chain first, then ask.
   *
   * The facts land before a single token of the answer does, and they are read from the node, so
   * a reader who distrusts the review still leaves with the call tree. The thread shows a
   * sentence; the model receives the whole thing (Turn.sent).
   */
  async function handIn(input: ScanInput) {
    if (!chat.ready || reading || chat.busy) return;
    setReading(true);
    setHandErr(null);
    try {
      const got = await gatherFacts(chain, input);
      setSubject(input);
      setFacts(got.facts);
      setTraceNote(got.traceNote);
      // a call tree is worth opening on; a contract with no tree has its facts in Context,
      // which is where the panel already is
      setRight(got.facts.frames?.length ? "trace" : "context");
      setDraft("");
      chat.send(
        subjectLabel(input, input.kind === "source" ? undefined : chainName),
        scanPrompt(input, got.facts),
      );
    } catch (e) {
      setHandErr(
        `Couldn't read that from ${chainName}: ${(e as Error).message}. An address or hash from another network will not be found here — check the chain.`,
      );
    } finally {
      setReading(false);
    }
  }

  /** .sol files, chosen or dropped. A real contract imports, so the set goes in together. */
  async function take(list: FileList | null) {
    if (!list?.length) return;
    setHandErr(null);
    const files = [...list];
    const total = files.reduce((n, f) => n + f.size, 0);
    if (total > MAX_SOURCE) {
      setHandErr(
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
      setHandErr("Those files were empty.");
      return;
    }
    const input = detect(joined.text, joined.name);
    if (!input) {
      setHandErr(
        "No Solidity in those files — Dort looks for a contract, library or interface declaration.",
      );
      return;
    }
    void handIn(input);
  }

  const drop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    // a dort-data.json dropped here is a run, not a contract; the left panel owns that
    void take(e.dataTransfer?.files ?? null);
  };

  const dropSubject = () => {
    setSubject(null);
    setFacts(null);
    setTraceNote(null);
    setHandErr(null);
    setRight("context");
  };
  const startFresh = () => {
    history.fresh();
    chat.reset();
    dropSubject();
  };
  const empty = chat.turns.length === 0;
  // the answer the Context panel describes: the last one the assistant gave
  const last = [...chat.turns].reverse().find((t) => t.role === "assistant");

  return (
    <div className="flex min-h-0 flex-1 gap-3 px-3 pb-3">
      {/* ── left: what is loaded, and what to ask it ───────────────────── */}
      <div className="hidden flex-none overflow-hidden lg:flex">
        <Sidebar>
          <Tabs
            size="sm"
            className="mb-3"
            value={left}
            onChange={setLeft}
            options={[
              { value: "run", label: "Run" },
              {
                value: "history",
                label: history.list.length
                  ? `History (${history.list.length})`
                  : "History",
              },
            ]}
          />

          {left === "run" ? (
            <>
              <p className="mb-1 flex items-center gap-2 text-[13px] text-fg">
                <PhIcon d={PH.sparkle} className="size-[15px] text-muted" />
                {modeBadge(digest)}
              </p>
              <p className="mb-3 text-[12.5px] text-dim leading-normal">
                {modeLine(digest)}
              </p>

              {digest.loaded ? (
                <dl className="mb-3 grid gap-1">
                  {[
                    ["Tests", String(digest.total)],
                    ["Passing", String(digest.passed)],
                    ["Failing", String(digest.failed)],
                    // without this a run with skipped tests reads as though the counts were wrong
                    ...(digest.skipped
                      ? [["Skipped", String(digest.skipped)]]
                      : []),
                    ["Contracts", String(digest.contracts.length)],
                    ["Files", String(digest.files.length)],
                  ].map(([k, v]) => (
                    <div
                      key={k}
                      className="flex items-baseline justify-between"
                    >
                      <dt className="text-[12px] text-muted">{k}</dt>
                      <dd className="font-mono text-[12.5px] text-fg tabular-nums">
                        {v}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <div className="mb-3 grid gap-2 rounded-inner border border-border bg-inner-grad p-3">
                  <p className="text-[12.5px] text-body leading-normal">
                    Drop a <code className="font-mono">dort-data.json</code> to
                    answer about real code. It is read in this tab only and
                    never uploaded.
                  </p>
                  <DropZone onLoaded={() => undefined} />
                  <button
                    type="button"
                    onClick={() => setSample(true)}
                    className="justify-self-start rounded-tile bg-raised px-3 py-1.5 text-[12px] text-muted transition-colors hover:text-fg"
                  >
                    Try the sample vault
                  </button>
                </div>
              )}

              {/* hand something in: the chain an address or hash is looked up on, and what the
                  three doors take. Source needs no chain — it is read in this tab. */}
              <section className="mb-3 rounded-inner border border-border bg-inner-grad p-3">
                <p className="mb-2 flex items-center gap-2 text-[13px] text-fg">
                  <PhIcon d={PH.search} className="size-[15px] text-muted" />
                  Review a contract
                </p>
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
                <ul className="mt-2.5 flex flex-col gap-2">
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
                <button
                  type="button"
                  disabled={!chat.ready || reading || chat.busy}
                  onClick={() => picker.current?.click()}
                  className="mt-2.5 w-full rounded-tile bg-raised px-3 py-2 text-[12.5px] text-muted transition-colors hover:bg-hover hover:text-fg disabled:pointer-events-none disabled:opacity-40"
                >
                  <PhIcon
                    d={PH.paperclip}
                    className="mr-1.5 inline size-[14px] align-[-2px]"
                  />
                  Choose .sol files
                </button>
              </section>

              <p className="mt-1 mb-1.5 text-[12px] text-muted">Start with</p>
              <div className="grid gap-1.5">
                {starters.map((q) => (
                  <button
                    key={q}
                    type="button"
                    disabled={!chat.ready}
                    onClick={() => ask(q)}
                    className="rounded-tile bg-raised px-2.5 py-2 text-left text-[12.5px] text-muted leading-snug transition-colors hover:bg-hover hover:text-fg disabled:pointer-events-none disabled:opacity-40"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="mb-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={startFresh}
                  className="flex-1 rounded-tile bg-raised px-3 py-2 text-left text-[12.5px] text-muted transition-colors hover:bg-hover hover:text-fg"
                >
                  + New conversation
                </button>
                {history.list.length > 0 && (
                  <button
                    type="button"
                    onClick={history.clear}
                    title="Forget every saved conversation"
                    className="rounded-tile px-2 py-2 text-[12px] text-dim transition-colors hover:text-red"
                  >
                    Clear
                  </button>
                )}
              </div>
              {history.list.length === 0 ? (
                <p className="text-[12.5px] text-dim leading-normal">
                  Nothing saved yet. Conversations are kept in this browser only
                  — never on a server, because what you asked about your
                  contract is not ours to hold.
                </p>
              ) : (
                <ul className="grid min-w-0 gap-1">
                  {history.list.map((c) => (
                    <li key={c.id}>
                      <div
                        className={`group flex min-w-0 items-start gap-1 rounded-tile px-2.5 py-2 transition-colors ${
                          history.current === c.id
                            ? "bg-primary/[.08] shadow-[inset_2px_0_0_var(--primary)]"
                            : "hover:bg-hover"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            const turns = history.open(c.id);
                            if (turns) chat.load(turns);
                          }}
                          className="min-w-0 flex-1 text-left"
                        >
                          <span className="block truncate text-[12.5px] text-fg">
                            {c.title}
                          </span>
                          <span className="mt-0.5 block text-[11.5px] text-dim">
                            {c.mode} · {whenLabel(c.at)} ·{" "}
                            {c.turns.filter((t) => t.role === "user").length}{" "}
                            asked
                          </span>
                        </button>
                        <button
                          type="button"
                          aria-label={`Forget "${c.title}"`}
                          onClick={() => history.remove(c.id)}
                          className="flex-none rounded px-1 text-[12px] text-dim opacity-0 transition-opacity hover:text-red group-hover:opacity-100 focus-visible:opacity-100"
                        >
                          ×
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </Sidebar>
      </div>

      {/* ── middle: the conversation ───────────────────────────────────── */}
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-card border border-border bg-card-grad shadow-soft">
        <header className="flex flex-none items-center gap-2 px-5 pt-4 pb-3">
          <span className="flex items-center gap-2 text-[14px] text-fg">
            <span className="size-1.5 rounded-full bg-primary" />
            Chat
          </span>
          <Chip
            dot
            tone={!digest.loaded ? "warn" : digest.sample ? "info" : "ok"}
          >
            {modeBadge(digest)}
          </Chip>
          <span className="text-[12px] text-dim">
            {chat.builtin
              ? "Built-in answers"
              : chat.hosted
                ? "Dort's model"
                : "Your model"}
          </span>
          {/* both controls in one group, so New arriving with the first answer does not shove
              Share sideways mid-conversation */}
          <div className="ml-auto flex flex-none items-center gap-1.5">
            <ShareButton />
            {!empty && (
              <button
                type="button"
                onClick={startFresh}
                className="rounded-tile bg-raised px-3 py-1.5 text-[12.5px] text-muted transition-colors hover:bg-hover hover:text-fg"
              >
                New
              </button>
            )}
          </div>
        </header>

        <div ref={thread} className="min-h-0 flex-1 overflow-auto px-5 pb-4">
          {empty ? (
            <div className="grid h-full place-items-center">
              <div className="max-w-[420px] text-center">
                <p className="text-[15px] text-body leading-relaxed">
                  Ask anything about{" "}
                  {digest.loaded ? "this run" : "smart contracts"}. Plain
                  language is fine.
                </p>
                {chat.builtin && (
                  <p className="mt-2 text-[12.5px] text-dim leading-relaxed">
                    Right now Dort answers from the run&rsquo;s own figures,
                    with no model and nothing leaving this machine. For anything
                    that needs the code read, press{" "}
                    <Link
                      href="/settings"
                      className="text-fg underline underline-offset-2"
                    >
                      AI settings
                    </Link>{" "}
                    and bring your own.
                  </p>
                )}
                {chat.hosted && (
                  <p className="mt-2 text-[12.5px] text-dim leading-relaxed">
                    Answered by this Dort&rsquo;s own Bedrock, so you can ask
                    without a key — your question goes through the AWS account
                    of whoever runs it. Reviewing something unpublished? Open{" "}
                    <Link
                      href="/settings"
                      className="text-fg underline underline-offset-2"
                    >
                      AI settings
                    </Link>{" "}
                    and bring your own key instead.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="grid gap-3">
              {chat.turns.map((t) => (
                <div
                  key={t.at}
                  className={
                    t.role === "user"
                      ? "max-w-[80%] justify-self-end rounded-card bg-primary px-3.5 py-2 text-[13px] text-primary-fg"
                      : "max-w-[92%] justify-self-start rounded-card bg-raised px-3.5 py-2.5 text-[13px] text-body leading-relaxed"
                  }
                >
                  {/* what it went and fetched before answering: a reading that looked something
                      up is a different claim from one that did not */}
                  {t.tools?.length ? (
                    <ul className="mb-2 flex flex-col gap-1 border-border border-b pb-2">
                      {t.tools.map((x) => (
                        <li
                          key={`${x.name}-${x.arg}`}
                          className="flex items-center gap-1.5 font-mono text-[11.5px] text-dim"
                        >
                          <PhIcon d={PH.search} className="size-[13px]" />
                          {x.name}
                          <span className="truncate text-muted">{x.arg}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {/* nothing said yet: three dots rather than an empty bubble or a spinner —
                      the reader is waiting for a reply, not for the app */}
                  {t.role === "assistant" && !t.content && chat.busy ? (
                    // <output>, not a span with role=status: it is the element the role
                    // describes, and a screen reader announces it without being told twice
                    <output
                      className="ai-dots text-muted"
                      aria-label="Thinking"
                    >
                      <i />
                      <i />
                      <i />
                    </output>
                  ) : t.role === "assistant" ? (
                    // the answer is a document — headings, the list of things to check, the
                    // snippet meant to be copied — and it was arriving as one pre-wrapped wall
                    // with asterisks in it. The reading is the product; it has to be readable.
                    <Markdown text={t.content} />
                  ) : (
                    <span className="whitespace-pre-wrap break-words">
                      {t.content}
                    </span>
                  )}
                  {t.role === "assistant" &&
                    chat.busy &&
                    t.content &&
                    t === chat.turns[chat.turns.length - 1] && (
                      <span className="ml-1 text-dim">▍</span>
                    )}
                </div>
              ))}
              {/* the blind spots ride with the answer. A reading that stays quiet about what it
                  could not look at is read as a clean bill of health, and that is the one
                  outcome here that does harm. */}
              {subject && !chat.busy && chat.turns.length > 1 && (
                <section className="max-w-[92%] justify-self-start rounded-card border border-border px-3.5 py-3">
                  <p className="mb-2 flex items-center gap-2 text-[13px] text-fg">
                    <span className="size-1.5 rounded-full bg-yellow" />
                    Not checked here
                  </p>
                  <ul className="flex flex-col gap-1">
                    {NOT_CHECKED[subject.kind].map((l) => (
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

        {/* biome-ignore lint/a11y/noStaticElementInteractions: a drop target, not a control */}
        <footer
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={drop}
          className={`flex-none border-t p-3 transition-colors ${
            over ? "border-primary bg-primary/[.06]" : "border-border"
          }`}
        >
          {/* what is being reviewed, when something is — a chip, so it is never a guess which
              contract an answer is about */}
          {subject && (
            <div className="mb-2 flex items-center gap-2">
              <Chip dot tone="info">
                {subject.kind === "tx"
                  ? "Transaction"
                  : subject.kind === "address"
                    ? "Contract"
                    : "Solidity"}
              </Chip>
              <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-body">
                {subject.kind === "source"
                  ? (subject.name ?? "pasted source")
                  : subject.value}
              </span>
              <button
                type="button"
                onClick={dropSubject}
                className="flex-none rounded-tile px-2 py-1 text-[12px] text-dim transition-colors hover:text-fg"
              >
                Clear
              </button>
            </div>
          )}
          <div className="flex items-end gap-2">
            <textarea
              value={draft}
              rows={2}
              disabled={!chat.ready || reading}
              placeholder={
                chat.ready
                  ? "Ask in your own words — or paste a contract address, a transaction hash, or Solidity"
                  : "Connect your AI to start"
              }
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                // Enter sends, Shift+Enter breaks the line: a chat box, not a form field
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (detected) void handIn(detected);
                  else if (canSend(draft, chat.busy)) ask(draft);
                }
              }}
              className="min-w-0 flex-1 resize-none rounded-card bg-field px-3.5 py-2.5 text-[13px] text-fg outline-none placeholder:text-dim focus-visible:ring-2 focus-visible:ring-white/25 disabled:opacity-50"
            />
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
              aria-label="Attach .sol files"
              title="Attach .sol files — read in this tab, never uploaded"
              disabled={!chat.ready || reading || chat.busy}
              onClick={() => picker.current?.click()}
              className="grid h-[52px] w-11 flex-none place-items-center rounded-chip bg-raised text-muted outline-none transition-colors hover:bg-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-white/25 disabled:pointer-events-none disabled:opacity-40"
            >
              <PhIcon d={PH.paperclip} className="size-[18px]" />
            </button>
            <button
              type="button"
              disabled={
                !chat.ready ||
                reading ||
                (!chat.busy && !detected && !canSend(draft, chat.busy))
              }
              onClick={() => {
                if (chat.busy) chat.stop();
                else if (detected) void handIn(detected);
                else ask(draft);
              }}
              className="h-[52px] flex-none rounded-chip bg-primary px-6 text-[14px] text-primary-fg outline-none transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-white/25 disabled:pointer-events-none disabled:bg-raised disabled:text-dim"
            >
              {reading
                ? "Reading…"
                : detected && !chat.busy
                  ? "Read it"
                  : sendLabel(chat.busy)}
            </button>
          </div>
          {/* the box says what it made of what is in it, before anything is sent anywhere */}
          {detected && !reading && (
            <p className="mt-2 px-1 text-[12px] text-dim">
              Read as a{" "}
              <span className="text-body">
                {detected.kind === "tx"
                  ? "transaction hash"
                  : detected.kind === "address"
                    ? "contract address"
                    : "Solidity source"}
              </span>
              {detected.kind !== "source" && ` on ${chainName}`}. Press Read it
              and Dort asks the chain first.
            </p>
          )}
          {!detected && draft.trim().startsWith("0x") && (
            <p className="mt-2 px-1 text-[12px] text-dim">{whyNot(draft)}</p>
          )}
          {handErr && (
            <p className="mt-2 px-1 text-[12px] text-red leading-normal">
              {handErr}
            </p>
          )}
          {chat.error && (
            <p className="mt-2 text-[12px] text-red">{chat.error}</p>
          )}
        </footer>
      </main>

      {/* ── right: what the answer is grounded in, and the calls behind it ─── */}
      <div
        className={`hidden min-h-0 flex-none xl:flex ${
          right === "trace" ? "w-[520px]" : "w-[380px]"
        }`}
      >
        <section className="flex min-h-0 w-full flex-col overflow-hidden rounded-card border border-border bg-card-grad shadow-soft">
          <header className="flex-none px-3 pt-3 pb-2">
            <Tabs
              size="sm"
              value={right}
              onChange={setRight}
              options={[
                { value: "context", label: "Context" },
                {
                  value: "trace" as const,
                  // calls, matching the summary above the rows. Counting the frames said 7
                  // where the summary said 6, because an event is a row and not a call.
                  label: shownCalls ? `Trace (${shownCalls})` : "Trace",
                },
              ]}
            />
          </header>

          {right === "context" ? (
            <div className="min-h-0 flex-1 overflow-auto px-3 pb-3">
              {/* What the last answer cost and how it got there. The working comes before the
                  grounding on purpose: a reader deciding whether to believe a reading of their
                  contract is better served by the reasoning than by the conclusion, and this is
                  the only place either is visible. */}
              {last && (
                <section className="mb-3 rounded-inner border border-border bg-inner-grad p-3">
                  <p className="mb-2 flex items-center gap-2 text-[13px] text-fg">
                    <PhIcon d={PH.sparkle} className="size-[15px] text-muted" />
                    How this answer was made
                  </p>
                  <dl className="mb-2 grid gap-1">
                    {[
                      ["Answered by", chat.hosted ? "this Dort" : "your model"],
                      ...(chat.allowance
                        ? ([
                            ["Left this hour", String(chat.allowance.left)],
                          ] as [string, string][])
                        : []),
                      ...(last.usage
                        ? ([
                            [
                              "Tokens in",
                              last.usage.sent.toLocaleString("en-US"),
                            ],
                            [
                              "Tokens back",
                              last.usage.back.toLocaleString("en-US"),
                            ],
                          ] as [string, string][])
                        : []),
                    ].map(([k, v]) => (
                      <div
                        key={k}
                        className="flex items-baseline justify-between"
                      >
                        <dt className="text-[12px] text-muted">{k}</dt>
                        <dd className="font-mono text-[12.5px] text-fg tabular-nums">
                          {v}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  {/* how many are left and how to have more, said while there are still some
                      left: a limit a reader meets without warning reads as the app breaking */}
                  {chat.hosted && chat.allowance && (
                    <p className="mb-2 text-[12px] text-dim leading-normal">
                      {chat.allowance.note}
                      {proof.can && !proof.claim && (
                        <>
                          {" "}
                          <button
                            type="button"
                            disabled={proof.signing}
                            onClick={() => void proof.prove()}
                            className="text-fg underline underline-offset-2 disabled:opacity-50"
                          >
                            {proof.signing
                              ? "Check your wallet…"
                              : "Prove this wallet"}
                          </button>
                          {
                            " — one signature, good for the hour. It moves nothing."
                          }
                        </>
                      )}
                    </p>
                  )}
                  {last.thinking ? (
                    <>
                      <p className="mt-2.5 mb-1 text-[12px] text-muted">
                        Its working
                      </p>
                      <p className="max-h-[260px] overflow-auto whitespace-pre-wrap break-words rounded-tile bg-raised px-2.5 py-2 text-[12px] text-body leading-relaxed">
                        {last.thinking}
                      </p>
                    </>
                  ) : (
                    <p className="mt-2 text-[12px] text-dim leading-normal">
                      This model did not send its working — some do and some do
                      not, and an empty box here would read as a failure rather
                      than a difference between models.
                    </p>
                  )}
                </section>
              )}

              {/* read from the node before any model was asked. It stands without the model,
                  so a reader who distrusts the review still leaves with something — which is
                  why it is here, with everything else the answer was made from, rather than
                  behind a tab of its own that only ever opened after a hand-in. */}
              {subject && (
                <section className="mb-3">
                  <p className="mb-1.5 flex items-center gap-2 text-[13px] text-fg">
                    <PhIcon d={PH.search} className="size-[15px] text-muted" />
                    What the chain says
                  </p>
                  {traceNote && (
                    <p className="mb-2 rounded-inner bg-raised px-3 py-2 text-[12px] text-body leading-normal">
                      {traceNote}
                    </p>
                  )}
                  <dl className="flex flex-col gap-1.5">
                    {factRows(subject, facts).map(([k, v]) => (
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
                  {facts?.explorer && (
                    <a
                      href={facts.explorer}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex items-center gap-1.5 rounded-tile bg-raised px-3 py-1.5 text-[12.5px] text-muted transition-colors hover:bg-hover hover:text-fg"
                    >
                      Open on the explorer
                      <PhIcon d={PH.caretRight} className="size-3" />
                    </a>
                  )}
                  {facts?.probe && (
                    <>
                      <p className="mt-2.5 mb-1 text-[12px] text-muted">
                        This chain has no explorer — ask it yourself
                      </p>
                      <CopyPill text={facts.probe} />
                    </>
                  )}
                </section>
              )}

              <p className="mb-1 flex items-center gap-2 text-[13px] text-fg">
                <PhIcon d={PH.code} className="size-[15px] text-muted" />
                What it answers from
              </p>
              <p className="mb-3 text-[12.5px] text-dim leading-normal">
                {digest.loaded
                  ? "A summary of the run, attached to your first message. Whole traces would be tens of thousands of tokens of mostly noise — the Trace tab is where the calls themselves are."
                  : "Nothing yet. Load a run and this panel lists exactly what gets sent."}
              </p>

              {digest.failed > 0 && (
                <section className="mb-3 rounded-inner border border-border bg-inner-grad p-3">
                  <p className="mb-1.5 text-[12.5px] text-fg">
                    Failures ({digest.failed})
                  </p>
                  <ul className="grid gap-1.5">
                    {digest.failures.slice(0, 6).map((f) => (
                      <li key={`${f.suite}.${f.name}`} className="text-[12px]">
                        <span className="font-mono text-fg">{f.name}</span>
                        <span className="block text-dim leading-snug">
                          {f.reason}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {digest.contracts.length > 0 && (
                <section className="mb-3">
                  <p className="mb-1.5 text-[12px] text-muted">
                    Contracts the calls went through
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {digest.contracts.slice(0, 14).map((c) => (
                      <span
                        key={c}
                        className="rounded-full bg-raised px-2 py-0.5 font-mono text-[11.5px] text-muted"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                </section>
              )}

              {digest.forks.length > 0 && (
                <section className="mb-3">
                  <p className="mb-1.5 text-[12px] text-muted">Also run on</p>
                  <div className="flex flex-wrap gap-1">
                    {digest.forks.map((f) => (
                      <span
                        key={f}
                        className="rounded-full bg-raised px-2 py-0.5 text-[11.5px] text-muted"
                      >
                        {f}
                      </span>
                    ))}
                  </div>
                </section>
              )}
            </div>
          ) : (
            /* the calls: the handed-in transaction's own tree when there is one, the loaded
               run's otherwise — so a claim in an answer can be checked against the trace it came
               from without leaving the page */
            <div className="flex min-h-0 flex-1 flex-col">
              {!subject && tests.length === 0 ? (
                <p className="px-3 pb-3 text-[12.5px] text-dim leading-normal">
                  No run loaded and nothing handed in, so there are no calls to
                  show. Paste a transaction hash below and Dort traces it on the
                  chain.
                </p>
              ) : (
                <>
                  {!subject && (
                    <div className="flex-none px-3 pb-2">
                      <Dropdown
                        ariaLabel="Test"
                        label="Test"
                        mono
                        value={String(testAt)}
                        onChange={(v) => setTestAt(Number(v))}
                        options={tests.map((t, i) => ({
                          value: String(i),
                          label: t.name,
                          hint: t.status === "Success" ? undefined : t.status,
                        }))}
                      />
                    </div>
                  )}
                  {/* the rows are built for a full-width panel; let them keep their real width
                      and scroll sideways rather than crushing the call out of the line */}
                  <div className="min-h-0 flex-1 overflow-auto px-2 pb-3">
                    <div className="min-w-[620px]">
                      {shownFrames.length === 0 ? (
                        <p className="px-1 text-[12.5px] text-dim leading-normal">
                          {subject
                            ? (traceNote ??
                              "Nothing to trace here: only a transaction has a call tree of its own.")
                            : "This test has no recorded frames — only unit tests are traced step by step."}
                        </p>
                      ) : (
                        <>
                          {subject && (
                            <p className="px-1 pb-2 text-[11.5px] text-dim">
                              {traceSummary(shownFrames)}
                            </p>
                          )}
                          {shownRows.map((f, i) =>
                            hidden[i] ? null : (
                              <TraceRow
                                key={`${i}-${f.fn}`}
                                index={i}
                                frame={f}
                                maxGas={shownGas}
                                selected={pick === i}
                                inRange={false}
                                onSelect={() => setPick(pick === i ? null : i)}
                                fold={
                                  hasChildren(shownFrames, i)
                                    ? folded.has(i)
                                      ? "closed"
                                      : "open"
                                    : null
                                }
                                onFold={() => toggleFold(i)}
                                // the pill sits on the row last clicked, as it does in the
                                // trace view this panel borrows its rows from
                                ask={pick === i && chat.ready ? "Ask" : null}
                                onAsk={() => askAboutCall(i)}
                              />
                            ),
                          )}
                          {/* the rows abbreviate addresses to stay readable; nothing may be
                              only ever seen cut short */}
                          {touched.length > 0 && (
                            <section className="mt-3 rounded-inner border border-border bg-inner-grad p-3">
                              <p className="mb-2 text-[12.5px] text-fg">
                                Addresses in this trace
                              </p>
                              <ul className="flex flex-col gap-1.5">
                                {touched.map((a) => (
                                  <li key={a.full} className="min-w-0">
                                    <span className="block font-mono text-[11.5px] text-dim">
                                      {a.short}
                                    </span>
                                    <span className="block break-all font-mono text-[11.5px] text-body">
                                      {a.full}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </section>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Where the question goes, at the foot of the panel rather than at the end of a
              scroll: it is the one thing on this page a reader may need before they type, and
              burying it under a run's contents is a strange place for it. Folded, because it
              does not change between questions and an open paragraph would push the panel's
              actual contents up the screen every time. */}
          {right === "context" && (
            <details className="group flex-none border-border border-t">
              <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-[12px] text-muted transition-colors hover:text-fg">
                <span
                  aria-hidden="true"
                  className="size-1.5 rounded-full bg-primary"
                />
                {chat.builtin
                  ? "Nothing leaves this machine"
                  : chat.hosted
                    ? "Where your question goes"
                    : "Your model, and nowhere else"}
                <PhIcon
                  d={PH.caretDown}
                  className="ml-auto size-3 transition-transform group-open:rotate-180"
                />
              </summary>
              <p className="px-3 pb-3 text-[11.5px] text-dim leading-relaxed">
                {chat.builtin
                  ? "Answers come from Dort's own built-in text, composed from the figures above — no model, no request, nothing leaves this machine. Open AI settings to have your own model read the code."
                  : chat.hosted
                    ? "Answered by this deployment's own Bedrock: your question leaves this browser for the AWS account of whoever runs it, and lands in that account's logs if model invocation logging is on there. Open AI settings to use a model that is yours alone."
                    : "Your question goes straight from this browser to the model you chose, and to nowhere else."}{" "}
                Defensive review only: Dort explains code and writes Foundry
                tests for intended behaviour, and refuses to write exploits.
              </p>
            </details>
          )}
        </section>
      </div>
    </div>
  );
}

/** The gathered facts as rows, in the order a reader would ask for them. */
function factRows(
  subject: ScanInput | null,
  f: ScanFacts | null,
): [string, string][] {
  if (!subject || !f) return [];
  const rows: [string, string][] = [["Chain", f.chain]];
  if (subject.kind === "address") {
    rows.push(["Address", subject.value]);
    rows.push([
      "Deployed code",
      f.bytecodeBytes ? `${f.bytecodeBytes} bytes` : "nothing at this address",
    ]);
    rows.push([
      "ERC-20 metadata",
      f.token ? `${f.token.symbol}, ${f.token.decimals} decimals` : "no answer",
    ]);
  }
  if (subject.kind === "tx") {
    // the order an explorer lists them in, which is the order a reader asks: what happened,
    // when, between whom, how much it moved, what it cost, and what it left behind
    rows.push(["Transaction", subject.value]);
    rows.push([
      "Status",
      `${f.status ?? "unknown"}${f.at ? ` · ${new Date(f.at * 1000).toLocaleString()}` : ""}`,
    ]);
    if (f.block !== undefined)
      rows.push([
        "Block",
        `${f.block}${f.index !== undefined ? ` · position ${f.index}` : ""}`,
      ]);
    if (f.from) rows.push(["From", f.from]);
    if (f.to) rows.push(["To", f.to]);
    rows.push([
      "Value",
      f.value && f.value !== "0" ? `${f.value} wei` : "none",
    ]);
    if (f.gasUsed)
      rows.push([
        "Gas used",
        `${f.gasUsed.toLocaleString("en-US")}${f.gasLimit ? ` of ${f.gasLimit.toLocaleString("en-US")}` : ""}`,
      ]);
    if (f.gasPrice) rows.push(["Gas price", `${f.gasPrice} wei`]);
    if (f.nonce !== undefined)
      rows.push([
        "Nonce",
        `${f.nonce}${f.txType ? ` · type ${f.txType}` : ""}`,
      ]);
    if (f.selector)
      rows.push([
        "Calldata",
        `${f.selector} · ${f.inputBytes?.toLocaleString("en-US") ?? "?"} bytes`,
      ]);
    rows.push([
      "Calls traced",
      f.frames?.length
        ? `${f.frames.filter((x) => x.kind !== "EVENT").length} calls · ${f.logs ?? 0} log${f.logs === 1 ? "" : "s"}`
        : "none",
    ]);
  }
  if (subject.kind === "source") {
    rows.push(["Source", subject.name ?? "pasted"]);
    rows.push([
      "Size",
      `${subject.value.split("\n").length} lines, ${Math.round(subject.value.length / 1024)} KB`,
    ]);
    rows.push(["Read from", "your browser — the chain was not asked"]);
  }
  return rows;
}
