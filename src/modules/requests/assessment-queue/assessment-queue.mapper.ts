import { judgeCompletion } from '../assessment/assessment.policy';
import type { AssessmentQueueItemWire } from './assessment-queue.dto';
import type { AssessmentQueueRow } from './assessment-queue.repo';

export interface QueuePerson {
  id: string;
  employeeCode: string;
  fullName: string;
}

/** The names a page needs, read once for the whole page. */
export interface QueueLookups {
  people: ReadonlyMap<string, QueuePerson>;
  departments: ReadonlyMap<string, { id: string; name: string }>;
}

const personOf = (lookups: QueueLookups, id: string) => {
  const found = lookups.people.get(id);
  if (!found) throw new Error(`The employee ${id} of a waiting assessment does not exist.`);

  return { employeeId: found.id, employeeCode: found.employeeCode, fullName: found.fullName };
};

/** What completing the assessment would do now, and how many fields it still lacks, as the completion judges it. */
export function readinessOf(fields: AssessmentQueueRow['fields']): {
  readiness: AssessmentQueueItemWire['readiness'];
  missingCount: number;
} {
  const verdict = judgeCompletion(fields);
  switch (verdict.kind) {
    case 'OK':
      return { readiness: 'COMPLETABLE', missingCount: 0 };
    case 'INCOMPLETE':
      return { readiness: 'INCOMPLETE', missingCount: verdict.missing.length };
    case 'INTERNAL_BY_REGISTRATION':
      return { readiness: 'INTERNAL_BY_REGISTRATION', missingCount: 0 };
    case 'UNCONTROLLABLE':
      return { readiness: 'UNCONTROLLABLE', missingCount: 0 };
  }
}

/** Who holds the step, from the reader's side: them, another IT Admin they may stand in for, or nobody. */
export function holderOf(
  assigneeEmployeeId: string | null,
  readerEmployeeId: string,
): AssessmentQueueItemWire['holder'] {
  if (assigneeEmployeeId === null) return 'NOBODY';

  return assigneeEmployeeId === readerEmployeeId ? 'YOU' : 'ANOTHER_IT_ADMIN';
}

export function queueItemOf(
  row: AssessmentQueueRow,
  readerEmployeeId: string,
  lookups: QueueLookups,
): AssessmentQueueItemWire {
  const department = lookups.departments.get(row.departmentId);
  if (!department) throw new Error(`The department ${row.departmentId} of a waiting assessment does not exist.`);

  return {
    requestId: row.requestId,
    software: { name: row.softwareName, expectedUsers: row.expectedUsers },
    requester: personOf(lookups, row.requesterEmployeeId),
    department: { id: department.id, name: department.name },
    holder: holderOf(row.assigneeEmployeeId, readerEmployeeId),
    assignee: row.assigneeEmployeeId === null ? null : personOf(lookups, row.assigneeEmployeeId),
    waitingReason: row.waitingReason,
    canAct: !row.readerIsParty,
    started: row.started,
    classification: row.fields.classification,
    ...readinessOf(row.fields),
    quote: row.fields.quote === null ? 'MISSING' : 'RECORDED',
    slaWorkingDays: row.slaWorkingDays,
    waitingSince: row.reachedItAt.toISOString(),
  };
}
