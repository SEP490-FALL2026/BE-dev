import { grantCancelAction } from './grant-cancellation.policy';

describe('what cancelling the grant of a request does to its task (US-05-08, US-03-04 AC-25)', () => {
  it.each([
    ['QUEUED', 'REQUESTER_WITHDREW', false, 'CANCEL'],
    ['QUEUED', 'BENEFICIARY_LEFT', false, 'CANCEL'],
    ['RETRY_SCHEDULED', 'REQUESTER_WITHDREW', false, 'CANCEL'],
    ['RETRY_SCHEDULED', 'BENEFICIARY_LEFT', false, 'CANCEL'],
    ['FAILED', 'REQUESTER_WITHDREW', false, 'WAIT_FOR_IT_ADMIN'],
    ['FAILED', 'BENEFICIARY_LEFT', false, 'CANCEL'],
    ['IN_PROGRESS', 'REQUESTER_WITHDREW', true, 'RUNNING'],
    ['IN_PROGRESS', 'BENEFICIARY_LEFT', false, 'EVIDENCE_REQUIRED'],
    ['IN_PROGRESS', 'BENEFICIARY_LEFT', true, 'CANCEL'],
    ['COMPLETED', 'REQUESTER_WITHDREW', false, 'COMPLETED'],
    ['COMPLETED', 'BENEFICIARY_LEFT', true, 'COMPLETED'],
    ['CLOSED_FAILED', 'BENEFICIARY_LEFT', true, 'ENDED'],
    ['CANCELLED', 'REQUESTER_WITHDREW', false, 'ENDED'],
  ] as const)('%s with the cause %s (evidence %s) is %s', (status, cause, hasEvidence, expected) => {
    expect(grantCancelAction(status, cause, hasEvidence)).toBe(expected);
  });
});
