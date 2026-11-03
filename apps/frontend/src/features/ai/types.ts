import type { AiQuestion } from "../atlas/types";

/** "none" = the built-in canned answers; everything else is the user's own provider. */
/** "claude" = the user's own Claude Code and its subscription login, through the local bridge (app/api/claude). */
/** "bedrock" = the user's OWN AWS account, with their own Bedrock API key. Dort holds no AWS key: a
 *  hosted Bedrock call would put an auditor's unpublished contract source through our account. */
/** "dort" = this deployment's own Bedrock, paid for by whoever runs it (app/api/bedrock). */
export type AiKind =
  | "none"
  | "dort"
  | "local"
  | "claude"
  | "anthropic"
  | "bedrock"
  | "openai"
  | "openrouter";

/** Kept only in this browser's localStorage (`dort.ai`). */
/** What a reader proved about the wallet they are asking from (features/ai allowance). */
export type WalletClaim = {
  address: string;
  hour: number;
  signature: string;
};

export type AiConfig = {
  kind: AiKind;
  /**
   * `local`: the OpenAI-compatible base, e.g. http://localhost:11434/v1.
   * `bedrock`: the AWS region, e.g. us-east-1 — the host is built from it, never taken whole.
   * Every other provider ignores this and uses its own fixed URL.
   */
  baseUrl: string;
  model: string;
  key: string;
};

/** What the Ask panel sends: the selected piece and what the canned answer already uses, nothing more. */
export type AskContext = {
  contract: string;
  file: string;
  piece: { name: string; system: string; desc: string; caller?: string };
  /** the piece's own source lines, numbered from 1 */
  source: { from: number; lines: string[] };
  connected: { name: string; system: string }[];
  findings: { name: string; risk: string; desc: string }[];
  checklist: string[];
};

export type { AiQuestion };
