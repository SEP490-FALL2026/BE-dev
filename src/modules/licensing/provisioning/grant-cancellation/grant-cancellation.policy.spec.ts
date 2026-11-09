import { cancelReasonOf, grantCancelAction } from './grant-cancellation.policy';

describe('the reason a cancelled task keeps (F29)', () => {
  it('names the cause: the withdrawal, the departure and the transfer each have their own', () => {
    expect(cancelReasonOf('REQUESTER_WITHDREW')).toBe('REQUESTER_WITHDREW');
    expect(cancelReasonOf('BENEFICIARY_LEFT')).toBe('BENEFICIARY_LEFT');
    expect(cancelReasonOf('BENEFICIARY_TRANSFERRED')).toBe('BENEFICIARY_TRANSFERRED');
  });
});

describe('what cancelling the grant of a request does to its task (US-05-08, US-03-04 AC-25, F29)', () => {
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
    // A beneficiary who was transferred needs the confirmation of the check with the vendor for every open task, in any state.
    ['QUEUED', 'BENEFICIARY_TRANSFERRED', false, 'EVIDENCE_REQUIRED'],
    ['QUEUED', 'BENEFICIARY_TRANSFERRED', true, 'CANCEL'],
    ['RETRY_SCHEDULED', 'BENEFICIARY_TRANSFERRED', false, 'EVIDENCE_REQUIRED'],
    ['RETRY_SCHEDULED', 'BENEFICIARY_TRANSFERRED', true, 'CANCEL'],
    ['FAILED', 'BENEFICIARY_TRANSFERRED', false, 'EVIDENCE_REQUIRED'],
    ['FAILED', 'BENEFICIARY_TRANSFERRED', true, 'CANCEL'],
    ['IN_PROGRESS', 'BENEFICIARY_TRANSFERRED', false, 'EVIDENCE_REQUIRED'],
    ['IN_PROGRESS', 'BENEFICIARY_TRANSFERRED', true, 'CANCEL'],
    ['COMPLETED', 'BENEFICIARY_TRANSFERRED', true, 'COMPLETED'],
    ['CLOSED_FAILED', 'BENEFICIARY_TRANSFERRED', true, 'ENDED'],
    ['CANCELLED', 'BENEFICIARY_TRANSFERRED', false, 'ENDED'],
    // The withdrawal of the requester and the departure of the beneficiary are judged as before: no evidence needed for a task nobody works.
    ['RETRY_SCHEDULED', 'REQUESTER_WITHDREW', true, 'CANCEL'],
    ['FAILED', 'BENEFICIARY_LEFT', true, 'CANCEL'],
  ] as const)('%s with the cause %s (evidence %s) is %s', (status, cause, hasEvidence, expected) => {
    expect(grantCancelAction(status, cause, hasEvidence)).toBe(expected);
  });
});
