/** The four groups of wasted seats side by side, as a module that reads them sees them (the dashboard of the IT Admin). */
export interface OptimizationSummary {
  groups: Record<'G1' | 'G2' | 'G3' | 'G4', { unclosedCount: number; reclaimUnderWayCount: number }>;
  /** The `G2` not closed plus the `G1` open: what the dashboard counts. */
  counted: number;
  /** What is not covered yet: internal software has no usage source, so `G2` to `G4` are not recognised for it. */
  limitation: string;
}
