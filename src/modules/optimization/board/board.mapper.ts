import type { GhostSeatRecord } from '../ghost-seat/ghost-seat.types';
import type { RuleRunRecord } from '../rule-run/rule-run.repo';
import { canReclaim, confidenceLabelOf, headEvidenceOf, labelsOf } from './board.policy';

/** The names a row of the table shows besides the ids it keeps. */
export interface RowNames {
  planName: string;
  applicationName: string;
  holder: { employeeCode: string; fullName: string } | null;
}

/** What a G3/G4 adds to the row: the confidence with its reasons, the days, the labels and the money; empty for the other groups. */
const usageWire = (record: GhostSeatRecord) => ({
  confidence: record.usage?.confidence ?? null,
  activityStatus: record.usage?.activityStatus ?? null,
  inactiveDays: record.usage?.inactiveDays ?? null,
  lastActiveDate: record.usage?.lastActiveDate ?? null,
  activityAfterDecisionOn: record.activityAfterDecisionOn,
  ...evidenceWire(record.evidence),
});

const evidenceWire = (evidence: GhostSeatRecord['evidence']) =>
  evidence.group === 'G3' || evidence.group === 'G4'
    ? {
        confidenceReasons: evidence.confidence.reasons,
        usageLabels: evidence.labels,
        potentialSaving: evidence.potentialSaving,
      }
    : { confidenceReasons: [], usageLabels: [], potentialSaving: null };

export const toSummaryWire = (record: GhostSeatRecord, names: RowNames) => ({
  id: record.id,
  group: record.group,
  state: record.state,
  closeReason: record.closeReason,
  tier: record.tier,
  confidenceLabel: confidenceLabelOf(record.group),
  application: { applicationId: record.applicationId, applicationName: names.applicationName },
  plan: { planId: record.planId, planName: names.planName },
  subscriptionId: record.subscriptionId,
  assignmentId: record.assignmentId,
  holder:
    record.employeeId && names.holder
      ? { employeeId: record.employeeId, employeeCode: names.holder.employeeCode, fullName: names.holder.fullName }
      : null,
  freeSeats: record.freeSeats,
  countsTowardVacantCost: record.countsTowardVacantCost,
  revocationTaskId: record.revocationTaskId,
  labels: labelsOf(record),
  canReclaim: canReclaim(record),
  ...usageWire(record),
  createdAt: record.createdAt.toISOString(),
});

/** Who reads the detail: the IT Admin reads the whole evidence, a head only what `headEvidenceOf` keeps (`SoD-2`). */
export type DetailReader = 'IT_ADMIN' | 'HEAD';

export const toDetailWire = (record: GhostSeatRecord, names: RowNames, reader: DetailReader = 'IT_ADMIN') => ({
  ...toSummaryWire(record, names),
  evidence: reader === 'IT_ADMIN' ? { ...record.evidence } : headEvidenceOf(record.evidence),
  holderLeftOn: record.holderLeftOn,
  terminatingUntil: record.evidence.group === 'G2' ? (record.evidence.terminatingAccess?.until ?? null) : null,
  closedAt: record.closedAt?.toISOString() ?? null,
  supersededById: record.supersededById,
  createdRunId: record.createdRunId,
});

/** A run of the rules as the IT Admin reads it: how it ended and what it counted, never the error text of the operator. */
export const toRuleRunWire = (run: RuleRunRecord) => ({
  id: run.id,
  ruleSet: run.ruleSet,
  periodKey: run.periodKey,
  status: run.status,
  attempt: run.attempt,
  startedAt: run.startedAt.toISOString(),
  finishedAt: run.finishedAt?.toISOString() ?? null,
  createdCount: run.createdCount,
  updatedCount: run.updatedCount,
  closedCount: run.closedCount,
  skippedCount: run.skippedCount,
  failedCount: run.failedCount,
});
