import { z } from 'zod';

/**
 * The seven decision steps that ask a checklist of the policy in force (`QĐ-111ap`, `QĐ-111be`, `QĐ-112a`), by the code the step has in the
 * policy of its flow. Each step belongs to exactly one policy and the library keeps the set fixed (`STEP_SET_FIXED`).
 */
export const DECISION_STEP_CODES = ['1.2', '1.3', '1.6', '1.7', '4.7', '5.3', '5.4'] as const;
export type DecisionStepCode = (typeof DECISION_STEP_CODES)[number];

/**
 * What a decision of a step is called, as the checklist keeps it beside the answers: the word of the route of the step. `APPROVE`, `CONFIRM`,
 * `COMPLETE`, `KEEP`, `EXEMPT` and `ESCALATE` go on with the thing decided and are locked by a No; `REJECT`, `RETURN` and `RECLAIM` are what is
 * left when an answer is No.
 */
export const CHECKLIST_DECISIONS = [
  'APPROVE',
  'REJECT',
  'RETURN',
  'CONFIRM',
  'COMPLETE',
  'KEEP',
  'EXEMPT',
  'RECLAIM',
  'ESCALATE',
] as const;
export type ChecklistDecision = (typeof CHECKLIST_DECISIONS)[number];

/** What a decision a checklist is kept with is about: a request (one person of a group when the line is named), a version of a budget, a recommendation of a ghost seat. */
export const CHECKLIST_SUBJECT_KINDS = ['ACCESS_REQUEST', 'BUDGET_VERSION', 'GHOST_SEAT_RECOMMENDATION'] as const;
export type ChecklistSubjectKind = (typeof CHECKLIST_SUBJECT_KINDS)[number];

/** The most answers a body carries: a step has at most 30 questions. */
export const CHECKLIST_ANSWERS_MAX = 30;

/** The checklist every decision route takes in its body (`QĐ-111ap`): the version of the policy the person was shown and one answer to each question they answer. */
export const checklistBodySchema = z
  .strictObject({
    policyVersionId: z
      .uuid()
      .meta({ description: 'The version of the policy whose questions were shown (from the step of the policy).' }),
    answers: z
      .array(z.strictObject({ itemCode: z.string().trim().min(1).max(30), answer: z.enum(['YES', 'NO']) }))
      .max(CHECKLIST_ANSWERS_MAX),
  })
  .meta({
    description:
      'The answers to the questions of the policy in force at this step. Every question the person answers needs an answer; a question the system answers is Yes by itself.',
  });
export type ChecklistBody = z.output<typeof checklistBodySchema>;

/** The answers judged against the version in force: complete, and what the No answers are. The answers keep the order of the questions and carry the ones the system answered. */
export interface ChecklistVerdict {
  policyVersionId: string;
  versionNumber: number;
  stepCode: DecisionStepCode;
  answers: { itemCode: string; answer: 'YES' | 'NO'; check: 'SYSTEM' | 'PERSON' }[];
  hasNo: boolean;
  noItems: { code: string; text: string }[];
}

/** The thing a decision was made on, for which one row of the checklist is kept. */
export interface ChecklistSubject {
  kind: ChecklistSubjectKind;
  id: string;
  /** The person of a line of a group: the checklist of the group is kept once for each of its lines. */
  lineEmployeeId?: string;
}
