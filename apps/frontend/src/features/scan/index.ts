export { type Gathered, gatherFacts } from "./facts";
export { type ScanPhase, type ScanState, useScan } from "./hooks/useScan";
export { knownEvents, knownSelectors } from "./selectors";
export {
  addressesIn,
  type CallNode,
  detect,
  displayFrames,
  EXAMPLES,
  flattenTrace,
  joinSources,
  MAX_SOURCE,
  NOT_CHECKED,
  type ScanFacts,
  type ScanInput,
  type ScanKind,
  scanPrompt,
  shortAddr,
  traceSummary,
  whyNot,
} from "./utils/scan";
