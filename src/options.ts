// The TIP command-line options, mirrored from the argument parser and
// printUsage() in TIP/src/tip/Tip.scala and from
// FlowSensitiveAnalysis.{Analysis, AnalysisOption}.

export interface Flag {
  flag: string;
  description: string;
}

export interface FlagGroup {
  label: string;
  flags: Flag[];
}

export const FLAG_GROUPS: FlagGroup[] = [
  {
    label: "Running programs",
    flags: [
      { flag: "-run", description: "run the program as the last step" },
      { flag: "-concolic", description: "perform concolic testing (search for failing inputs using dynamic symbolic execution)" },
    ],
  },
  {
    label: "Analyses",
    flags: [
      { flag: "-types", description: "enable type analysis" },
      { flag: "-cfa", description: "enable control-flow analysis (interprocedural analyses use the call-graph obtained by this analysis)" },
      { flag: "-andersen", description: "enable Andersen pointer analysis" },
      { flag: "-steensgaard", description: "enable Steensgaard pointer analysis" },
    ],
  },
  {
    label: "Normalization (can be combined)",
    flags: [
      { flag: "-normalizereturns", description: "normalize return statements" },
      { flag: "-normalizecalls", description: "normalize function calls" },
      { flag: "-normalizepointers", description: "normalize pointer usages" },
    ],
  },
  {
    label: "Control-flow graphs (written as .dot to the output directory)",
    flags: [
      { flag: "-cfg", description: "construct the (intraprocedural) control-flow graph, but do not perform any analysis" },
      { flag: "-icfg", description: "construct the interprocedural control-flow graph, but do not perform any analysis" },
    ],
  },
  {
    label: "Other",
    flags: [{ flag: "-verbose", description: "verbose output" }],
  },
];

export const DATAFLOW_ANALYSES: Flag[] = [
  { flag: "sign", description: "sign analysis" },
  { flag: "livevars", description: "live variables analysis" },
  { flag: "available", description: "available expressions analysis" },
  { flag: "vbusy", description: "very busy expressions analysis" },
  { flag: "reaching", description: "reaching definitions analysis" },
  { flag: "constprop", description: "constant propagation analysis" },
  { flag: "interval", description: "interval analysis" },
  { flag: "copyconstprop", description: "copy constant propagation analysis" },
  { flag: "uninitvars", description: "possibly-uninitialized variables analysis" },
  { flag: "taint", description: "taint analysis" },
];

export const DEFAULT_SOLVER = "simple";

export const SOLVERS: Flag[] = [
  { flag: "simple", description: "the simple fixpoint solver (default)" },
  { flag: "wl", description: "worklist solver" },
  { flag: "wlr", description: "worklist solver with reachability" },
  { flag: "wlrw", description: "worklist solver with reachability and widening" },
  { flag: "wlrwn", description: "worklist solver with reachability, widening, and narrowing" },
  { flag: "wlrp", description: "worklist solver with reachability and propagation" },
  { flag: "iwlr", description: "worklist solver with reachability, interprocedural version" },
  { flag: "iwlrp", description: "worklist solver with reachability and propagation, interprocedural version" },
  { flag: "csiwlrp", description: "worklist solver with reachability and propagation, context-sensitive (call string) interprocedural version" },
  { flag: "cfiwlrp", description: "worklist solver with reachability and propagation, context-sensitive (functional approach) interprocedural version" },
  { flag: "ide", description: "IDE solver" },
  { flag: "summary", description: "summary solver" },
];

export type SourceScope = "file" | "folder";

export interface TipOptions {
  /** Plain flags such as "-run" or "-types". */
  flags: string[];
  /** Enabled dataflow analyses, mapped to their solver. */
  dataflow: Record<string, string>;
  /** Analyze only the current file, or every .tip file in its folder. */
  scope: SourceScope;
  /** Absolute output directory. */
  outDir: string;
}

export function defaultOptions(outDir: string): TipOptions {
  return { flags: ["-run"], dataflow: {}, scope: "file", outDir };
}

/** Builds the argument list for tip.Tip: `<options> <source> [out]`. */
export function buildArgs(options: TipOptions, source: string): string[] {
  const args: string[] = [];
  for (const group of FLAG_GROUPS) {
    for (const { flag } of group.flags) {
      if (options.flags.includes(flag)) args.push(flag);
    }
  }
  for (const { flag } of DATAFLOW_ANALYSES) {
    const solver = options.dataflow[flag];
    if (solver === undefined) continue;
    args.push(`-${flag}`);
    if (solver !== DEFAULT_SOLVER) args.push(solver);
  }
  args.push(source, options.outDir);
  return args;
}
