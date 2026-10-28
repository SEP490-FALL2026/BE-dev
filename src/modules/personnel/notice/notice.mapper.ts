import type { BusinessDate } from '../../../core/business-date';
import type { DepartmentBrief, EmployeeRecord } from '../../organization/organization.types';
import type { NoticeDetailWire, NoticeSummaryWire } from './notice.dto';
import { isNoticeOverdue, isPriorityKind } from './notice.policy';
import type { NoticeRecord, NoticeSummaryRecord, NoticeVerificationRecord } from './notice.types';

const UNKNOWN = '';

const employeeBrief = (employees: ReadonlyMap<string, EmployeeRecord>, employeeId: string) => {
  const employee = employees.get(employeeId);

  return { id: employeeId, employeeCode: employee?.employeeCode ?? UNKNOWN, fullName: employee?.fullName ?? UNKNOWN };
};

export function toSummary(
  record: NoticeSummaryRecord,
  employees: ReadonlyMap<string, EmployeeRecord>,
  today: BusinessDate,
): NoticeSummaryWire {
  return {
    id: record.id,
    code: record.code,
    employee: employeeBrief(employees, record.employeeId),
    kind: record.kind,
    proposedOn: record.proposedOn,
    status: record.status,
    dueOn: record.dueOn,
    overdue: isNoticeOverdue(record, today),
    priority: isPriorityKind(record.kind),
  };
}

export function toDetail(
  record: NoticeRecord,
  facts: {
    employees: ReadonlyMap<string, EmployeeRecord>;
    target: DepartmentBrief | null;
    verification: NoticeVerificationRecord | null;
    today: BusinessDate;
  },
): NoticeDetailWire {
  return {
    ...toSummary(record, facts.employees, facts.today),
    note: record.note,
    sender: employeeBrief(facts.employees, record.senderEmployeeId),
    targetDepartment: facts.target && { id: facts.target.id, code: facts.target.code, name: facts.target.name },
    createdAt: record.createdAt.toISOString(),
    defaultItAdminEmployeeId: record.defaultItAdminEmployeeId,
    rejectReason: record.rejectReason,
    recordedEvent:
      record.recordedEventKind && record.recordedEventId
        ? { kind: record.recordedEventKind, id: record.recordedEventId }
        : null,
    handledAt: record.handledAt?.toISOString() ?? null,
    overdueNoticedAt: record.overdueNoticedAt?.toISOString() ?? null,
    verification: facts.verification && {
      method: facts.verification.method,
      reference: facts.verification.reference,
      verifiedByAppUserId: facts.verification.verifiedByAppUserId,
      verifiedByProcedure: facts.verification.verifiedByTicketId !== null,
      verifiedAt: facts.verification.verifiedAt.toISOString(),
    },
  };
}
