import { BridgeWorkspace } from "@/components/(main)/bridge/BridgeWorkspace";

export const metadata = {
  title: "Bridge",
  description:
    "Move an asset between a home chain and Portaldot V3: lock and mint, with what the escrow holds and what Portaldot has issued shown side by side.",
  alternates: { canonical: "/bridge" },
};

export default function BridgePage() {
  return <BridgeWorkspace />;
}
