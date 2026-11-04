"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Dropdown, Input, PH, PhIcon } from "@/components/ui";
import {
  type AiConfig,
  type AiKind,
  aiReady,
  askStream,
  bedrockBase,
  CLAUDE_HERE,
  claudeModels,
  configFor,
  modelLabel,
  NO_AI,
  PROVIDERS,
  saveAiConfig,
  useAiConfig,
  useHostedAi,
} from "@/features/ai";
import "./ai-settings.css";

type Mode = "none" | "dort" | "claude" | "local" | "key";
const modeOf = (k: AiKind): Mode =>
  k === "none" || k === "dort" || k === "claude" || k === "local" ? k : "key";
const KEYED: AiKind[] = ["anthropic", "bedrock", "openai", "openrouter"];

const NOTE: Record<Mode, string> = {
  none: "Answers come from Dort's built-in text, composed from the run's own figures. No model, no request, nothing leaves your machine — and nothing that needs the code read.",
  dort: "This Dort's own Amazon Bedrock, paid for by whoever runs it. Your question, and any code you send with it, go through that AWS account and appear in its logs if model invocation logging is on there. Fine for a look around; if you are reviewing a contract that has not been published, bring your own key instead — every other provider here is yours alone.",
  claude:
    "Ask runs your own Claude Code on this laptop, signed in with your own Claude plan, like Orca runs the agents you already pay for. Dort never sees or stores your login. Answers use your plan's limits. Works while Dort runs locally (pnpm dev).",
  local:
    "Ask sends the selected piece (its source lines, connected pieces and findings) and your question to the endpoint above, from your browser. Nothing goes to a Dort server.",
  key: "Ask sends the selected piece (its source lines, connected pieces and findings) and your question straight from your browser to the provider you picked. Your key is stored only in this browser's localStorage, is sent only to that provider and is never logged or sent to Dort.",
};

/**
 * A provider that needs more said than its mode does. Bedrock is the user's own AWS account —
 * Dort holds no AWS key and makes no call on anyone's behalf — but an AWS credential is wider
 * than an `sk-…`, so the note says what to scope it to and where the prompts can end up.
 */
const KIND_NOTE: Partial<Record<AiKind, string>> = {
  bedrock:
    "Your own AWS account, and any model it can invoke — not only Anthropic's. minimax.minimax-m2.5, zai.glm-4.7-flash, qwen.qwen3-coder-next, moonshotai.kimi-k2.5 and deepseek.deepseek-v3.2 all work; the id decides which of Bedrock's two APIs answers. Your question goes straight from your browser to Bedrock in the region above, and Dort never holds an AWS key. Bedrock does not store prompts or train on them by default — but model invocation logging, if you have it on, writes them in full to your CloudWatch or S3, and a cross-region inference profile can carry them out of this region. The key is stored in this browser's localStorage, so give it an IAM role that can do nothing but invoke the models you need, and prefer a short-term key.",
};

/** One line in the connection log: a clock, a dot and what happened. */
type Line = {
  id: number;
  at: string;
  tone: "ok" | "bad" | "dim";
  text: string;
};
type Phase = "idle" | "busy" | "ok" | "bad";

/**
 * The connection test asks a real question instead of "reply with ok".
 *
 * A key that works and a model that cannot read Solidity are different problems, and the second
 * is the one that wastes an afternoon — it passes the old test and then answers uselessly all
 * day. This function writes its balance *after* the external call, so an answer that names
 * reentrancy, or just the order of those two lines, has proved the whole path at once: the
 * endpoint, the key, the model id, and the kind of reading Dort is going to ask it for.
 */
const TEST_PROMPT = `A connection test from Dort, a smart-contract review tool. In one sentence, under 25 words: what is wrong with this function?

function withdraw(uint256 a) external {
  (bool ok,) = msg.sender.call{value: a}("");
  require(ok);
  balance[msg.sender] -= a;
}`;

/** Enough for a sentence. The ceiling matters most on Dort's own model, where it is not your bill. */
const TEST_TOKENS = 120;

/**
 * The host the browser will actually open a connection to.
 *
 * Shown because it is the only answer to "where does my code go" that cannot be spun. The three
 * that are not a plain URL are the three worth being explicit about: "none" reaches nothing,
 * "dort" goes through the operator's server before it reaches a model, and "claude" never leaves
 * the loopback interface. For Bedrock the host is rebuilt from the region by the same hardened
 * function the request uses, so what is printed here is what will be dialled.
 */
function destination(c: AiConfig): string {
  if (c.kind === "none") return "nothing — answered on this machine";
  if (c.kind === "dort") return "this Dort's server → Amazon Bedrock";
  if (c.kind === "claude") return "127.0.0.1 → your own Claude Code";
  const raw =
    c.kind === "bedrock"
      ? bedrockBase(c.baseUrl)
      : c.baseUrl || PROVIDERS[c.kind].baseUrl;
  try {
    return new URL(raw).host;
  } catch {
    return raw || "—";
  }
}

const OPEN = "dort-ai-settings";
/** Opens the AI provider dialog from anywhere (the trace's Ask AI panel). */
export const openAiSettings = () => dispatchEvent(new Event(OPEN));

/** signing Claude Code in or out: confirm = asked to sign out, waiting = finishing on claude.ai */
type Auth = {
  step: "idle" | "confirm" | "busy" | "waiting";
  url?: string | null;
  error?: string;
};
/** what app/api/claude says about the Claude Code on this machine */
type ClaudeStatus = {
  available: boolean;
  loggedIn: boolean;
  version?: string;
  authMethod?: string | null;
  plan?: string | null;
  error?: string;
} | null;

/**
 * "AI provider": a console, not a form.
 *
 * It used to be a segmented control over a four-row form, which fitted the header capsule it was
 * born in and told you nothing until you pressed Save and asked a real question somewhere else.
 * The two columns here are the two questions actually being answered — *which* AI, and *what it
 * means* — and the right-hand side proves its own answer: the test streams a real reply out of
 * the real provider, logs the round trip, and says which host the browser opened. A provider you
 * have watched read a reentrancy bug is connected in a way that "Connected ✓" never established.
 */
export function AiSettings({ asPage = false }: { asPage?: boolean } = {}) {
  const { ready: hostedAi, models: hostedModels } = useHostedAi();
  const saved = useAiConfig();
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState<AiConfig>(NO_AI);
  const [lines, setLines] = useState<Line[]>([]);
  const [reply, setReply] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [claude, setClaude] = useState<ClaudeStatus>(null);
  const [tick, setTick] = useState(0);
  const [auth, setAuth] = useState<Auth>({ step: "idle" });
  const run = useRef<AbortController | null>(null);
  const mode = modeOf(draft.kind);

  // ask the local bridge whether Claude Code is here and signed in, each time "Your Claude" is
  // shown and after signing in or out
  useEffect(() => {
    if (mode !== "claude") return;
    let live = true;
    if (!tick) setClaude(null);
    fetch(PROVIDERS.claude.baseUrl, { cache: "no-store" })
      .then((r) => r.json())
      .then((s: ClaudeStatus) => live && setClaude(s))
      .catch(
        () =>
          live &&
          setClaude({
            available: false,
            loggedIn: false,
            error:
              "The bridge didn't answer. Run Dort locally (pnpm dev) and open it at localhost.",
          }),
      );
    return () => {
      live = false;
    };
  }, [mode, tick]);
  // while you finish signing in on claude.ai, look again every two seconds
  useEffect(() => {
    if (auth.step !== "waiting") return;
    if (claude?.loggedIn) return setAuth({ step: "idle" });
    const id = setInterval(() => setTick((t) => t + 1), 2000);
    return () => clearInterval(id);
  }, [auth.step, claude?.loggedIn]);
  // a test still streaming when the dialog closes or the page leaves is a request nobody will
  // read, billed to somebody
  useEffect(() => () => run.current?.abort(), []);

  /** Claude Code's own sign-in / sign-out, run on this laptop by app/api/claude/auth */
  const authOp = async (op: "login" | "logout") => {
    setAuth({ step: "busy" });
    try {
      const r = await fetch(`${PROVIDERS.claude.baseUrl}/auth`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ op }),
      });
      const j = (await r.json()) as { error?: string; url?: string | null };
      if (!r.ok) return setAuth({ step: "idle", error: j.error });
      clear();
      setAuth(
        op === "login" ? { step: "waiting", url: j.url } : { step: "idle" },
      );
      setTick((t) => t + 1);
    } catch (e) {
      setAuth({ step: "idle", error: (e as Error).message });
    }
  };

  /** Anything that changes what would be dialled invalidates what the last test proved. */
  const clear = () => {
    run.current?.abort();
    run.current = null;
    setLines([]);
    setReply("");
    setPhase("idle");
  };
  const edit = (patch: Partial<AiConfig>) => {
    setDraft({ ...draft, ...patch });
    clear();
  };
  const pick = (kind: AiKind) => {
    setDraft(kind === saved.kind ? saved : configFor(kind));
    clear();
  };
  /** "Own API key" returns to the provider you had, not always to the first one in the list. */
  const pickMode = (m: Mode) =>
    pick(
      m === "key" ? (KEYED.includes(saved.kind) ? saved.kind : "anthropic") : m,
    );

  const open = () => {
    setDraft(saved);
    clear();
    dialog.current?.showModal();
  };
  const save = () => {
    saveAiConfig(draft.kind === "none" ? NO_AI : draft);
    dialog.current?.close();
  };
  const forget = () => {
    edit({ key: "" });
    saveAiConfig(saved.kind === "local" ? { ...saved, key: "" } : NO_AI);
  };

  const say = (tone: Line["tone"], text: string) =>
    setLines((ls) => [
      ...ls,
      {
        id: ls.length,
        at: new Date().toLocaleTimeString([], { hour12: false }),
        tone,
        text,
      },
    ]);

  /** The test: a real question, streamed, timed, and logged as it happens. */
  const test = async () => {
    const ctrl = new AbortController();
    run.current?.abort();
    run.current = ctrl;
    setLines([]);
    setReply("");
    setPhase("busy");
    const started = performance.now();
    const ms = () => Math.round(performance.now() - started);
    say("dim", `opening ${destination(draft)}`);
    let first = true;
    let chars = 0;
    try {
      for await (const piece of askStream(draft, TEST_PROMPT, ctrl.signal, {
        maxTokens: TEST_TOKENS,
      })) {
        if (ctrl.signal.aborted) return;
        if (first) {
          first = false;
          say("ok", `answering after ${ms()}ms`);
        }
        chars += piece.length;
        setReply((r) => r + piece);
      }
      if (ctrl.signal.aborted) return;
      say(
        chars > 0 ? "ok" : "bad",
        chars > 0
          ? `done · ${chars} characters in ${ms()}ms · ${modelLabel(draft) || PROVIDERS[draft.kind].label}`
          : "the provider answered, but with nothing in it",
      );
      setPhase(chars > 0 ? "ok" : "bad");
    } catch (e) {
      if (ctrl.signal.aborted) return;
      say("bad", (e as Error).message);
      setPhase("bad");
    }
  };

  useEffect(() => {
    addEventListener(OPEN, open);
    return () => removeEventListener(OPEN, open);
  });

  const ready = aiReady(draft);
  const connected = saved.kind !== "none";
  const choices: { mode: Mode; label: string; sub: string }[] = [
    { mode: "none", label: "None", sub: "built-in text" },
    // only offered where the deployment actually has a key (app/api/bedrock)
    ...(hostedAi
      ? [
          {
            mode: "dort" as const,
            label: "Dort's model",
            sub: "operator's AWS",
          },
        ]
      : []),
    // only a local Dort can run your Claude Code (CLAUDE_HERE)
    ...(CLAUDE_HERE
      ? [
          {
            mode: "claude" as const,
            label: "Your Claude",
            sub: "your plan, this laptop",
          },
        ]
      : []),
    { mode: "local", label: "Local model", sub: "your own endpoint" },
    { mode: "key", label: "Own API key", sub: "straight to the provider" },
  ];

  // one body, two frames: the dialog in the header family, and the settings page. Writing it
  // twice would be two places for a provider to be added to, and one of them would be missed.
  const body = (
    <form
      method="dialog"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="flex flex-col gap-3 p-4"
    >
      {!asPage && (
        <header className="flex items-center gap-2 text-[14px]">
          <span className="size-1.5 rounded-full bg-fg" />
          <span className="font-medium">AI provider</span>
          <span className="ml-auto text-[12.5px] text-dim">
            {hostedAi ? "This Dort offers one" : "Dort hosts no AI"}
          </span>
        </header>
      )}

      <div className="grid gap-3 sm:grid-cols-[172px_minmax(0,1fr)]">
        {/* which AI. The dot is the saved one, so the list says what is in use even while you
            look at something else; white is the one you are looking at (DESIGN.md: white =
            active). */}
        {/* real radios, not buttons with role="radio": the arrow keys then move between
            providers the way a keyboard user expects, which a list of buttons does not do. */}
        <fieldset className="m-0 flex min-w-0 flex-col gap-1 border-0 p-0">
          <legend className="sr-only">Where answers come from</legend>
          {choices.map((c) => {
            const here = mode === c.mode;
            const inUse = modeOf(saved.kind) === c.mode && connected;
            return (
              <label
                key={c.mode}
                className={`flex cursor-pointer items-center gap-2 rounded-tile border px-2.5 py-2 text-left transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-white/25 ${
                  here
                    ? "border-border bg-inset text-fg"
                    : "border-transparent text-muted hover:bg-inset/60 hover:text-body"
                }`}
              >
                <input
                  type="radio"
                  name="dort-ai-mode"
                  value={c.mode}
                  checked={here}
                  onChange={() => pickMode(c.mode)}
                  className="sr-only"
                />
                <span
                  className={`size-1.5 flex-none rounded-full ${inUse ? "bg-green" : here ? "bg-fg" : "bg-dim"}`}
                />
                <span className="min-w-0">
                  <span className="block truncate text-[13px]">{c.label}</span>
                  <span className="block truncate text-[11.5px] text-dim">
                    {c.sub}
                  </span>
                </span>
              </label>
            );
          })}
        </fieldset>

        {/* what it means: the fields it needs, the test, and where the request goes */}
        <div className="flex min-w-0 flex-col gap-2.5 rounded-inner border border-border bg-inner-grad p-3">
          <div className="flex items-center gap-2">
            <span className="truncate text-[13px] text-fg">
              {mode === "none" ? "No model" : PROVIDERS[draft.kind].label}
            </span>
            {live(saved, draft) && (
              <span className="ml-auto text-[11.5px] text-dim">in use</span>
            )}
          </div>

          {mode === "key" && (
            <Row label="Provider">
              <Dropdown
                ariaLabel="Provider"
                value={draft.kind}
                onChange={(k) => pick(k as AiKind)}
                className="w-full"
                options={KEYED.map((k) => ({
                  value: k,
                  label: PROVIDERS[k].label,
                }))}
              />
            </Row>
          )}
          {(mode === "local" || draft.kind === "bedrock") && (
            <Row label={draft.kind === "bedrock" ? "Region" : "Endpoint"}>
              <Input
                aria-label={
                  draft.kind === "bedrock" ? "AWS region" : "Endpoint"
                }
                value={draft.baseUrl}
                onChange={(e) => edit({ baseUrl: e.target.value })}
                placeholder={PROVIDERS[draft.kind].baseUrl}
                spellCheck={false}
                className="w-full font-mono text-[12px]"
              />
            </Row>
          )}
          {mode === "claude" && (
            <ClaudeLine
              s={claude}
              auth={auth}
              onAuth={setAuth}
              onSignIn={() => authOp("login")}
              onSignOut={() => authOp("logout")}
            />
          )}
          {mode !== "none" && (
            <Row label="Model">
              {mode === "dort" ? (
                // a list, never a free field: the route honours only what the operator offers,
                // so typing a model here would just be silently ignored
                <Dropdown
                  ariaLabel="Model"
                  value={draft.model || hostedModels[0] || ""}
                  onChange={(m) => edit({ model: m })}
                  className="w-full"
                  mono
                  options={hostedModels.map((m, i) => ({
                    value: m,
                    label: i === 0 ? `${m} · default` : m,
                    text: m,
                  }))}
                />
              ) : mode === "claude" ? (
                <Dropdown
                  ariaLabel="Model"
                  value={draft.model || "default"}
                  onChange={(m) => edit({ model: m === "default" ? "" : m })}
                  className="w-full"
                  options={claudeModels(draft.model).map((m) => ({
                    value: m.value || "default",
                    label: `${m.label} · ${m.hint}`,
                    text: m.label,
                  }))}
                />
              ) : (
                <Input
                  aria-label="Model"
                  value={draft.model}
                  onChange={(e) => edit({ model: e.target.value })}
                  placeholder={PROVIDERS[draft.kind].model}
                  spellCheck={false}
                  className="w-full font-mono text-[12px]"
                />
              )}
            </Row>
          )}
          {mode !== "claude" && mode !== "dort" && mode !== "none" && (
            <Row label={mode === "local" ? "Key (optional)" : "API key"}>
              <Input
                type="password"
                aria-label="API key"
                value={draft.key}
                onChange={(e) => edit({ key: e.target.value })}
                placeholder={PROVIDERS[draft.kind].keyHint ?? "not needed"}
                autoComplete="off"
                spellCheck={false}
                className="w-full font-mono text-[12px]"
              />
            </Row>
          )}

          {mode !== "none" && (
            <div className="flex items-center gap-1.5 pt-0.5">
              <Button
                size="sm"
                disabled={
                  !ready ||
                  phase === "busy" ||
                  (mode === "claude" && !claude?.loggedIn)
                }
                onClick={test}
              >
                {phase === "busy" ? "Asking…" : "Test connection"}
              </Button>
              {phase === "busy" && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    run.current?.abort();
                    setPhase("idle");
                    say("dim", "stopped");
                  }}
                >
                  Stop
                </Button>
              )}
              {(draft.key || saved.key) && phase !== "busy" && (
                <Button size="sm" variant="ghost" onClick={forget}>
                  Forget key
                </Button>
              )}
            </div>
          )}

          {/* the round trip as it happens, and the answer it came back with. A reentrancy bug
              read correctly is the proof; the timings are how you tell a slow provider from a
              broken one. */}
          {lines.length > 0 && (
            <div className="rounded-tile border border-border bg-inset p-2.5">
              <div className="mb-1.5 text-[11px] text-dim uppercase tracking-wide">
                Connection log
              </div>
              <ol className="flex flex-col gap-1">
                {lines.map((l) => (
                  <li
                    key={l.id}
                    className="flex items-start gap-2 font-mono text-[11.5px] text-body"
                  >
                    <span
                      className={`mt-[5px] size-1.5 flex-none rounded-full ${l.tone === "ok" ? "bg-green" : l.tone === "bad" ? "bg-red" : "bg-dim"}`}
                    />
                    <span className="flex-none text-dim">{l.at}</span>
                    <span className="min-w-0 break-words">{l.text}</span>
                  </li>
                ))}
              </ol>
              {(reply || phase === "busy") && (
                <output className="mt-2 block border-t border-border pt-2 text-[12.5px] text-body leading-normal">
                  <span className="text-dim">
                    asked what is wrong with a function that pays out before it
                    writes down the payment —{" "}
                  </span>
                  {reply}
                  {phase === "busy" && (
                    <span
                      aria-hidden="true"
                      className="ml-px inline-block h-[13px] w-[2px] translate-y-[2px] animate-pulse bg-fg"
                    />
                  )}
                </output>
              )}
            </div>
          )}

          {/* where the request goes. One line, drawn as the wire it is. */}
          <div className="rounded-tile border border-border bg-inset p-2.5">
            <div className="mb-1.5 text-[11px] text-dim uppercase tracking-wide">
              Where it goes
            </div>
            <p className="flex min-w-0 items-center gap-1.5 font-mono text-[11.5px]">
              <span className="flex-none text-dim">you</span>
              <PhIcon d={PH.caretRight} className="size-3 flex-none text-dim" />
              <span className="flex-none text-dim">browser</span>
              <PhIcon d={PH.caretRight} className="size-3 flex-none text-dim" />
              <span className="min-w-0 truncate text-fg">
                {destination(draft)}
              </span>
            </p>
          </div>
        </div>
      </div>

      <p className="text-[12.5px] text-muted leading-normal">
        {KIND_NOTE[draft.kind] ?? NOTE[mode]}
      </p>
      <div className="flex justify-end gap-1.5">
        {/* stop using the connected AI in Dort; for Your Claude it does not sign Claude Code out */}
        {connected && (
          <Button
            variant="ghost"
            className="mr-auto"
            title={
              saved.kind === "claude"
                ? "Stop using your Claude in Dort (Claude Code stays signed in)"
                : "Stop using this AI in Dort and forget its key"
            }
            onClick={() => {
              saveAiConfig(NO_AI);
              setDraft(NO_AI);
              clear();
              dialog.current?.close();
            }}
          >
            <span className="size-1.5 rounded-full bg-red" />
            Disconnect
          </Button>
        )}
        {!asPage && (
          <Button variant="ghost" onClick={() => dialog.current?.close()}>
            Cancel
          </Button>
        )}
        <Button
          type="submit"
          variant="primary"
          disabled={draft.kind !== "none" && !ready}
        >
          Save
        </Button>
      </div>
    </form>
  );

  if (asPage) return body;

  return (
    <>
      {/* the header's capsule family (header.css): lit ring until an AI is connected, then a
          plain capsule with a glowing green dot, provider and model; B3 pin/14073817581281652
          model-selector content (icon + name + caret) */}
      <button
        type="button"
        onClick={open}
        aria-haspopup="dialog"
        title={
          connected ? "Change your AI provider" : "Connect your own AI to Ask"
        }
        className={`group hdr-pill on-blue ${connected ? "" : "lit"}`}
      >
        {connected ? (
          <>
            <span className="hdr-dot text-green" aria-hidden="true" />
            {PROVIDERS[saved.kind].label}
            {modelLabel(saved) && (
              <span className="max-w-[140px] truncate font-mono text-[11.5px] text-dim">
                {modelLabel(saved)}
              </span>
            )}
          </>
        ) : (
          <>
            <PhIcon
              d={PH.sparkle}
              className="size-[15px] transition-transform duration-500 group-hover:rotate-[20deg] group-hover:scale-110 motion-reduce:transition-none"
            />
            Connect AI
          </>
        )}
        <PhIcon d={PH.caretDown} className="size-3 text-dim" />
      </button>
      <dialog
        ref={dialog}
        aria-label="AI provider"
        onClick={(e) => e.target === dialog.current && dialog.current?.close()}
        onKeyDown={(e) => e.key === "Escape" && e.stopPropagation()}
        className="ai-dialog m-auto w-[min(660px,calc(100vw-32px))] rounded-card border border-border bg-card-grad p-0 text-fg shadow-float"
      >
        {body}
      </dialog>
    </>
  );
}

/** Whether the provider on screen is the one Ask is actually using. */
const live = (saved: AiConfig, draft: AiConfig) =>
  saved.kind !== "none" &&
  saved.kind === draft.kind &&
  saved.model === draft.model &&
  saved.baseUrl === draft.baseUrl;

/**
 * Claude Code on this machine: found and signed in (with which plan), or what to do, plus its own
 * sign-in and sign-out. Signing out is Claude Code's, for the whole laptop, so it asks first.
 */
function ClaudeLine({
  s,
  auth,
  onAuth,
  onSignIn,
  onSignOut,
}: {
  s: ClaudeStatus;
  auth: Auth;
  onAuth: (a: Auth) => void;
  onSignIn: () => void;
  onSignOut: () => void;
}) {
  const ok = !!s?.available && s.loggedIn;
  const text = !s
    ? "Looking for Claude Code on this laptop…"
    : ok
      ? `Claude Code ${s.version?.split(" ")[0] ?? ""} · signed in${s.authMethod === "claude.ai" ? ` with your Claude${s.plan ? ` ${s.plan}` : ""} plan` : ""}`
      : s.available
        ? "Claude Code is here but not signed in."
        : (s.error ?? "Claude Code is not installed.");
  const busy = auth.step === "busy";
  return (
    <div className="flex flex-col gap-2">
      <p className="flex items-start gap-2 text-[12.5px] text-body leading-normal">
        <span
          className={`mt-1.5 size-1.5 flex-none rounded-full ${!s || auth.step === "waiting" ? "bg-dim" : ok ? "bg-green" : "bg-red"}`}
        />
        <span>
          {text}
          {s && !s.available && (
            <>
              {" "}
              Install it from{" "}
              <a
                href="https://docs.claude.com/en/docs/claude-code/setup"
                target="_blank"
                rel="noreferrer"
                className="underline decoration-white/30 underline-offset-2 hover:decoration-white"
              >
                the Claude Code docs
              </a>
              , then reopen this.
            </>
          )}
        </span>
      </p>

      {auth.step === "confirm" ? (
        <div className="rounded-tile border border-border bg-inset p-2.5 text-[12.5px] text-body leading-normal">
          Sign Claude Code out on this laptop? This is Claude Code's own
          sign-out: every terminal and app that uses Claude Code here (Orca
          included) is signed out too, not only Dort.
          <div className="mt-2 flex gap-1.5">
            <Button size="sm" onClick={onSignOut}>
              <span className="size-1.5 rounded-full bg-red" />
              Sign out of Claude
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onAuth({ step: "idle" })}
            >
              Keep signed in
            </Button>
          </div>
        </div>
      ) : auth.step === "waiting" ? (
        <p className="text-[12.5px] text-muted leading-normal">
          Finish signing in on the claude.ai page that opened in your browser;
          this updates by itself.
          {auth.url && (
            <>
              {" "}
              No page?{" "}
              <a
                href={auth.url}
                target="_blank"
                rel="noreferrer"
                className="text-fg underline decoration-white/30 underline-offset-2 hover:decoration-white"
              >
                Open the sign-in page
              </a>
              .
            </>
          )}
        </p>
      ) : (
        s?.available && (
          <div className="flex items-center gap-1.5">
            {ok ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => onAuth({ step: "confirm" })}
                title="Claude Code's own sign-out, for this whole laptop"
              >
                Sign out of Claude
              </Button>
            ) : (
              <Button size="sm" disabled={busy} onClick={onSignIn}>
                {busy ? "Opening…" : "Sign in with Claude"}
              </Button>
            )}
          </div>
        )
      )}
      {auth.error && (
        <p className="flex items-start gap-2 text-[12.5px] text-body">
          <span className="mt-1.5 size-1.5 flex-none rounded-full bg-red" />
          {auth.error}
        </p>
      )}
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[88px_1fr] items-center gap-2 text-[13px] text-muted">
      <span>{label}</span>
      {children}
    </div>
  );
}
