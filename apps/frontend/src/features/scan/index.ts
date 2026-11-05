export { type Gathered, gatherFacts } from "./facts";
export { type ScanPhase, type ScanState, useScan } from "./hooks/useScan";
export { runTool } from "./run-tool";
export { knownEvents, knownSelectors } from "./selectors";
export {
  addressesIn,
  type CallNode,
  detect,
  displayFrames,
  EXAMPLES,
  flattenTrace,
  hasChildren,
  hiddenByFold,
  joinSources,
  MAX_SOURCE,
  NOT_CHECKED,
  type Sample,
  type ScanFacts,
  type ScanInput,
  type ScanKind,
  scanPrompt,
  shortHex,
  subjectLabel,
  TRY,
  traceSummary,
  whyNot,
} from "./utils/scan";
