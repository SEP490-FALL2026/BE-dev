import { DONG, formatAmount } from '../../../core/money/money';
import type { DiscrepancyRecord, OutOfProcessCaseRecord } from '../vendor-account-review/vendor-account-review.types';
import type { OutOfProcessCaseWire, VendorAccountWire } from './vendor-account-review.dto';

/** The names of the applications a page speaks of, by id; one read for the page. */
export type ApplicationNames = ReadonlyMap<string, string>;

const applicationOf = (id: string | null, names: ApplicationNames) =>
  id === null ? null : { id, name: names.get(id) ?? '' };

export function toDiscrepancyWire(row: DiscrepancyRecord, names: ApplicationNames): VendorAccountWire {
  return {
    id: row.id,
    source: row.source,
    state: row.state,
    application: applicationOf(row.applicationId, names),
    vendorId: row.vendorId,
    employeeId: row.employeeId,
    identity: row.identity,
    internalValue: row.internalValue,
    vendorValue: row.vendorValue,
    evidenceOn: row.evidenceOn,
    firstSeenAt: row.firstSeenAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString(),
    decision: row.decision,
    decisionNote: row.decisionNote,
    decidedBy: row.decidedByEmployeeId === null ? null : { employeeId: row.decidedByEmployeeId },
    decidedAt: row.decidedAt?.toISOString() ?? null,
    outOfProcessCaseId: row.outOfProcessCaseId,
    reopenedFromId: row.reopenedFromId,
  };
}

export function toCaseWire(row: OutOfProcessCaseRecord, names: ApplicationNames): OutOfProcessCaseWire {
  return {
    id: row.id,
    state: row.state,
    discrepancyId: row.discrepancyId,
    application: applicationOf(row.applicationId, names),
    vendorId: row.vendorId,
    openedAt: row.openedAt.toISOString(),
    outcome: row.outcome,
    note: row.note,
    closedBy: row.closedByEmployeeId === null ? null : { employeeId: row.closedByEmployeeId },
    closedAt: row.closedAt?.toISOString() ?? null,
    amount: row.amountMinor === null ? null : { amount: formatAmount(row.amountMinor, 0), currency: DONG },
    costCenterId: row.costCenterId,
    documentIds: row.documentIds,
    companyAsset: row.companyAsset,
    concludedOn: row.concludedOn,
    renewalCancelled: row.renewalCancelled,
  };
}
