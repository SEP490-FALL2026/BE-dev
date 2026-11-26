import { addDays, type BusinessDate } from '../../../../core/business-date';
import { addMonths } from '../../../../core/fiscal-year';
import type { PeriodAdjustment, RenewalPeriodFacts } from '../../../catalog/public/subscription-period.types';
import type { RecordRefusal } from '../record/renewal-record.policy';
import type { RenewalChoice } from '../subscription-renewal.types';

/** Per-line seat need inputs gathered at a renewal point. */
export interface LineNeedInputs {
  subscriptionLineId: string;
  planId: string;
  seatsToday: number;
  seatsAtDeadline: number;
  minimumSeats: number | null;
  heldPastRenewal: number;
  pendingContinuations: number;
  approvedAwaitingGrantForLine: number;
}

/** Computed need and target for one subscription line. */
export interface ComputedLineTarget {
  subscriptionLineId: string;
  planId: string;
  seatsToday: number;
  seatsAtDeadline: number;
  minimumSeats: number | null;
  need: number;
  target: number;
}

export type LineAdjustmentLabel = 'REDUCIBLE' | 'LOCKED_UNTIL';

export interface ProposedLineItem {
  subscriptionLineId: string;
  quantity: number;
}

export interface LineProposalDecision {
  subscriptionLineId: string;
  seatsNeeded: number;
  target: number;
  recordedQuantity: number;
}

export type LineProposalVerdict =
  | { refusal: RecordRefusal }
  | {
      accepted: {
        choice: RenewalChoice;
        quantity: number | null;
        totalQuantity: number;
        totalSeatsToday: number;
        lineDecisions: LineProposalDecision[];
      };
    };

/** `need(L) = heldPastRenewal + pendingContinuations + approvedAwaitingGrant(chooseLine -> L)`. */
export function lineNeedOf(
  input: Pick<LineNeedInputs, 'heldPastRenewal' | 'pendingContinuations' | 'approvedAwaitingGrantForLine'>,
): number {
  return input.heldPastRenewal + input.pendingContinuations + input.approvedAwaitingGrantForLine;
}

/** `target(L) = 0` if `need = 0`, else `max(need, minimumSeats ?? 0)`. */
export function lineTargetOf(need: number, minimumSeats: number | null): number {
  return need === 0 ? 0 : Math.max(need, minimumSeats ?? 0);
}

/** `shortfall = max(0, minimumSeatsTotal - sum(target))` when at least one line stays needed, else `0`. */
export function shortfallOf(targets: readonly number[], minimumSeatsTotal: number | null): number {
  if (minimumSeatsTotal === null || minimumSeatsTotal <= 0) return 0;
  const sumTarget = targets.reduce((sum, value) => sum + value, 0);
  if (sumTarget === 0) return 0;

  return Math.max(0, minimumSeatsTotal - sumTarget);
}

/** Computes per-line needs, targets, and workspace-level `shortfall`. */
export function computeLineTargets(
  lines: readonly LineNeedInputs[],
  minimumSeatsTotal: number | null,
): { lines: ComputedLineTarget[]; shortfall: number } {
  const computed = lines.map((line) => {
    const need = lineNeedOf(line);

    return {
      subscriptionLineId: line.subscriptionLineId,
      planId: line.planId,
      seatsToday: line.seatsToday,
      seatsAtDeadline: line.seatsAtDeadline,
      minimumSeats: line.minimumSeats,
      need,
      target: lineTargetOf(need, line.minimumSeats),
    };
  });

  return {
    lines: computed,
    shortfall: shortfallOf(
      computed.map((item) => item.target),
      minimumSeatsTotal,
    ),
  };
}

/** Whether a proposal is late for an annual commitment period (`R-LATE`: 12-month commitment after deadline). */
export function isLateAnnualProposal(
  adjustment: Pick<PeriodAdjustment, 'commitment' | 'deadline'>,
  today: BusinessDate,
): boolean {
  return adjustment.commitment === 'ANNUAL' && today > adjustment.deadline;
}

/** Adjustment label (`REDUCIBLE` / `LOCKED_UNTIL`) for a line whose current seats exceed its target, else `null`. */
export function lineAdjustmentLabelOf(
  adjustment: Pick<PeriodAdjustment, 'point' | 'deadline'> | null,
  today: BusinessDate,
  seatsToday: number,
  target: number,
): LineAdjustmentLabel | null {
  if (adjustment === null || seatsToday <= target) return null;

  return today >= adjustment.point && today <= adjustment.deadline ? 'REDUCIBLE' : 'LOCKED_UNTIL';
}

/** Derives renewal `choice` and header `quantity` from proposed total seats vs current seats. */
export function deriveChoiceFromTotals(
  totalProposed: number,
  totalSeatsToday: number | null,
): { choice: RenewalChoice; quantity: number | null } {
  if (totalProposed === 0) return { choice: 'CANCEL', quantity: null };
  if (totalSeatsToday === null || totalProposed === totalSeatsToday)
    return { choice: 'RENEW', quantity: totalProposed };

  return totalProposed < totalSeatsToday
    ? { choice: 'REDUCE', quantity: totalProposed }
    : { choice: 'INCREASE', quantity: totalProposed };
}

function mapProposedByLine(
  targets: readonly ComputedLineTarget[],
  proposedLines: readonly ProposedLineItem[],
): Map<string, number> | null {
  if (proposedLines.length !== targets.length) return null;
  const known = new Set(targets.map((line) => line.subscriptionLineId));
  const byId = new Map<string, number>();
  for (const item of proposedLines) {
    if (!known.has(item.subscriptionLineId) || byId.has(item.subscriptionLineId) || item.quantity < 0) return null;
    byId.set(item.subscriptionLineId, item.quantity);
  }

  return byId.size === targets.length ? byId : null;
}

function validateLateAnnualProposal(
  targets: readonly ComputedLineTarget[],
  byId: ReadonlyMap<string, number>,
): RecordRefusal | null {
  const violations = targets
    .filter((line) => (byId.get(line.subscriptionLineId) ?? 0) < line.seatsAtDeadline)
    .map((line) => ({ subscriptionLineId: line.subscriptionLineId, minimum: line.seatsAtDeadline }));

  return violations.length > 0 ? { problem: 'REDUCTION_AFTER_DEADLINE', details: { lines: violations } } : null;
}

function hasText(value: string | null | undefined): boolean {
  return (value ?? '').trim() !== '';
}

function findLineMismatches(
  targets: readonly ComputedLineTarget[],
  byId: ReadonlyMap<string, number>,
  shortfall: number,
  holderLineId?: string | null,
): { subscriptionLineId: string; target: number; quantity: number }[] {
  const mismatches: { subscriptionLineId: string; target: number; quantity: number }[] = [];
  for (const line of targets) {
    const holderBonus = shortfall > 0 && line.subscriptionLineId === holderLineId ? shortfall : 0;
    const expected = line.target + holderBonus;
    const actual = byId.get(line.subscriptionLineId) ?? 0;
    if (actual !== expected) {
      mismatches.push({ subscriptionLineId: line.subscriptionLineId, target: expected, quantity: actual });
    }
  }
  return mismatches;
}

function validateBeforeDeadlineProposal(input: {
  targets: readonly ComputedLineTarget[];
  shortfall: number;
  byId: ReadonlyMap<string, number>;
  minimumTotalHolderLineId?: string | null;
  minimumTotalNote?: string | null;
  note?: string | null;
}): RecordRefusal | null {
  if (input.shortfall > 0) {
    const holderValid = Boolean(input.minimumTotalHolderLineId && input.byId.has(input.minimumTotalHolderLineId));
    if (!holderValid || !(hasText(input.minimumTotalNote) || hasText(input.note))) {
      return { problem: 'VENDOR_MINIMUM_EVIDENCE_REQUIRED', details: { shortfall: input.shortfall } };
    }
  }

  const mismatches = findLineMismatches(input.targets, input.byId, input.shortfall, input.minimumTotalHolderLineId);
  if (mismatches.length > 0) return { problem: 'LINE_QUANTITY_NOT_TARGET', details: { lines: mismatches } };

  const minLine = input.targets.find((line) => line.target > line.need);
  if (minLine && !hasText(input.note) && !hasText(input.minimumTotalNote)) {
    return {
      problem: 'VENDOR_MINIMUM_EVIDENCE_REQUIRED',
      details: { subscriptionLineId: minLine.subscriptionLineId, need: minLine.need, target: minLine.target },
    };
  }

  return null;
}

/** Validates per-line proposed quantities before/on deadline and under R-LATE. */
export function validateProposeLines(input: {
  targets: readonly ComputedLineTarget[];
  shortfall: number;
  adjustment: Pick<PeriodAdjustment, 'commitment' | 'deadline'>;
  today: BusinessDate;
  proposedLines: readonly ProposedLineItem[];
  minimumTotalHolderLineId?: string | null;
  minimumTotalNote?: string | null;
  note?: string | null;
}): LineProposalVerdict {
  const byId = mapProposedByLine(input.targets, input.proposedLines);
  if (!byId) return { refusal: { problem: 'QUANTITY_INVALID' } };

  const refusal = isLateAnnualProposal(input.adjustment, input.today)
    ? validateLateAnnualProposal(input.targets, byId)
    : validateBeforeDeadlineProposal({ ...input, byId });
  if (refusal) return { refusal };

  const totalSeatsToday = input.targets.reduce((sum, line) => sum + line.seatsToday, 0);
  const lineDecisions = input.targets.map((line) => {
    const holderBonus =
      input.shortfall > 0 && line.subscriptionLineId === input.minimumTotalHolderLineId ? input.shortfall : 0;

    return {
      subscriptionLineId: line.subscriptionLineId,
      seatsNeeded: line.need,
      target: line.target + holderBonus,
      recordedQuantity: byId.get(line.subscriptionLineId) ?? 0,
    };
  });
  const totalQuantity = lineDecisions.reduce((sum, line) => sum + line.recordedQuantity, 0);
  const { choice, quantity } = deriveChoiceFromTotals(totalQuantity, totalSeatsToday);

  return { accepted: { choice, quantity, totalQuantity, totalSeatsToday, lineDecisions } };
}

/** Validates outcome `nextPeriod.lines` quantities against proposed per-line quantities (`422 QUANTITY_INVALID`). */
export function validateOutcomeLines(
  proposedByLine: ReadonlyMap<string, number>,
  outcomeLines: readonly ProposedLineItem[],
): RecordRefusal | null {
  if (outcomeLines.length !== proposedByLine.size) {
    return {
      problem: 'QUANTITY_INVALID',
      details: { expectedLines: proposedByLine.size, givenLines: outcomeLines.length },
    };
  }
  const seen = new Set<string>();
  const mismatches: { subscriptionLineId: string; proposed: number | null; quantity: number }[] = [];
  for (const item of outcomeLines) {
    if (seen.has(item.subscriptionLineId) || !proposedByLine.has(item.subscriptionLineId)) {
      mismatches.push({ subscriptionLineId: item.subscriptionLineId, proposed: null, quantity: item.quantity });
      continue;
    }
    seen.add(item.subscriptionLineId);
    const proposed = proposedByLine.get(item.subscriptionLineId)!;
    if (item.quantity !== proposed) {
      mismatches.push({ subscriptionLineId: item.subscriptionLineId, proposed, quantity: item.quantity });
    }
  }

  return mismatches.length > 0 ? { problem: 'QUANTITY_INVALID', details: { lines: mismatches } } : null;
}

/** Shifts period dates forward by one commitment term for system auto-renewal (Ca B). */
function resolveAutoStartDate(
  period: Pick<RenewalPeriodFacts, 'renewalDate' | 'endDate'>,
  adjustmentEnd: BusinessDate,
): BusinessDate {
  if (period.renewalDate !== null) return adjustmentEnd;
  return period.endDate !== null ? addDays(period.endDate, 1) : adjustmentEnd;
}

function optionalAutoDates(
  period: Pick<RenewalPeriodFacts, 'renewalDate' | 'endDate' | 'notice' | 'noticePeriodDays'>,
  startDate: BusinessDate,
  termMonths: number,
) {
  const endDate = period.endDate !== null ? addDays(addMonths(startDate, termMonths), -1) : undefined;
  const renewalDate = period.renewalDate !== null ? addMonths(startDate, termMonths) : undefined;
  const noticeDeadline =
    period.notice.source === 'DECLARED' && period.notice.deadline !== null
      ? addMonths(period.notice.deadline, termMonths)
      : undefined;

  return {
    ...(endDate !== undefined ? { endDate } : {}),
    ...(renewalDate !== undefined ? { renewalDate } : {}),
    ...(noticeDeadline !== undefined ? { noticeDeadline } : {}),
    ...(period.noticePeriodDays != null ? { noticePeriodDays: period.noticePeriodDays } : {}),
  };
}

export function nextPeriodDatesForAutoRenewal(
  period: Pick<
    RenewalPeriodFacts,
    'commitmentTermMonths' | 'billingCycle' | 'renewalDate' | 'endDate' | 'notice' | 'noticePeriodDays'
  >,
  adjustment: Pick<PeriodAdjustment, 'commitment' | 'end'>,
): {
  billingCycle: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' | 'OTHER';
  startDate: BusinessDate;
  endDate?: BusinessDate;
  renewalDate?: BusinessDate;
  noticeDeadline?: BusinessDate;
  noticePeriodDays?: number;
} {
  const isMonthly = adjustment.commitment === 'MONTHLY';
  const termMonths = period.commitmentTermMonths ?? (isMonthly ? 1 : 12);
  const startDate = resolveAutoStartDate(period, adjustment.end);

  return {
    billingCycle: period.billingCycle ?? (isMonthly ? 'MONTHLY' : 'ANNUAL'),
    startDate,
    ...optionalAutoDates(period, startDate, termMonths),
  };
}
