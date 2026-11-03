export { type Gathered, gatherFacts } from "./facts";
export { type ScanPhase, type ScanState, useScan } from "./hooks/useScan";
export { knownSelectors } from "./selectors";
export {
  type CallNode,
  detect,
  EXAMPLES,
  flattenTrace,
  joinSources,
  MAX_SOURCE,
  NOT_CHECKED,
  readTrace,
  type ScanFacts,
  type ScanInput,
  type ScanKind,
  scanPrompt,
  traceSummary,
  whyNot,
} from "./utils/scan";
