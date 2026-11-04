"use client";

import { useEffect, useState } from "react";
import { CodeBlock } from "@/components/docs/CodeBlock";
import { SegmentedControl } from "@/components/ui";
import { SITE_URL } from "@/config/site";
import { McpServers } from "./McpServers";

type Client = "code" | "desktop" | "cursor";

/**
 * The other direction: not an AI inside Dort, but Dort inside somebody's own agent.
 *
 * Dort has spoken MCP since dort-mcp.mjs existed, and the only place that was ever said was a
 * docs page — so the feature was real and invisible, which for a plug is the same as missing.
 * This panel hands over the two things an agent needs and nothing else: the skill, which teaches
 * it what a run is and what it must not do with one, and the server, which lets it read the run
 * without pulling a 20 MB file through its context.
 *
 * Both commands are built from the origin you are reading this on, not from a constant, so a
 * local Dort hands out localhost and the deploy hands out itself. A pasted command that points
 * at the wrong host is worse than no command: it half works.
 */
export function AgentConnect() {
  const [client, setClient] = useState<Client>("code");
  // SITE_URL is right during the server render; once mounted, the host in the address bar is
  // righter — that is the Dort actually serving these files.
  const [origin, setOrigin] = useState(SITE_URL);
  useEffect(() => setOrigin(location.origin), []);

  // npx is the short way and the one most people will use; the curl is the one that works with
  // no npm, offline, and against whichever Dort you are reading this on. Both write the same
  // file — skill.check.ts asserts the packaged copy and the served copy are byte-identical.
  const viaNpx = "npx dort-skill";
  const viaCurl = `mkdir -p .claude/skills/dort
curl -fsSL "${origin}/skill/dort/SKILL.md" -o .claude/skills/dort/SKILL.md`;

  const fetchMcp = `curl -fsSLO "${origin}/exporter/dort-mcp.mjs"`;

  const CMD: Record<Client, { where: string; code: string }> = {
    code: {
      where:
        "Run both from your Foundry project root, after an export has written dort-data.json. $PWD keeps the paths absolute without you having to look them up.",
      code: `${fetchMcp}
claude mcp add dort -- node "$PWD/dort-mcp.mjs" --data="$PWD/dort-data.json"`,
    },
    desktop: {
      where:
        "Claude Desktop reads claude_desktop_config.json (Settings → Developer → Edit Config). It is launched by the OS, not by your shell, so these paths have to be real absolute paths — run pwd in the project and paste the result.",
      code: `{
  "mcpServers": {
    "dort": {
      "command": "node",
      "args": [
        "/absolute/path/to/dort-mcp.mjs",
        "--data=/absolute/path/to/dort-data.json"
      ]
    }
  }
}`,
    },
    cursor: {
      where:
        "Cursor reads .cursor/mcp.json in the project, or ~/.cursor/mcp.json for every project. Same shape, same requirement: absolute paths.",
      code: `{
  "mcpServers": {
    "dort": {
      "command": "node",
      "args": [
        "/absolute/path/to/dort-mcp.mjs",
        "--data=/absolute/path/to/dort-data.json"
      ]
    }
  }
}`,
    },
  };

  return (
    <div className="flex flex-col gap-4 px-1 pb-1">
      <section className="flex flex-col gap-2">
        <h3 className="text-[13px] text-fg">Skill</h3>
        <p className="text-[12.5px] text-muted leading-normal">
          One markdown file that teaches your agent what a Dort run is: where to
          find <code className="font-mono text-body">dort-data.json</code>, how
          to read a decoded trace out of it, which atlas field means what, and
          the rule it has to keep — explain the code, never write the exploit.
          It works in Claude Code as a project skill, and its body is plain
          instructions, so any agent that can read a file can use it.
        </p>
        <CodeBlock text={viaNpx} />
        <p className="text-[12.5px] text-muted leading-normal">
          Writes{" "}
          <code className="font-mono text-body">
            .claude/skills/dort/SKILL.md
          </code>{" "}
          and nothing else — no postinstall, no dependencies, no network call of
          its own. Add <code className="font-mono text-body">--global</code> for
          every project, or <code className="font-mono text-body">--print</code>{" "}
          to pipe it somewhere else. Or without npm, from this Dort:
        </p>
        <CodeBlock text={viaCurl} />
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-[13px] text-fg">MCP server</h3>
        <p className="text-[12.5px] text-muted leading-normal">
          The skill tells an agent what to look for;{" "}
          <code className="font-mono text-body">dort-mcp.mjs</code> is how it
          asks. Six read-only tools over stdio — the run's overview, one test's
          frames, the contract map, one piece, the findings — plus{" "}
          <code className="font-mono text-body">propose_scenario</code>, which
          only accepts scenarios that test intended behaviour. It reads local
          files and makes no network call of its own.
        </p>
        <SegmentedControl<Client>
          value={client}
          onChange={setClient}
          options={[
            { value: "code", label: "Claude Code" },
            { value: "desktop", label: "Claude Desktop" },
            { value: "cursor", label: "Cursor" },
          ]}
        />
        <p className="text-[12.5px] text-muted leading-normal">
          {CMD[client].where}
        </p>
        <CodeBlock text={CMD[client].code} />
      </section>

      <McpServers />
    </div>
  );
}
