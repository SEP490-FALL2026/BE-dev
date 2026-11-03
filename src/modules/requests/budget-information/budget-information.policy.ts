import { checkSpendDecider } from '../spend/spend-decision.policy';
import type { AnswerRefusal, AskRefusal } from '../spend/spend.errors';

/**
 * The rules of the question the spending approver puts to Finance and of Finance's answer (`US-06-02`, `US-06-03`), as pure
 * decisions. The question is optional advice: it never stops the step, its SLA or the decision, and the answer never decides
 * or changes the snapshot.
 */

/** Only the person the spend step is given to asks, while it is theirs to decide (`US-06-02` AC-1). */
export function checkAsk(facts: {
  actorEmployeeId: string;
  requesterEmployeeId: string;
  beneficiaryEmployeeIds: readonly string[];
  assigneeEmployeeId: string | null;
  stepState: string;
  hasOpenQuestion: boolean;
}): AskRefusal | null {
  // Asking Finance is not one of the four decisions the freeze refuses: a frozen step does not stop the question.
  const holder = checkSpendDecider({ ...facts, stepAwaitsConversion: false });
  if (holder !== null && holder !== 'STEP_AWAITING_CONVERSION') return holder;

  return facts.hasOpenQuestion ? 'ALREADY_OPEN' : null;
}

export function checkAnswer(facts: {
  actorIsFinance: boolean;
  actorEmployeeId: string;
  requesterEmployeeId: string;
  beneficiaryEmployeeIds: readonly string[];
  /** The person the spend step is given to and whoever holds the spending approver role now. */
  approverEmployeeIds: readonly (string | null)[];
  questionState: string;
}): AnswerRefusal | null {
  if (!facts.actorIsFinance) return 'NOT_FINANCE';
  if (
    facts.actorEmployeeId === facts.requesterEmployeeId ||
    facts.beneficiaryEmployeeIds.includes(facts.actorEmployeeId)
  ) {
    return 'OWN_REQUEST';
  }
  if (facts.approverEmployeeIds.includes(facts.actorEmployeeId)) return 'SOD_APPROVER';

  return facts.questionState === 'OPEN' ? null : 'NOT_OPEN';
}
