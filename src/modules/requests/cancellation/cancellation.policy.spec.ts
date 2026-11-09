import {
  checkCancellation,
  checkTransferCancellation,
  isOpenForLeaver,
  wasTransferredFrom,
} from './cancellation.policy';
import type { AccessRequestKind, AccessRequestState } from '../access-request/access-request.types';

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

const PERSON = 'e-transferred';
const transferred = (
  state: AccessRequestState,
  over: { type?: AccessRequestKind; people?: string[]; moved?: Record<string, boolean> } = {},
) => ({
  type: over.type ?? 'GRANT',
  state,
  beneficiaryEmployeeIds: over.people ?? [PERSON],
  beneficiaryTransferred: new Map(Object.entries(over.moved ?? { [PERSON]: true })),
});

describe('which request the IT Admin closes because its beneficiary was transferred (F29, QĐ-90b)', () => {
  it.each(['PENDING', 'WAITING_CONTROLLED', 'AWAITING_EXECUTION', 'AWAITING_SPEND_DECISION', 'EXECUTING'] as const)(
    'closes the part not yet granted of a request that is %s once the person sits in another department',
    (state) => {
      expect(checkTransferCancellation(transferred(state))).toBeNull();
    },
  );

  it.each(['REJECTED', 'IT_REJECTED', 'COMPLETED', 'FAILED', 'WITHDRAWN', 'CANCELLED'] as const)(
    'does not close a request that is %s: a grant that is done goes to the held rights, not to a cancellation',
    (state) => {
      expect(checkTransferCancellation(transferred(state))).toBe('ALREADY_ENDED');
    },
  );

  it('leaves the request that waits for the IT Admin to close a withdrawal to that way', () => {
    expect(checkTransferCancellation(transferred('AWAITING_IT_CLOSE'))).toBe('WITHDRAWAL_PENDING');
  });

  it('leaves a request for a group to the closing of its lines', () => {
    expect(checkTransferCancellation(transferred('PENDING', { type: 'GROUP_GRANT' }))).toBe(
      'GROUP_REQUEST_UNSUPPORTED',
    );
  });

  it.each(['SERVICE_ACCOUNT', 'RENEWAL'] as const)('does not close a request of the kind %s this way', (type) => {
    expect(checkTransferCancellation(transferred('PENDING', { type }))).toBe('BENEFICIARY_NOT_TRANSFERRED');
  });

  it('refuses while the person was not transferred: still in the department the request was sent from, or left', () => {
    expect(checkTransferCancellation(transferred('PENDING', { moved: { [PERSON]: false } }))).toBe(
      'BENEFICIARY_NOT_TRANSFERRED',
    );
    expect(checkTransferCancellation(transferred('PENDING', { moved: {} }))).toBe('BENEFICIARY_NOT_TRANSFERRED');
  });

  it('judges a person as transferred only when they still work and sit elsewhere than where the request was sent from', () => {
    const from = 'dept-a';

    expect(wasTransferredFrom({ status: 'ACTIVE', currentDepartmentId: 'dept-b', sentFromDepartmentId: from })).toBe(
      true,
    );
    expect(wasTransferredFrom({ status: 'ACTIVE', currentDepartmentId: from, sentFromDepartmentId: from })).toBe(false);
    expect(wasTransferredFrom({ status: 'ACTIVE', currentDepartmentId: null, sentFromDepartmentId: from })).toBe(false);
    expect(
      wasTransferredFrom({ status: 'TERMINATED', currentDepartmentId: 'dept-b', sentFromDepartmentId: from }),
    ).toBe(false);
  });
});
