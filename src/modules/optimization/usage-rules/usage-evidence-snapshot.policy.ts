import type { BusinessDate } from '../../../core/business-date';
import type { EvidenceSource } from '../../usage/public/usage-evidence.types';
import type {
  GhostSeatEvidenceSource,
  GhostSeatPotentialSaving,
  GhostSeatUsageEvidence,
} from '../ghost-seat/ghost-seat-evidence.json';
import type { ConfidenceResult } from './confidence.policy';
import type { Thresholds, UsageAssessment } from './usage-assessment.policy';

export interface SnapshotInput {
  group: 'G3' | 'G4';
  employeeId: string;
  planId: string;
  /** The sources that said anything of the application, as they were on the day of the pass. */
  sources: readonly EvidenceSource[];
  matchMethod: GhostSeatUsageEvidence['matchMethod'];
  assessment: UsageAssessment;
  thresholds: Thresholds;
  confidence: ConfidenceResult;
  expectedEndDate: BusinessDate | null;
  potentialSaving: GhostSeatPotentialSaving | null;
  previousDecision: GhostSeatUsageEvidence['previousDecision'];
}

const sourceOf = (source: EvidenceSource): GhostSeatEvidenceSource => ({
  sourceId: source.sourceId,
  name: source.name,
  kind: source.kind,
  coverageFrom: source.coverage?.from ?? null,
  coverageTo: source.coverage?.to ?? null,
  ageDays: source.ageDays,
  activityDefinition: source.activityDefinition,
  strictness: source.strictness,
});

/** The labels a reader of the table sees beside a recommendation: what the days rest on that is weaker than a vendor's report (`P-05`). */
export function labelsOf(sources: readonly EvidenceSource[], confidence: ConfidenceResult): string[] {
  const labels: string[] = [];
  if (sources.some((source) => source.kind === 'COLLECTOR')) labels.push('P-05');
  if (confidence.level === 'LOW') labels.push('LOW_CONFIDENCE');

  return labels;
}

/**
 * The evidence of a `G3`/`G4` as the pass saw it (`TC-3`, `FR-4.14`): the sources with their dates, age and strictness, how the person was tied,
 * the days, the thresholds and where they came from, the confidence with its reasons, the end of a right that has one and the money. It carries
 * no volume of use, no session, no token and no event (`QĐ-101i`). Written once; a `MONITOR` that rises a tier is re-read.
 */
export function snapshotOf(input: SnapshotInput): GhostSeatUsageEvidence {
  const { assessment, thresholds } = input;

  return {
    group: input.group,
    employeeId: input.employeeId,
    planId: input.planId,
    sources: input.sources.map(sourceOf),
    matchMethod: input.matchMethod,
    activityStatus: assessment.status === 'NEVER_ACTIVE' ? 'NEVER_ACTIVE' : 'INACTIVE',
    lastActiveDate: assessment.lastActiveDate,
    inactiveDays: assessment.inactiveDays,
    coverageDays: assessment.coverageDays,
    thresholds: {
      values: { monitor: thresholds.monitor, review: thresholds.review, action: thresholds.action },
      origin: thresholds.origin,
    },
    confidence: input.confidence,
    labels: labelsOf(input.sources, input.confidence),
    timeBound: input.expectedEndDate ? { expectedEndDate: input.expectedEndDate } : null,
    potentialSaving: input.potentialSaving,
    previousDecision: input.previousDecision ?? null,
  };
}
