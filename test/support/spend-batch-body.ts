import type { ChecklistBody } from '../../src/modules/policies/public/policy-checklist.types';
import type { DecisionChecklists } from './decision-checklist';

/** What follows the request ids when the head sends a batch on: the confirmations of the reserve, and the checklist of the step 1.6 that goes with them. */
export type SubmitBatchRest = [
  confirmations?: { requestId: string; reason: string }[],
  checklist?: ChecklistBody | null,
];

/**
 * The body of `spendBatchSubmit`. A batch that carries confirmations of the reserve carries the checklist of the step 1.6 too: all Yes unless the
 * suite gives its own, or `null` to leave it out.
 */
export function submitBatchBody(
  checklists: DecisionChecklists,
  requestIds: string[],
  ...[confirmations, checklist]: SubmitBatchRest
) {
  if (!confirmations) return { requestIds };

  return {
    requestIds,
    reserveConfirmations: confirmations,
    ...(checklist === null ? {} : { checklist: checklist ?? checklists.yes('1.6') }),
  };
}
