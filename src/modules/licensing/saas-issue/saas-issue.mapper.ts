import type { BusinessDate } from '../../../core/business-date';
import type { SaasIssueEntryWire, SaasIssueSummaryWire, SaasIssueWire } from './saas-issue.dto';
import { isResponseOverdue } from './saas-issue.policy';
import type { EntryRecord, SaasIssueRecord } from './saas-issue.repo';

type Brief = { employeeId: string; employeeCode: string; fullName: string };
type PlanBriefWire = { planId: string; planName: string; applicationName: string };

/** What the wire needs to name besides the report itself: the people, the plan of each assignment and the original of a duplicate. */
export interface IssueNames {
  today: BusinessDate;
  employee: (id: string) => Brief;
  plan: (assignmentId: string) => PlanBriefWire;
  originalCode: (id: string) => string;
}

export function toSummary(record: SaasIssueRecord, names: IssueNames): SaasIssueSummaryWire {
  return {
    id: record.id,
    code: record.code,
    state: record.state,
    category: record.category,
    impact: record.impact,
    assignmentId: record.assignmentId,
    plan: names.plan(record.assignmentId),
    reporter: names.employee(record.reporterEmployeeId),
    assignedItAdmin: names.employee(record.assignedItAdminEmployeeId),
    responseDueOn: record.responseDueOn,
    overdue: isResponseOverdue({ state: record.state, responseDueOn: record.responseDueOn, today: names.today }),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function toDetail(record: SaasIssueRecord, names: IssueNames): SaasIssueWire {
  const linked = record.linkedWork ?? {};

  return {
    ...toSummary(record, names),
    occurredAt: record.occurredAt.toISOString(),
    description: record.description,
    grantTaskId: record.grantTaskId,
    assignedByFallback: record.assignedByFallback,
    resolution: record.resolution,
    vendorTicketRef: record.vendorTicketRef,
    linkedWork: {
      grantTaskId: linked.grantTaskId ?? null,
      discrepancyId: linked.discrepancyId ?? null,
      returnId: linked.returnId ?? null,
      requestId: linked.requestId ?? null,
    },
    duplicateOf: record.duplicateOfId
      ? { id: record.duplicateOfId, code: names.originalCode(record.duplicateOfId) }
      : null,
    duplicateReason: record.duplicateReason,
    resolvedAt: record.resolvedAt ? record.resolvedAt.toISOString() : null,
    reopenUntil: record.reopenUntil,
    closedAt: record.closedAt ? record.closedAt.toISOString() : null,
    reopenCount: record.reopenCount,
  };
}

export function toEntry(record: EntryRecord, employee: (id: string) => Brief): SaasIssueEntryWire {
  return {
    id: record.id,
    kind: record.kind,
    authorRole: record.authorRole,
    author: record.authorEmployeeId ? employee(record.authorEmployeeId) : null,
    body: record.body,
    fromState: record.fromState,
    toState: record.toState,
    onBehalfOf: record.onBehalfOfEmployeeId ? employee(record.onBehalfOfEmployeeId) : null,
    createdAt: record.createdAt.toISOString(),
  };
}
