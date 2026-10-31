import { formatAmount } from '../../../core/money/money';
import type { CatalogApi } from '../../catalog/public/catalog.api';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import type { AssessmentRecord } from '../access-request/assessment-record.types';
import type { BudgetCheckRepo } from '../spend/budget-check.repo';
import { codesOf } from '../spend/budget-check.policy';
import type { SpendDecisionRepo } from '../spend/spend-decision.repo';
import type { SpendWireViewService } from '../spend/spend-wire-view.service';
import type { SpendStepRepo } from '../spend/spend-step.repo';
import type { ApprovalDetailWire, ApprovalSummaryWire } from './spend-approval.dto';

type OpenSpendRow = Awaited<ReturnType<SpendStepRepo['pageOpenSpendOf']>>['rows'][number];
type People = Awaited<ReturnType<SpendWireViewService['people']>>;
type PlanSummary = Awaited<ReturnType<CatalogApi['getPlanSummaries']>>[number];
type CostCenter = Awaited<ReturnType<OrganizationReadApi['costCentersByIds']>>[number];

/** What the queue of the spending approver is read against: the check, the batch, the plan, the people, the currency and the Cost Center. */
export interface QueueLookups {
  checks: Awaited<ReturnType<BudgetCheckRepo['latestOf']>>;
  batches: Map<string, string>;
  plans: readonly PlanSummary[];
  people: People;
  units: Map<string, number>;
  centers: readonly CostCenter[];
  /** The day each step is due, by step id. */
  due: Map<string, string>;
}

function planOf(
  plans: readonly PlanSummary[],
  planId: string | null | undefined,
): { planId: string; planName: string; applicationName: string } | null {
  const plan = plans.find((candidate) => candidate.planId === planId);

  return plan ? { planId: plan.planId, planName: plan.planName, applicationName: plan.applicationName } : null;
}

/** The amount as the currency writes it (its minor units), or none when the request is not priced yet. */
function amountOf(request: OpenSpendRow['request'], units: Map<string, number>): ApprovalSummaryWire['amount'] {
  if (request.amountMinor === null || request.amountCurrency === null) return null;

  return {
    amount: formatAmount(request.amountMinor, units.get(request.amountCurrency) ?? 2),
    currency: request.amountCurrency,
  };
}

/** The people and the Cost Center a row points at; a step points at a record that is missing only when the data is broken. */
function partiesOf(row: OpenSpendRow, lookups: QueueLookups) {
  const { request } = row;
  const requester = lookups.people.get(request.requesterEmployeeId);
  // A request for a group has no one person it is for: its people are read as lines.
  const beneficiary =
    request.type === 'GROUP_GRANT'
      ? null
      : (lookups.people.get(request.beneficiaries[0]?.employeeId ?? '') ?? undefined);
  const center = lookups.centers.find((candidate) => candidate.id === request.costCenterId);
  if (!requester || beneficiary === undefined || !center) {
    throw new Error(`The step ${row.id} points at a missing record.`);
  }

  return { requester, beneficiary, center };
}

function dueOf(row: OpenSpendRow, lookups: QueueLookups): string {
  const due = lookups.due.get(row.id);
  if (due === undefined) throw new Error(`The step ${row.id} has no deadline counted.`);

  return due;
}

/** A row of the queue (`US-06-01` AC-1): what the request is, what it costs, the first code of its check, and who holds which step. */
export function approvalSummaryOf(row: OpenSpendRow, lookups: QueueLookups): ApprovalSummaryWire {
  const { request } = row;
  const { requester, beneficiary, center } = partiesOf(row, lookups);
  const check = lookups.checks.get(row.requestId);

  return {
    requestId: row.requestId,
    stepId: row.id,
    stepKind: 'SPEND_APPROVAL',
    openedAt: row.createdAt.toISOString(),
    slaWorkingDays: row.slaWorkingDays,
    dueOn: dueOf(row, lookups),
    plan: planOf(lookups.plans, request.planId),
    softwareName: request.proposal?.softwareName ?? null,
    requester,
    beneficiary,
    lineCount: request._count.beneficiaries,
    costCenter: { id: center.id, code: center.code },
    amount: amountOf(request, lookups.units),
    primaryCode: check ? (codesOf(check)[0] ?? null) : null,
    samePersonAsSpend: row.samePersonAsSpend,
    noIndependentReview: row.noIndependentReview,
    offPlan: request.offPlan,
    batchId: lookups.batches.get(row.requestId) ?? null,
  };
}

type Person = (id: string) => ApprovalSummaryWire['requester'];
type DetailStep = NonNullable<Awaited<ReturnType<SpendStepRepo['findLatest']>>>;
type LatestDecision = Awaited<ReturnType<SpendDecisionRepo['latest']>>;

/** What the detail of one request is read against: the step, the request, what was decided, the assessment, and the names. */
export interface DetailFacts {
  requestId: string;
  step: DetailStep;
  request: AccessRequestRecord;
  decision: LatestDecision;
  assessment: AssessmentRecord | null;
  softwareName: string | null;
  plans: readonly PlanSummary[];
  person: Person;
  center: { id: string; code: string };
  cost: ApprovalDetailWire['cost'];
  latestBudgetInformation: ApprovalDetailWire['latestBudgetInformation'];
}

/** The plans the detail names: the plan of the request, and the equivalent tool of the assessment of a proposal. */
export function detailPlanIds(
  request: { planId: string | null },
  assessment: { equivalentPlanId: string | null } | null,
): string[] {
  return [request.planId, assessment?.equivalentPlanId ?? null].filter((id): id is string => id !== null);
}

/** The people the detail names, in the order the step reads them; a request for a group has no one person it is for. */
export function detailPeopleIds(
  step: { assigneeEmployeeId: string | null },
  request: {
    type: string;
    requesterEmployeeId: string;
    beneficiaryEmployeeIds: readonly string[];
    needDecision: { decidedByEmployeeId: string } | null;
  },
  decision: { decidedByEmployeeId: string } | null,
): (string | null)[] {
  return [
    step.assigneeEmployeeId,
    request.requesterEmployeeId,
    request.type === 'GROUP_GRANT' ? null : request.beneficiaryEmployeeIds[0],
    request.needDecision?.decidedByEmployeeId ?? null,
    decision?.decidedByEmployeeId ?? null,
  ];
}

function stepView(step: DetailStep, person: Person): ApprovalDetailWire['step'] {
  return {
    id: step.id,
    state: step.state as ApprovalDetailWire['step']['state'],
    waitingReason: step.waitingReason as ApprovalDetailWire['step']['waitingReason'],
    assignee: step.assigneeEmployeeId === null ? null : person(step.assigneeEmployeeId),
    openedAt: step.createdAt.toISOString(),
    decidedAt: step.decidedAt?.toISOString() ?? null,
    slaWorkingDays: step.slaWorkingDays,
    samePersonAsSpend: step.samePersonAsSpend,
    noIndependentReview: step.noIndependentReview,
  };
}

function requestView(facts: DetailFacts): ApprovalDetailWire['request'] {
  const { request, person, center } = facts;

  return {
    state: request.state,
    plan: planOf(facts.plans, request.planId),
    softwareName: facts.softwareName,
    requester: person(request.requesterEmployeeId),
    beneficiary: request.type === 'GROUP_GRANT' ? null : person(request.beneficiaryEmployeeIds[0]),
    lineCount: request.beneficiaryEmployeeIds.length,
    costCenter: { id: center.id, code: center.code },
    businessReason: request.businessReason,
    termMonths: request.termMonths,
    expectedSpendOn: request.pricing.expectedSpendOn,
    budgetYear: request.pricing.budgetYear,
    offPlan: request.offPlan,
    planLineAttached: request.planLine !== null,
  };
}

function assessmentView(facts: DetailFacts): ApprovalDetailWire['assessment'] {
  const { assessment } = facts;
  if (!assessment) return null;
  const equivalent = facts.plans.find((candidate) => candidate.planId === assessment.equivalentPlanId);

  return {
    classification: assessment.classification,
    controlLevel: assessment.controlLevel,
    controlRiskNote: assessment.controlRiskNote,
    dataSensitivity: assessment.dataSensitivity,
    equivalentTool: equivalent ? { planId: equivalent.planId, planName: equivalent.planName } : null,
  };
}

/** The spend step of one request and what surrounds it (`US-06-01` AC-3, AC-9, AC-10, AC-14): the need, the cost, the assessment, what was decided. */
export function approvalDetailOf(facts: DetailFacts): ApprovalDetailWire {
  const { request, decision, person } = facts;

  return {
    requestId: facts.requestId,
    step: stepView(facts.step, person),
    request: requestView(facts),
    need: request.needDecision
      ? {
          decidedBy: person(request.needDecision.decidedByEmployeeId),
          decidedAt: request.needDecision.decidedAt.toISOString(),
          reason: request.needDecision.reason,
        }
      : null,
    cost: facts.cost,
    assessment: assessmentView(facts),
    decision: decision
      ? {
          decision: decision.decision,
          reason: decision.reason,
          overrideReason: decision.overrideReason,
          decidedBy: person(decision.decidedByEmployeeId),
          decidedAt: decision.decidedAt.toISOString(),
          bySubstitute: decision.bySubstitute,
        }
      : null,
    latestBudgetInformation: facts.latestBudgetInformation,
  };
}
