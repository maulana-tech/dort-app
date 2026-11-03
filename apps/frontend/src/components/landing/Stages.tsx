import { cases } from "@/features/exploits";
import { protocolSummaries } from "@/features/explore/services/protocols";
import { BigWords } from "./BigWords";
import { chatDemo, testRows } from "./stats";
import { TestDrift } from "./TestDrift";

export async function Tests() {
  const tests = await testRows();
  return (
    <TestDrift
      tests={tests.map((t) => ({
        name: t.name,
        suite: t.suite,
        ok: t.status === "Success",
      }))}
    />
  );
}

export async function Words() {
  const chat = await chatDemo();
  // the protocols and incidents are the app's own data, not a list typed into the landing
  const protocols = protocolSummaries().map((p) => p.name);
  const incidents = cases()
    .slice(0, 4)
    .map((c) => ({
      name: c.name,
      year: c.date.slice(0, 4),
      loss: `$${Math.round(c.loss / 1_000_000)}M`,
    }));
  return <BigWords chat={chat} protocols={protocols} incidents={incidents} />;
}
