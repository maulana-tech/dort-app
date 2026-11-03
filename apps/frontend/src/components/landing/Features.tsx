import { HowItWorks } from "./HowItWorks";
import { chatDemo, testRows, traceFrames } from "./stats";

/** 'How Dort works' (HowItWorks.tsx): read from the sample run here. */
export async function Features() {
  const [trace, chat, tests] = await Promise.all([
    traceFrames(),
    chatDemo(),
    testRows(),
  ]);
  return (
    <HowItWorks
      tests={tests}
      test={trace.test}
      frames={trace.frames}
      chat={chat}
    />
  );
}
