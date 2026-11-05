"use client";

import type { ReactNode } from "react";

/**
 * The shared anatomy behind Bridge, Deposit, Swap and Withdraw: pill tabs to choose the source, a
 * big amount field with the token on its right and a MAX chip, an arrow down into the destination,
 * then one wide button whose label says what will happen.
 *
 * The shape follows the reference design the owner gave; the tones are Dort's own
 * (apps/frontend/DESIGN.md): blue cards, white only for the one primary action, colour only as
 * semantic dots. Every piece here is presentational — the rules live in each feature's utils, so
 * they stay testable without a DOM.
 */

/** Row of pill tabs. One choice, always visible, no container. */
export function PillTabs<T extends string>({
  value,
  options,
  onChange,
  label,
  disabled = false,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="flex flex-wrap items-center gap-1.5"
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={on}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className={`inline-flex h-9 items-center gap-2 rounded-chip px-4 text-ui-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-white/25 disabled:pointer-events-none disabled:opacity-40 ${
              on
                ? "bg-primary text-primary-fg"
                : "bg-raised text-muted hover:bg-hover hover:text-fg"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** The token on the right of the amount field: mark + symbol in one pill. */
export function TokenPill({
  symbol,
  icon,
}: {
  symbol: string;
  icon?: ReactNode;
}) {
  return (
    <span className="inline-flex shrink-0 items-center gap-2 rounded-chip border border-border bg-raised py-1.5 pr-3 pl-1.5 text-ui-sm text-text">
      {icon ?? <span className="size-5 rounded-full bg-hover" />}
      {symbol}
    </span>
  );
}

/**
 * The amount field. `tooMuch` turns its edge red — the one place colour means something here.
 * `secondary` is the same amount read another way (the other chain's side, a quote, a rate).
 */
export function AmountField({
  id,
  label,
  value,
  onChange,
  token,
  secondary,
  available,
  onMax,
  tooMuch = false,
  disabled = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  token: ReactNode;
  secondary?: ReactNode;
  available?: ReactNode;
  onMax?: () => void;
  tooMuch?: boolean;
  disabled?: boolean;
}) {
  return (
    <div
      className={`rounded-inner border bg-inner-grad p-4 transition-colors ${
        tooMuch ? "border-red/50" : "border-border"
      }`}
    >
      <label htmlFor={id} className="text-ui-sm text-muted">
        {label}
      </label>
      <div className="mt-1 flex items-center gap-3">
        <input
          id={id}
          value={value}
          inputMode="decimal"
          autoComplete="off"
          placeholder="0"
          disabled={disabled}
          onChange={(e) => onChange(e.target.value.replace(",", "."))}
          className="min-w-0 flex-1 bg-transparent font-sans text-[34px] text-fg leading-[1.12] tracking-[-0.02em] tabular-nums outline-none placeholder:text-dim/60 disabled:opacity-50"
        />
        {token}
      </div>
      <div className="mt-2 flex items-center justify-between gap-3 text-ui-xs text-dim">
        <span className="tabular-nums">{secondary ?? " "}</span>
        {available != null && (
          <span className="flex items-center gap-2">
            <span className="tabular-nums">{available}</span>
            {onMax && (
              <button
                type="button"
                disabled={disabled}
                onClick={onMax}
                className="rounded-chip bg-raised px-1.5 py-0.5 font-mono text-[10px] text-port uppercase tracking-wider transition-colors hover:bg-hover hover:text-fg disabled:opacity-40"
              >
                max
              </button>
            )}
          </span>
        )}
      </div>
    </div>
  );
}

/** The arrow between the two boxes; it overlaps both so the pair reads as one flow. */
export function FlowArrow() {
  return (
    <div className="-my-2.5 flex justify-center" aria-hidden="true">
      <span className="relative z-10 grid size-8 place-items-center rounded-full border border-border bg-raised text-muted">
        <svg viewBox="0 0 16 16" className="size-4" fill="none">
          <title>to</title>
          <path
            d="M8 3v10m0 0 4-4m-4 4-4-4"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </div>
  );
}

/** Where the value lands: a chain, an address, a pocket. */
export function DestinationRow({
  label,
  value,
}: {
  label: ReactNode;
  value: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-inner border border-border p-4 text-ui-sm">
      <span className="text-muted">{label}</span>
      <span className="text-fg">{value}</span>
    </div>
  );
}

/** The one primary action. Its label is the state: never a bare "Confirm". */
export function ActionButton({
  children,
  disabled = false,
  onClick,
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="h-12 w-full rounded-chip bg-primary text-[15px] text-primary-fg outline-none transition-colors hover:bg-brand-lit focus-visible:ring-2 focus-visible:ring-white/25 disabled:pointer-events-none disabled:bg-raised disabled:text-dim"
    >
      {children}
    </button>
  );
}

/** A balance or quote line: what you hold here, what it is worth there. */
export function SourceRow({
  icon,
  title,
  ticker,
  amount,
  secondary,
}: {
  icon: ReactNode;
  title: ReactNode;
  ticker: ReactNode;
  amount: ReactNode;
  secondary?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        {icon}
        <div>
          <p className="text-ui-md text-fg">{title}</p>
          <p className="font-mono text-ui-xs text-dim">{ticker}</p>
        </div>
      </div>
      <div className="text-right">
        <p className="text-ui-md text-fg tabular-nums">{amount}</p>
        {secondary && (
          <p className="text-ui-xs text-dim tabular-nums">{secondary}</p>
        )}
      </div>
    </div>
  );
}

/** A short note under the action: a lock, a warning, a hint. Tone colours only the dot. */
export function Note({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "ok" | "bad" | "warn";
  children: ReactNode;
}) {
  const dot = {
    neutral: "bg-port",
    ok: "bg-green",
    bad: "bg-red",
    warn: "bg-yellow",
  }[tone];
  return (
    <p className="flex items-start gap-2 text-ui-xs text-body">
      <span className={`mt-1.5 size-1.5 flex-none rounded-full ${dot}`} />
      {children}
    </p>
  );
}

/**
 * What a reader has to do before this card can do anything, shown only while no wallet is
 * connected.
 *
 * The button alone says "Connect wallet", which is honest and useless: it does not say what to
 * connect with, which chain the card is on, or — on a chain with no faucet — where the money is
 * meant to come from. Somebody who has never seen this page reads a disabled-looking form and a
 * balance of zero and concludes the thing is broken.
 *
 * It disappears the moment a wallet is connected, because by then it is noise.
 */
export function Primer({
  title,
  steps,
}: {
  title: string;
  steps: ReactNode[];
}) {
  return (
    <div className="grid gap-2 rounded-tile bg-inset p-3">
      <p className="text-ui-xs text-muted">{title}</p>
      <ol className="grid gap-1.5">
        {steps.map((s, i) => (
          <li
            // the steps are fixed copy in source order, so the index is their identity
            // biome-ignore lint/suspicious/noArrayIndexKey: static list, never reordered
            key={i}
            className="flex items-start gap-2 text-ui-xs text-body leading-normal"
          >
            <span className="mt-px flex-none font-mono text-dim">{i + 1}</span>
            {/* one span: a bare <code> beside the text would become its own flex column */}
            <span>{s}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
