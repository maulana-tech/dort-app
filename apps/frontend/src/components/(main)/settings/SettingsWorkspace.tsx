"use client";

import { Chip, Panel } from "@/components/ui";
import { useHostedAi } from "@/features/ai";
import { AiSettings } from "../shell/AiSettings";
import { AgentConnect } from "./AgentConnect";

/**
 * AI settings, as a page of its own.
 *
 * It used to live only behind a capsule in the header, which was fine while the header had room
 * for it. The header now carries the wallet — the thing three of the six pages need — so the
 * settings moved here, where there is space to say what each provider costs you in privacy
 * rather than hiding that behind a tooltip. The same form answers in both places: one body,
 * reused, so a provider added to one cannot be missing from the other.
 *
 * Two panels, because there are two directions and they kept being confused for one. The first
 * is an AI inside Dort, answering in the Ask panel. The second is Dort inside your own agent —
 * the skill and the MCP server — which had existed for as long as dort-mcp.mjs and was named
 * nowhere but a docs page.
 */
export function SettingsWorkspace() {
  const { ready: hostedAi } = useHostedAi();
  return (
    <div className="dot-grid min-h-[calc(100dvh-64px)] w-full overflow-y-auto p-4 md:p-6">
      <div className="mx-auto grid w-full max-w-2xl grid-cols-[minmax(0,1fr)] items-start gap-4">
        <Panel
          label="AI provider"
          aside={
            <Chip dot tone={hostedAi ? "ok" : "warn"}>
              {hostedAi ? "This Dort offers one" : "Dort hosts no AI"}
            </Chip>
          }
        >
          <div className="px-1 pb-1">
            <AiSettings asPage />
          </div>
        </Panel>
        <Panel label="Connect your own agent" aside={<Chip>Skill · MCP</Chip>}>
          <AgentConnect />
        </Panel>
      </div>
    </div>
  );
}
