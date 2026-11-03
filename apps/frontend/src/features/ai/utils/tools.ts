/**
 * The two things the model may ask the chain for, and nothing else.
 *
 * Dort reads the evidence before it asks a question, which is the more reliable arrangement: a
 * model cannot forget to call a tool it was never given the chance to skip, and it cannot invent
 * a result that is already on the screen beside its answer. Tools are for the turns *after* the
 * first — "and what about the token it called?", "what else did that address do?" — where the
 * subject is not known until the reader says it.
 *
 * The definitions live here, on the server's side of the line, and the browser only says whether
 * it is able to run them. A page that could post its own schemas could describe any tool it
 * liked to a model the operator pays for, and the model would describe it back.
 *
 * Narrow on purpose. Both are reads, both take one identifier, and neither can be pointed at a
 * host: the chain is chosen by the reader in the page, never named in a tool call.
 */
export const TOOL_NAMES = ["read_transaction", "read_contract"] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

export const isToolName = (n: unknown): n is ToolName =>
  typeof n === "string" && (TOOL_NAMES as readonly string[]).includes(n);

/** OpenAI's shape, which is the one both the hosted gateway and every BYOK provider speak. */
export const TOOLS = [
  {
    type: "function",
    function: {
      name: "read_transaction",
      description:
        "Read a transaction that has already happened: its status, who sent it, what it carried, and the full tree of calls it made, with the events each one emitted. Use it whenever the reader names a transaction hash you have not already been given the trace for.",
      parameters: {
        type: "object",
        properties: {
          hash: {
            type: "string",
            description: "The transaction hash, 0x followed by 64 hex digits.",
          },
        },
        required: ["hash"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_contract",
      description:
        "Read what is deployed at an address: the size of its bytecode, and whether it answers the ERC-20 metadata calls. Use it when the reader names an address, or when a trace calls into one you cannot otherwise account for.",
      parameters: {
        type: "object",
        properties: {
          address: {
            type: "string",
            description: "The contract address, 0x followed by 40 hex digits.",
          },
        },
        required: ["address"],
        additionalProperties: false,
      },
    },
  },
] as const;

/** One call the model asked for, as both API shapes end up describing it. */
export type ToolCall = { id: string; name: string; args: string };

/** How many rounds of tool calls one question may take before Dort stops and answers anyway. */
export const MAX_ROUNDS = 3;
