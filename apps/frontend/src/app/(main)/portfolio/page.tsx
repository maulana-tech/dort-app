import { PortfolioWorkspace } from "@/components/(main)";

export const metadata = {
  title: "Portfolio",
  description:
    "What this wallet holds in Dort's vaults, on every chain, with the deposits and withdrawals that got it there — read from the chains themselves.",
};

export default function Page() {
  return <PortfolioWorkspace />;
}
