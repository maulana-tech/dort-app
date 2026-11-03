import { ScanWorkspace } from "@/components/(main)/scan/ScanWorkspace";

export const metadata = {
  title: "Scan",
  description:
    "Hand Dort a contract address, a transaction hash, or your own .sol files. It reads the chain — the real call tree, not a guess — and gives you candidates to check, how to confirm each one, and what it could not look at. Never a verdict.",
  alternates: { canonical: "/scan" },
};

export default function ScanPage() {
  return <ScanWorkspace />;
}
