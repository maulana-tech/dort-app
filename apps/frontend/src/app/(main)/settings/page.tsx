import { SettingsWorkspace } from "@/components/(main)/settings/SettingsWorkspace";

export const metadata = {
  title: "Settings",
  description:
    "Choose which model answers in Chat: this deployment's own, a model you bring, or none at all — and see what each one means for where your question goes.",
  alternates: { canonical: "/settings" },
};

export default function SettingsPage() {
  return <SettingsWorkspace />;
}
