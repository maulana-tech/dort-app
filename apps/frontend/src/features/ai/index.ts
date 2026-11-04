export { saveAiConfig, useAiConfig } from "./hooks/useAiConfig";
export { useHostedAi } from "./hooks/useHostedAi";
export { askStream, testConnection } from "./services/ask";
export type * from "./types";
export {
  aiReady,
  askPrompt,
  bedrockBase,
  type ChatMessage,
  CLAUDE_HERE,
  CLAUDE_MODELS,
  claudeModels,
  configFor,
  DORT_AI,
  modelLabel,
  NO_AI,
  PROVIDERS,
} from "./utils/provider";
