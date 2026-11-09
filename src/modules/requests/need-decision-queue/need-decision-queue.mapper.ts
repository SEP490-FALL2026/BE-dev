import { formatAmount } from '../../../core/money/money';
import type { CatalogApi } from '../../catalog/public/catalog.api';
import type { DepartmentBrief } from '../../organization/public/organization.types';
import { deciderRoleOf } from '../access-request/need-decision.policy';
import type { EmployeeWire } from '../spend/spend-wire-view.service';
import type { NeedQueueItemWire } from './need-decision-queue.dto';
import { reasonExcerptOf } from './need-decision-queue.policy';
import type { NeedQueueRow } from './need-decision-queue.repo';

type PlanSummary = Awaited<ReturnType<CatalogApi['getPlanSummaries']>>[number];

/** What a page of the queue is read against: the people, the plans, the departments, the currencies and the due days. */
export interface NeedQueueLookups {
  people: ReadonlyMap<string, EmployeeWire>;
  plans: readonly PlanSummary[];
  departments: readonly DepartmentBrief[];
  units: ReadonlyMap<string, number>;
  due: ReadonlyMap<string, string>;
}

/** A step points at a record that is missing only when the data is broken: say which step, never answer a half row. */
function found<T>(value: T | undefined, row: NeedQueueRow): T {
  if (value === undefined) throw new Error(`The step ${row.id} points at a missing record.`);

  return value;
}

function pricingOf(request: NeedQueueRow['request'], units: ReadonlyMap<string, number>) {
  const priced = request.amountMinor !== null && request.amountCurrency !== null;

  return {
    status: request.pricingStatus,
    amount: priced
      ? {
          amount: formatAmount(request.amountMinor as bigint, units.get(request.amountCurrency as string) ?? 2),
          currency: request.amountCurrency as string,
        }
      : null,
  };
}

/** One row of the queue of the need steps: what the request is, how long the step may wait, and what the caller decides. */
export function needQueueItemOf(row: NeedQueueRow, lookups: NeedQueueLookups): NeedQueueItemWire {
  const { request } = row;
  const deciderRole = deciderRoleOf(row.routingRow);
  const isGroup = request.type === 'GROUP_GRANT';
  const plan = lookups.plans.find((candidate) => candidate.planId === request.planId);
  const beneficiaryId = request.beneficiaries[0]?.employeeId;
  const department = found(
    lookups.departments.find((candidate) => candidate.id === request.departmentId),
    row,
  );

  return {
    requestId: row.requestId,
    stepId: row.id,
    stepKind: 'NEED',
    deciderRole,
    type: request.type,
    openedAt: row.createdAt.toISOString(),
    assignedAt: row.assignedAt?.toISOString() ?? null,
    slaWorkingDays: row.slaWorkingDays,
    dueOn: found(lookups.due.get(row.id), row),
    plan: plan ? { planId: plan.planId, planName: plan.planName, applicationName: plan.applicationName } : null,
    softwareName: request.proposal?.softwareName ?? null,
    requester: found(lookups.people.get(request.requesterEmployeeId), row),
    // A request for a group has no one person it is for: its people are read as lines.
    beneficiary: isGroup || beneficiaryId === undefined ? null : found(lookups.people.get(beneficiaryId), row),
    lineCount: isGroup ? row._count.lines : request._count.beneficiaries,
    department: { id: department.id, code: department.code, name: department.name },
    businessReasonExcerpt: reasonExcerptOf(request.businessReason),
    termMonths: request.termMonths ?? 0,
    pricing: pricingOf(request, lookups.units),
    samePersonAsSpend: row.samePersonAsSpend,
  };
}
