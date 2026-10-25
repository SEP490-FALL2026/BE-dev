import { checkSpendDecider } from './spend-decision.policy';

/**
 * The rules of the question the spending approver puts to Finance and of Finance's answer (`US-06-02`, `US-06-03`), as pure
 * decisions. The question is optional advice: it never stops the step, its SLA or the decision, and the answer never decides
 * or changes the snapshot.
 */

export type AskRefusal =
  | 'OWN_REQUEST'
  | 'NOT_THE_ASSIGNEE'
  | 'STEP_NOT_PENDING'
  /** A question of this step is still waiting for Finance; the approver asks the next one after the answer. */
  | 'ALREADY_OPEN';

/** Only the person the spend step is given to asks, while it is theirs to decide (`US-06-02` AC-1). */
export function checkAsk(facts: {
  actorEmployeeId: string;
  requesterEmployeeId: string;
  beneficiaryEmployeeIds: readonly string[];
  assigneeEmployeeId: string | null;
  stepState: string;
  hasOpenQuestion: boolean;
}): AskRefusal | null {
  const holder = checkSpendDecider(facts);
  if (holder) return holder;

  return facts.hasOpenQuestion ? 'ALREADY_OPEN' : null;
}

export type AnswerRefusal =
  | 'NOT_FINANCE'
  /** Finance is a party to the request: it asked for the access or is given it. */
  | 'OWN_REQUEST'
  /** The one who answers also decides the request as the spending approver (`SoD-8`, `US-06-03` AC-4). */
  | 'SOD_APPROVER'
  /** The question was answered or closed; a request that went away takes its question with it (`US-06-03` AC-6). */
  | 'NOT_OPEN';

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
