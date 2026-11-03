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
  // the protocols are the app's own data, not a list typed into the landing
  const protocols = protocolSummaries().map((p) => p.name);
  return <BigWords chat={chat} protocols={protocols} />;
}
