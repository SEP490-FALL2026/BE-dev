import { checkCancellation, isOpenForLeaver } from './cancellation.policy';
import type { AccessRequestKind, AccessRequestState } from './access-request.types';

const LEAVER = 'e-leaver';
const facts = (
  state: AccessRequestState,
  over: { type?: AccessRequestKind; people?: string[]; left?: Record<string, boolean> } = {},
) => ({
  type: over.type ?? 'GRANT',
  state,
  beneficiaryEmployeeIds: over.people ?? [LEAVER],
  beneficiaryLeft: new Map(Object.entries(over.left ?? { [LEAVER]: true })),
});

describe('which request the IT Admin closes because its beneficiary left (US-03-04 AC-25)', () => {
  it.each(['PENDING', 'WAITING_CONTROLLED', 'AWAITING_EXECUTION', 'AWAITING_SPEND_DECISION', 'EXECUTING'] as const)(
    'closes a request that is %s once the person has left',
    (state) => {
      expect(checkCancellation(facts(state))).toBeNull();
    },
  );

  it.each(['REJECTED', 'IT_REJECTED', 'COMPLETED', 'FAILED', 'WITHDRAWN', 'CANCELLED'] as const)(
    'has nothing to close once the request is %s',
    (state) => {
      expect(checkCancellation(facts(state))).toBe('ALREADY_ENDED');
    },
  );

  it('leaves the request that waits for the IT Admin to close the task of a withdrawal to that way', () => {
    expect(checkCancellation(facts('AWAITING_IT_CLOSE'))).toBe('WITHDRAWAL_PENDING');
  });

  it('refuses a request for a group, however many have left', () => {
    expect(checkCancellation(facts('PENDING', { type: 'GROUP_GRANT' }))).toBe('GROUP_REQUEST_UNSUPPORTED');
    expect(
      checkCancellation(facts('PENDING', { people: [LEAVER, 'e-2'], left: { [LEAVER]: true, 'e-2': true } })),
    ).toBe('GROUP_REQUEST_UNSUPPORTED');
  });

  it('refuses while the person still works, handing over included', () => {
    expect(checkCancellation(facts('PENDING', { left: { [LEAVER]: false } }))).toBe('BENEFICIARY_NOT_LEFT');
    expect(checkCancellation(facts('PENDING', { left: {} }))).toBe('BENEFICIARY_NOT_LEFT');
  });

  it('judges the end before the person, so a request that is over has one answer', () => {
    expect(checkCancellation(facts('WITHDRAWN', { left: { [LEAVER]: false } }))).toBe('ALREADY_ENDED');
  });

  it('counts a request as open for the leaver unless it ended or waits to be closed as withdrawn', () => {
    expect(isOpenForLeaver('AWAITING_SPEND_SUBMISSION')).toBe(true);
    expect(isOpenForLeaver('EXECUTING')).toBe(true);
    expect(isOpenForLeaver('AWAITING_IT_CLOSE')).toBe(false);
    expect(isOpenForLeaver('CANCELLED')).toBe(false);
    expect(isOpenForLeaver('COMPLETED')).toBe(false);
  });
});
