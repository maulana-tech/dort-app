"use client";

import { isToolName, type ToolCall } from "@/features/ai/utils/tools";
import { chainName } from "@/features/bridge/chains";
import { gatherFacts } from "./facts";
import { detect, type ScanInput, traceSummary } from "./utils/scan";

/**
 * Running what the model asked for, in the browser, against the chain the reader chose.
 *
 * Every call goes through `detect` and `gatherFacts` — the same two the page uses when a reader
 * pastes a hash themselves. So a tool cannot reach anything the reader could not have reached by
 * typing it, and in particular it cannot name a host: the chain comes from the picker, never
 * from the model. A tool that took an RPC URL would be a model-controlled request from the
 * reader's own browser, which is a different product than this one.
 *
 * Failure is reported, not thrown. A model that is told "that address holds no code" can say so;
 * one whose tool call vanished will quietly answer as though it had the answer.
 */
export async function runTool(
  call: ToolCall,
  chainId: number,
): Promise<string> {
  if (!isToolName(call.name)) return `No such tool: ${call.name}.`;

  let arg: string;
  try {
    const parsed = JSON.parse(call.args || "{}") as Record<string, unknown>;
    arg = String(parsed.hash ?? parsed.address ?? "").trim();
  } catch {
    return "Those arguments were not readable JSON.";
  }

  const input: ScanInput | null = detect(arg);
  const want = call.name === "read_transaction" ? "tx" : "address";
  if (!input || input.kind !== want)
    return `"${arg}" is not ${want === "tx" ? "a transaction hash (0x and 64 hex digits)" : "a contract address (0x and 40 hex digits)"}.`;

  try {
    const { facts, traceNote } = await gatherFacts(chainId, input);
    const lines: string[] = [`Chain: ${facts.chain}`];
    if (input.kind === "address") {
      lines.push(
        `Address: ${input.value}`,
        facts.bytecodeBytes
          ? `Deployed bytecode: ${facts.bytecodeBytes} bytes`
          : "Nothing is deployed at this address.",
        facts.token
          ? `ERC-20 metadata: ${facts.token.symbol}, ${facts.token.decimals} decimals`
          : "It does not answer the ERC-20 metadata calls.",
      );
    } else {
      lines.push(
        `Transaction: ${input.value}`,
        `From ${facts.from} to ${facts.to}`,
        `Status: ${facts.status}${facts.block ? `, block ${facts.block}` : ""}`,
        facts.value && facts.value !== "0" ? `Value: ${facts.value} wei` : "",
        traceNote ?? traceSummary(facts.frames ?? []),
        ...(facts.frames ?? [])
          .slice(0, 80)
          .map(
            (f) =>
              `${"  ".repeat(f.d)}${f.kind} ${f.to}.${f.fn}${f.args ? `(${f.args})` : ""}${f.ok ? "" : ` [${f.status}]`}`,
          ),
      );
    }
    if (facts.explorer) lines.push(`Open at: ${facts.explorer}`);
    return lines.filter(Boolean).join("\n");
  } catch (e) {
    return `The chain could not answer that: ${(e as Error).message}. ${chainName(chainId)} may not be the chain this belongs to.`;
  }
}
