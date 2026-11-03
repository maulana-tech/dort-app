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

export const upstreamUrl = (region: string, model: string) =>
  `${host(region)}${
    isAnthropicModel(model)
      ? "/anthropic/v1/messages"
      : "/openai/v1/chat/completions"
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
export const upstreamBody = (
  model: string,
  messages: unknown[],
  system: string,
  maxTokens: number,
) =>
  isAnthropicModel(model)
    ? { model, max_tokens: maxTokens, stream: true, system, messages }
    : {
        model,
        max_tokens: maxTokens,
        stream: true,
        messages: [{ role: "system", content: system }, ...messages],
      };
