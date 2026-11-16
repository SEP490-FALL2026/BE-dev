import type { PolicyChecklistItem } from '../library/library.json';
import type { ChecklistDecision, ChecklistVerdict, DecisionStepCode } from '../public/policy-checklist.types';

/** The step of a policy as the version in force words it, with the version it is in. */
export interface StepInForce {
  policyCode: string;
  policyVersionId: string;
  versionNumber: number;
  step: { code: string; title: string; checklist: readonly PolicyChecklistItem[] };
}

export interface SubmittedChecklist {
  policyVersionId: string;
  answers: readonly { itemCode: string; answer: 'YES' | 'NO' }[];
}

export type ChecklistFault =
  /** The version the person was shown is not the one in force now (`409`). */
  | { kind: 'VERSION_CHANGED'; policyVersionId: string; versionNumber: number }
  /** A question of the person has no answer, or an answer names no question, a question twice, or answers the system's question with a No (`422`). */
  | { kind: 'INCOMPLETE'; missing: string[]; unexpected: string[] };

/** The longest reason a decision takes. */
export const REASON_MAX = 1000;

/**
 * Judges the answers of a decision against the version of the policy in force (`QĐ-111ap`): the version first, then that every question the
 * person answers has its one answer. The question the system answers (`SYSTEM`) is Yes by itself: the answer may be left out or given as Yes,
 * never as No. The answers come out in the order of the questions with the system's among them.
 */
export function evaluateChecklist(
  inForce: StepInForce,
  submitted: SubmittedChecklist,
): { ok: true; verdict: ChecklistVerdict } | { ok: false; fault: ChecklistFault } {
  if (submitted.policyVersionId !== inForce.policyVersionId) {
    return {
      ok: false,
      fault: {
        kind: 'VERSION_CHANGED',
        policyVersionId: inForce.policyVersionId,
        versionNumber: inForce.versionNumber,
      },
    };
  }
  const items = inForce.step.checklist;
  const known = new Map(items.map((item) => [item.code, item]));
  const given = new Map<string, 'YES' | 'NO'>();
  const unexpected: string[] = [];
  for (const { itemCode, answer } of submitted.answers) {
    const item = known.get(itemCode);
    if (!item || given.has(itemCode) || (item.check === 'SYSTEM' && answer !== 'YES')) unexpected.push(itemCode);
    else given.set(itemCode, answer);
  }
  const missing = items.filter((item) => item.check === 'PERSON' && !given.has(item.code)).map((item) => item.code);
  if (missing.length > 0 || unexpected.length > 0)
    return { ok: false, fault: { kind: 'INCOMPLETE', missing, unexpected } };

  const answers = items.map((item) => ({
    itemCode: item.code,
    answer: item.check === 'SYSTEM' ? ('YES' as const) : (given.get(item.code) ?? 'YES'),
    check: item.check,
  }));
  const noItems = items
    .filter((item) => given.get(item.code) === 'NO')
    .map((item) => ({ code: item.code, text: item.text }));

  return {
    ok: true,
    verdict: {
      policyVersionId: inForce.policyVersionId,
      versionNumber: inForce.versionNumber,
      stepCode: inForce.step.code as DecisionStepCode,
      answers,
      hasNo: noItems.length > 0,
      noItems,
    },
  };
}

/** The reason filled in from the questions answered No: each question with its code, cut to the longest reason a decision takes. */
export function autoReasonOf(items: readonly { code: string; text: string }[]): string {
  const text = items.map((item) => `${item.code} ${item.text}`).join('; ');

  return text.length <= REASON_MAX ? text : `${text.slice(0, REASON_MAX - 1)}…`;
}

/** The decisions that go on with the thing decided: a No in the checklist locks them (`QĐ-111ap`, `QĐ-111be`). */
const LOCKED_BY_NO: ReadonlySet<ChecklistDecision> = new Set([
  'APPROVE',
  'CONFIRM',
  'COMPLETE',
  'KEEP',
  'EXEMPT',
  'ESCALATE',
]);

/** A refusal and a return give their reason (`BR-07.5`); the other decisions give none of their own. */
const NEEDS_REASON: ReadonlySet<ChecklistDecision> = new Set(['REJECT', 'RETURN']);

export type DecisionJudgement =
  | { kind: 'ALLOWED'; reason: string | null }
  | { kind: 'HAS_NO'; items: { code: string; text: string }[] }
  | { kind: 'REASON_REQUIRED' };

/**
 * What the answers allow of a decision: a decision that goes on is locked when an answer is No; a refusal or a return keeps the reason the
 * person typed, and without one takes it from the questions answered No, and with neither there is none to keep.
 */
export function judgeDecision(
  verdict: ChecklistVerdict,
  asked: { decision: ChecklistDecision; reason?: string | null },
): DecisionJudgement {
  if (verdict.hasNo && LOCKED_BY_NO.has(asked.decision)) return { kind: 'HAS_NO', items: verdict.noItems };
  const typed = asked.reason?.trim() || null;
  if (!NEEDS_REASON.has(asked.decision)) return { kind: 'ALLOWED', reason: typed };
  const reason = typed ?? (verdict.hasNo ? autoReasonOf(verdict.noItems) : null);

  return reason === null ? { kind: 'REASON_REQUIRED' } : { kind: 'ALLOWED', reason };
}
