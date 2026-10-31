import type { BusinessDate } from '../../../core/business-date';
import type { PlanRevocationInfo } from '../../catalog/public/catalog.types';
import type { DepartmentBrief, EmployeeRecord } from '../../organization/public/organization.types';
import type { TransferReviewItemWire, TransferReviewSummaryWire } from './transfer-review.dto';
import { isReviewOverdue, overdueDaysOf, waitingReasonOf } from './transfer-review.policy';
import type { ReviewItemRecord, ReviewSummaryRecord } from './transfer-review.types';

/** What the wire needs of the organization and the catalog, read in batches for a whole page. */
export interface ReviewNames {
  employees: ReadonlyMap<string, EmployeeRecord>;
  departments: ReadonlyMap<string, DepartmentBrief>;
  plans: ReadonlyMap<string, PlanRevocationInfo>;
  /** The head of each department today, by department id; absent while it has none. */
  heads: ReadonlyMap<string, string>;
  /** The seats of the lines of the page whose old seat is already being taken back for this review. */
  revoking: ReadonlySet<string>;
}

export const employeeBriefOf = (employee: EmployeeRecord) => ({
  id: employee.id,
  employeeCode: employee.employeeCode,
  fullName: employee.fullName,
});

/** The wire form of a name that must exist: a row whose person or department vanished is a broken reference, never a silent gap. */
function required<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`A transfer review points at a ${what} that does not exist`);

  return value;
}

export function toSummary(
  record: ReviewSummaryRecord,
  names: ReviewNames,
  today: BusinessDate,
  callerEmployeeId: string,
): TransferReviewSummaryWire {
  const head = names.heads.get(record.departmentId) ?? null;
  const department = required(names.departments.get(record.departmentId), 'department');

  return {
    id: record.id,
    origin: record.transferId === null ? 'POST_SETUP' : 'TRANSFER',
    employee: employeeBriefOf(required(names.employees.get(record.employeeId), 'person')),
    department: { id: department.id, code: department.code, name: department.name },
    effectiveOn: record.effectiveOn,
    dueOn: record.dueOn,
    status: record.status,
    totalItems: record.totalItems,
    pendingItems: record.pendingItems,
    waitingReason: waitingReasonOf(record.status, head),
    overdue: isReviewOverdue(record.status, record.dueOn, today),
    overdueDays: overdueDaysOf(record.status, record.dueOn, today),
    canDecide: record.status === 'OPEN' && head === callerEmployeeId,
  };
}

export function toItem(item: ReviewItemRecord, names: ReviewNames): TransferReviewItemWire {
  const plan = required(names.plans.get(item.planId), 'plan');
  const decidedBy = item.decidedByEmployeeId ? names.employees.get(item.decidedByEmployeeId) : undefined;

  return {
    assignmentId: item.assignmentId,
    position: item.position,
    application: { id: plan.applicationId, name: plan.applicationName },
    plan: { id: plan.planId, name: plan.planName },
    provisioningType: plan.provisioningType,
    grantReason: item.grantReason,
    decision: item.decision,
    decidedBy: decidedBy ? employeeBriefOf(decidedBy) : null,
    decidedAt: item.decidedAt ? item.decidedAt.toISOString() : null,
    newToolNote: item.newToolNote,
    revocationTaskId: item.revocationTaskId,
    // A new Request is still asked for only while the old seat stays: once its revocation is under way (the Request ended) it is not.
    needsNewRequest: item.decision === 'STILL_NEEDED' && !names.revoking.has(item.assignmentId),
  };
}
