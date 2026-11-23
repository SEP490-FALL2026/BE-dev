import * as requestRule from '../../src/modules/requests/access-request/withdrawal.policy';
import * as lineRule from '../../src/modules/requests/group-request/group-withdrawal.policy';

/**
 * QĐ-113d: a requester withdraws only before the first decision. What a withdrawal does once the money is held, the task is open or the
 * grant failed is still written (the system and the IT Admin reach it), but no longer reachable by the requester over HTTP. A test about
 * those consequences, or one that needs a withdrawn request as its starting point, lifts only the new refusal for the time of the test:
 * every other refusal still applies. Restore with `jest.restoreAllMocks()` (an `afterEach`).
 */
export function liftWithdrawalAfterDecisionRefusal(): void {
  const request = requestRule.checkWithdrawal;
  const line = lineRule.checkLineWithdrawal;
  jest.spyOn(requestRule, 'checkWithdrawal').mockImplementation((facts) => {
    const refusal = request(facts);

    return refusal === 'WITHDRAWAL_AFTER_DECISION' ? null : refusal;
  });
  jest.spyOn(lineRule, 'checkLineWithdrawal').mockImplementation((facts) => {
    const refusal = line(facts);

    return refusal === 'WITHDRAWAL_AFTER_DECISION' ? null : refusal;
  });
}
