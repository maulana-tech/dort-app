/**
 * Which of Bedrock's two APIs a model speaks, and how to address it.
 *
 * Shared on purpose. The server route uses it to spend the operator's key; `chatRequest` uses it
 * for a reader who brought their own Bedrock key, so both reach MiniMax, GLM, Qwen, Kimi and
 * DeepSeek the same way. One copy means the two cannot drift into disagreeing about a host.
 *
 * Nothing here reads a key or an environment variable — it only says where a request goes and
 * what shape it takes, which is why it is safe in the browser bundle.
 */

/**
 * Bedrock serves two different APIs on one host, and which one a model speaks is decided by its
 * id. Anthropic's models answer the Messages API at /anthropic/v1; everything else — MiniMax,
 * GLM, Qwen, Kimi, DeepSeek — answers an OpenAI-compatible API at /openai/v1. Both paths were
 * probed against the live host: each returns its own shape of 401 for a bad key, so both exist
 * and the difference is real rather than assumed.
 *
 * The browser needs no part of this. `textOf` in provider.ts already reads both stream shapes
 * (`delta.text` and `choices[0].delta.content`), so the route can hand either one straight back.
 */
export const isAnthropicModel = (model: string) =>
  model.startsWith("anthropic.");

const host = (region: string) => `https://bedrock-mantle.${region}.api.aws`;

/**
 * The OpenAI-shaped route is `/v1/chat/completions`, with no vendor prefix. `/openai/v1/...`
 * exists on the host and answers in the right shape, which is how it came to be written here —
 * but it 404s every model, including the ones `/v1/chat/completions` serves happily. Probed
 * against the live Sydney host: minimax, zai, qwen, moonshotai and deepseek all answer 200
 * there, and 400 "isn't supported on this route" on the prefixed one.
 */
export const upstreamUrl = (region: string, model: string) =>
  `${host(region)}${
    isAnthropicModel(model) ? "/anthropic/v1/messages" : "/v1/chat/completions"
  }`;

/**
 * The key rides in a different header per API, and the host refuses a request carrying both:
 * "request must not include both 'authorization' and 'x-api-key' headers".
 */
export const upstreamHeaders = (
  key: string,
  model: string,
): Record<string, string> =>
  isAnthropicModel(model)
    ? {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      }
    : {
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
      };

/** The system prompt is a field of its own on one API and the first message on the other. */
/**
 * `tools` are the server's own definitions, never the caller's: the browser asks for them by
 * saying it can run them, and the schemas come from features/ai/utils/tools. A page allowed to
 * post its own would be describing any tool it liked to a model the operator pays for.
 *
 * `stream: false` is for the tool rounds, which are short and have to be read whole before the
 * next one can be built. Only the final answer streams.
 */
export const upstreamBody = (
  model: string,
  messages: unknown[],
  system: string,
  maxTokens: number,
  opts: { stream?: boolean; tools?: readonly unknown[] } = {},
) => {
  const stream = opts.stream !== false;
  const tools = opts.tools?.length ? { tools: opts.tools } : {};
  return isAnthropicModel(model)
    ? { model, max_tokens: maxTokens, stream, system, messages, ...tools }
    : {
        model,
        max_tokens: maxTokens,
        stream,
        // without this the OpenAI-shaped stream never reports what the reply cost; probed
        // against the live host, which accepts the field and sends usage in the last frame
        ...(stream ? { stream_options: { include_usage: true } } : {}),
        messages: [{ role: "system", content: system }, ...messages],
        ...tools,
      };
};
