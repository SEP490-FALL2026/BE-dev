import type { GhostSeatRecord } from '../ghost-seat/ghost-seat.types';
import { canReclaim, confidenceLabelOf, labelsOf } from './board.policy';

/** The names a row of the table shows besides the ids it keeps. */
export interface RowNames {
  planName: string;
  applicationName: string;
  holder: { employeeCode: string; fullName: string } | null;
}

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
  createdAt: record.createdAt.toISOString(),
});

export const toDetailWire = (record: GhostSeatRecord, names: RowNames) => ({
  ...toSummaryWire(record, names),
  evidence: { ...record.evidence },
  holderLeftOn: record.holderLeftOn,
  terminatingUntil: record.evidence.group === 'G2' ? (record.evidence.terminatingAccess?.until ?? null) : null,
  closedAt: record.closedAt?.toISOString() ?? null,
  supersededById: record.supersededById,
  createdRunId: record.createdRunId,
});
