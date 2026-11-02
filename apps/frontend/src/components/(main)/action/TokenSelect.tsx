"use client";

import { Dropdown, type DropdownOption, TokenIcon } from "@/components/ui";

/**
 * The token picker that sits inside an amount field.
 *
 * It is a real dropdown, not a tile that cycles on click: the options are listed, each with its
 * mark and its balance, and the list is keyboard-reachable because it is built on the app's own
 * Dropdown primitive. A picker you have to click repeatedly to discover is a guessing game.
 */
export type TokenChoice = {
  /** what the chain calls it: the key the caller switches on */
  id: string;
  symbol: string;
  /** right-hand hint in the list, normally the balance */
  hint?: string;
  disabled?: boolean;
};

export function TokenSelect({
  value,
  tokens,
  onChange,
  ariaLabel = "Token",
  disabled = false,
}: {
  value: string;
  tokens: TokenChoice[];
  onChange: (id: string) => void;
  ariaLabel?: string;
  disabled?: boolean;
}) {
  const options: DropdownOption<string>[] = tokens.map((t) => ({
    value: t.id,
    label: t.symbol,
    text: t.symbol,
    icon: <TokenIcon symbol={t.symbol} size={20} />,
    hint: t.hint,
    disabled: t.disabled,
  }));

  // one token is not a choice: show it as the plain pill rather than a dropdown that cannot move
  if (tokens.length < 2) {
    const only = tokens[0];
    return (
      <span className="inline-flex shrink-0 items-center gap-2 rounded-chip border border-border bg-raised py-1.5 pr-3 pl-1.5 text-ui-sm text-text">
        <TokenIcon symbol={only?.symbol ?? ""} size={20} />
        {only?.symbol ?? "—"}
      </span>
    );
  }

  return (
    <Dropdown
      value={value}
      options={options}
      onChange={onChange}
      ariaLabel={ariaLabel}
      variant="token"
      className={`shrink-0 ${disabled ? "pointer-events-none opacity-50" : ""}`}
    />
  );
}
