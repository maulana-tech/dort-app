import { Suspense } from "react";
import { ActionSkeleton } from "@/components/(main)";
import { ChatWorkspace } from "@/components/(main)/chat/ChatWorkspace";
import { loadTrace } from "@/features/trace/services/load-trace";

export const metadata = {
  title: "Chat",
  description:
    "Ask about a contract in plain language. Grounded in the Foundry run you have loaded when there is one, general when there is not — answered by your own AI, never a model of ours.",
  alternates: { canonical: "/chat" },
};

async function ChatData() {
  return <ChatWorkspace source={await loadTrace()} />;
}

export default function ChatPage() {
  return (
    <Suspense fallback={<ActionSkeleton rows={2} />}>
      <ChatData />
    </Suspense>
  );
}
