import type { BusinessDate } from '../../../../core/business-date';
import { addMonths } from '../../../../core/fiscal-year';
import { k1RemainingBillingStart } from '../../../../core/term-limit';
import type { K1AnnualHolderSegment } from '../../../licensing/public/licensing-open-grants.types';
import { firstOfMonth } from '../labels/purchase-invoice-labels.policy';

export interface K1AnnualMonthAllocation {
  readonly month: BusinessDate;
  readonly costCenterId: string;
  readonly requestId: string | null;
}

interface BearerTransition {
  fromMonth: BusinessDate;
  costCenterId: string;
  requestId: string | null;
}

/** Collects non-null owning department ids along a K1 annual timeline. */
export function collectSegmentDepartments(segments: readonly K1AnnualHolderSegment[]): string[] {
  return [...new Set(segments.map((s) => s.owningDepartmentId).filter((id): id is string => id !== null))];
}

/**
 * Resolves the Cost Center and Request bearing each of the 12 service months for a K1 annual invoice confirmed
 * after one or more transfers (`replacedFromAssignmentId` transitions). Returns `undefined` when no transfer
 * occurred and the invoice already carries `fallbackCostCenterId`.
 */
export function resolveK1AnnualMonthAllocations(input: {
  serviceMonth: BusinessDate;
  segments: readonly K1AnnualHolderSegment[];
  costCenterByDepartment: ReadonlyMap<string, string>;
  fallbackCostCenterId: string | null;
  primaryRequestId: string;
}): K1AnnualMonthAllocation[] | undefined {
  const hasReplacement = input.segments.some((segment) => segment.replacedFromAssignmentId !== null);
  if (!hasReplacement && input.fallbackCostCenterId !== null) return undefined;

  const first = input.segments[0];
  if (!first) return undefined;
  const fallbackCc = costCenterOfSegment(first, input.costCenterByDepartment) ?? input.fallbackCostCenterId;
  if (fallbackCc === null) return undefined;

  const transitions = buildTransferTransitions(
    input.serviceMonth,
    input.segments,
    input.costCenterByDepartment,
    fallbackCc,
    input.primaryRequestId,
  );

  return Array.from({ length: 12 }, (_, index) => {
    const month = addMonths(input.serviceMonth, index);
    const bearer = bearerForMonth(transitions, month);

    return { month, costCenterId: bearer.costCenterId, requestId: bearer.requestId };
  });
}

function costCenterOfSegment(
  segment: K1AnnualHolderSegment,
  costCenterByDepartment: ReadonlyMap<string, string>,
): string | undefined {
  return segment.owningDepartmentId ? costCenterByDepartment.get(segment.owningDepartmentId) : undefined;
}

function buildTransferTransitions(
  serviceMonth: BusinessDate,
  segments: readonly K1AnnualHolderSegment[],
  costCenterByDepartment: ReadonlyMap<string, string>,
  fallbackCc: string,
  primaryRequestId: string,
): BearerTransition[] {
  const byAssignmentId = new Map(segments.map((segment) => [segment.assignmentId, segment]));
  const first = segments[0];
  const transitions: BearerTransition[] = [
    { fromMonth: serviceMonth, costCenterId: fallbackCc, requestId: first.requestId ?? primaryRequestId },
  ];

  for (const segment of segments.slice(1)) {
    if (segment.replacedFromAssignmentId === null) continue;
    const prev = byAssignmentId.get(segment.replacedFromAssignmentId);
    if (!prev?.billingAnchorOn || !prev.endedOn) continue;
    transitions.push({
      fromMonth: firstOfMonth(k1RemainingBillingStart(prev.billingAnchorOn, prev.endedOn)),
      costCenterId: costCenterOfSegment(segment, costCenterByDepartment) ?? fallbackCc,
      requestId: segment.requestId ?? primaryRequestId,
    });
  }

  return transitions.sort((a, b) => a.fromMonth.localeCompare(b.fromMonth));
}

function bearerForMonth(transitions: readonly BearerTransition[], month: BusinessDate): BearerTransition {
  let bearer = transitions[0];
  for (const transition of transitions) {
    if (transition.fromMonth <= month) bearer = transition;
  }

  return bearer;
}
