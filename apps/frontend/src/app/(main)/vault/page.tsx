import { VaultWorkspace } from "@/components/(main)/vault/VaultWorkspace";

export const metadata = {
  title: "Vault",
  description:
    "Deposit and withdraw against DortSafeVault: the shares a deposit will mint shown before it is signed, and both exits — an exact amount of the asset, or an exact number of shares.",
  alternates: { canonical: "/vault" },
};

export default function VaultPage() {
  return <VaultWorkspace />;
}
