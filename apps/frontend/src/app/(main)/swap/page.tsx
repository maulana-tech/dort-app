import { SwapWorkspace } from "@/components/(main)/swap/SwapWorkspace";

export const metadata = {
  title: "Swap",
  description:
    "Trade on PortalSwapRouter, Portaldot V3's own DEX: a quote priced with the router's own arithmetic, and the price impact these small pools really charge.",
  alternates: { canonical: "/swap" },
};

export default function SwapPage() {
  return <SwapWorkspace />;
}
