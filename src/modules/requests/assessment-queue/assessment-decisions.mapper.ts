import type { AssessmentDecisionItemWire } from './assessment-decisions.dto';
import type { AssessmentDecisionRow } from './assessment-decisions.repo';
import { personOf, type QueueLookups } from './assessment-queue.mapper';

/** One decided assessment as the list shows it: the people and the department are read once for the page, and one that is missing is a fault. */
export function decisionItemOf(row: AssessmentDecisionRow, lookups: QueueLookups): AssessmentDecisionItemWire {
  const department = lookups.departments.get(row.departmentId);
  if (!department) throw new Error(`The department ${row.departmentId} of a decided assessment does not exist.`);

  return {
    requestId: row.requestId,
    software: { name: row.softwareName },
    requester: personOf(lookups, row.requesterEmployeeId),
    department: { id: department.id, name: department.name },
    scope: row.planOnly ? 'PLAN_ONLY' : 'FULL',
    result: row.result,
    rejectionKind: row.rejectionKind,
    reason: row.reason,
    decidedBy: personOf(lookups, row.decidedByEmployeeId),
    decidedAt: row.decidedAt.toISOString(),
  };
}
