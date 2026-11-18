import type { ChecklistContext, ChecklistDecision, DecisionStepCode } from '../public/policy-checklist.types';

/** The guard behind a question the system answers, and the decisions or requests it does not guard. */
export interface SystemGuard {
  /** What in the system checks it, in words (the table of the correspondence: `PL-2-O3`). */
  guard: string;
  /** The decisions that do not make the check, so the answer kept for them is not Yes. */
  unchecked?: readonly ChecklistDecision[];
  /** The question does not apply to a request that has no step of the head. */
  uncheckedWhenOneStep?: true;
}

const SPEND_REFUSED_OR_RETURNED = ['REJECT', 'RETURN'] as const;

/**
 * The sixteen questions the system answers in the initial policies (`SYSTEM`; the library lets a company keep or drop them, never add one) and the
 * guard behind each (`QĐ-111ap`; Bộ chính sách khởi tạo, "Đã chốt" mục 8: a question the system answers is ticked only where the system blocks
 * for real). A question is kept as Yes when the guard has run for the decision being made; where a decision does not run it, the answer kept is
 * "not checked", so the record never says the system checked what it did not.
 */
export const SYSTEM_GUARDS: Readonly<Record<string, SystemGuard>> = {
  '1.2-01': {
    guard:
      'the step is given to the head in office of the department, who is no party to the request (need decision, SoD)',
  },
  '1.2-02': {
    guard:
      'the eligibility of the people (GH-1, GH-2) and the duplicate check of a software of case B, both at the sending of the request',
  },
  '1.2-03': {
    guard:
      'the Cost Center in use of the department and the commitment of the request against it, at the sending of the request',
  },
  '1.3-01': {
    guard: 'the step of the IT Admin opens only after the step of the head is approved',
    uncheckedWhenOneStep: true,
  },
  '1.3-02': {
    guard:
      'the duplicate check of the proposal against the catalog (normalised name, domain) at its declaration, which links the request to the item',
  },
  '1.6-01': {
    guard:
      'the check of the budget made again at the confirmation: a confirmation is kept only when the request still uses the reserve',
  },
  '1.6-02': { guard: 'the confirmer is no beneficiary of the request (confirmation of the reserve)' },
  '1.7-01': {
    guard: 'the spend step is given to the spending approver, who is neither the requester nor a beneficiary (SoD)',
  },
  '1.7-02': {
    guard: 'the budget check made again at the decision prices the request (package or quote still valid, VND)',
    unchecked: SPEND_REFUSED_OR_RETURNED,
  },
  '1.7-03': {
    guard: 'the budget check made again at the decision: within the base, or the reserve confirmed by the head',
    unchecked: SPEND_REFUSED_OR_RETURNED,
  },
  '4.7-01': { guard: 'the decider is the spending approver and neither built nor sent the version (SoD)' },
  '4.7-02': {
    guard:
      'the sum of the versions of the year against the annual ceiling less the shared-pool reserve, made again when a version is approved',
    unchecked: ['RETURN'],
  },
  '5.3-01': {
    guard:
      'the push lets through only a recommendation of the watch tier that passed the eight gates; the others are skipped',
  },
  '5.3-02': {
    guard:
      'the recommendation is made only for a right with more than a month left of the time of use (gate TIME_BOUND_ENDING); the push does not make it again',
    unchecked: ['ESCALATE'],
  },
  '5.4-01': { guard: 'the decider is the head in office of the department of the holder of the seat' },
  '5.4-02': { guard: 'a recommendation is written with its evidence snapshot' },
};

/**
 * The codes of the questions the system answers that this decision did not check, in the order of the table: what the verdict keeps as not
 * checked instead of Yes. Nothing for a decision that goes on, which runs every guard of its step.
 */
export function uncheckedSystemItems(
  stepCode: DecisionStepCode,
  decision: ChecklistDecision,
  context: ChecklistContext = {},
): string[] {
  return Object.entries(SYSTEM_GUARDS)
    .filter(([code]) => code.startsWith(`${stepCode}-`))
    .filter(
      ([, guard]) =>
        guard.unchecked?.includes(decision) === true ||
        (guard.uncheckedWhenOneStep === true && context.oneStep === true),
    )
    .map(([code]) => code);
}
