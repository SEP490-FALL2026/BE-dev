import {
  PEOPLE,
  REQUEST_ID,
  delegatedFacts,
  event,
  facts,
  requestFacts,
} from '../../../../../test/support/request-status-facts';
import { plan } from './request-status-rules.policy';

const told = (planned: ReturnType<typeof plan>) =>
  planned.map((notice) => `${notice.recipientEmployeeId}:${notice.code}`);

/** `QĐ-110d`, `QĐ-110o`: the system closed the request of a person who is gone; the requester and Finance are told, not the IT Admin. */
describe('what the inbox tells when the system closed a request because its person is gone', () => {
  const left = (after: Record<string, unknown> = {}) =>
    event('ACCESS_REQUEST.CANCELLED', {
      reasonKind: 'SYSTEM_BENEFICIARY_LEFT',
      cancelledByEmployeeId: null,
      beneficiaryEmployeeId: PEOPLE.beneficiary,
      commitmentsReleased: 1,
      ...after,
    });

  it('tells the requester and Finance that a paid request of a person who left was cancelled, and not the person who left', () => {
    const planned = plan(left(), facts({ request: delegatedFacts(), financeEmployeeId: PEOPLE.finance }));

    expect(told(planned)).toEqual([
      `${PEOPLE.head}:REQUEST_CANCELLED_BENEFICIARY_GONE`,
      `${PEOPLE.finance}:REQUEST_CANCELLED_BENEFICIARY_GONE`,
    ]);
    expect(planned[0].params).toEqual({
      requestId: REQUEST_ID,
      beneficiaryEmployeeId: PEOPLE.beneficiary,
      reasonKind: 'DEPARTURE',
    });
  });

  it('tells only Finance when the person who left sent it for themselves', () => {
    const planned = plan(
      left({ beneficiaryEmployeeId: PEOPLE.requester }),
      facts({ request: requestFacts(), financeEmployeeId: PEOPLE.finance }),
    );

    expect(told(planned)).toEqual([`${PEOPLE.finance}:REQUEST_CANCELLED_BENEFICIARY_GONE`]);
  });

  it('does not tell Finance when nothing was held for the request: a free one, or one before its spend was decided', () => {
    const planned = plan(
      left({ commitmentsReleased: 0 }),
      facts({ request: delegatedFacts(), financeEmployeeId: PEOPLE.finance }),
    );

    expect(told(planned)).toEqual([`${PEOPLE.head}:REQUEST_CANCELLED_BENEFICIARY_GONE`]);
  });

  it('says transfer, and tells the person who was moved too, since they still work', () => {
    const planned = plan(
      left({ reasonKind: 'SYSTEM_BENEFICIARY_TRANSFERRED' }),
      facts({ request: delegatedFacts(), financeEmployeeId: PEOPLE.finance }),
    );

    expect(told(planned)).toEqual([
      `${PEOPLE.head}:REQUEST_CANCELLED_BENEFICIARY_GONE`,
      `${PEOPLE.beneficiary}:REQUEST_CANCELLED_BENEFICIARY_GONE`,
      `${PEOPLE.finance}:REQUEST_CANCELLED_BENEFICIARY_GONE`,
    ]);
    expect(planned[0].params).toMatchObject({ reasonKind: 'TRANSFER' });
  });

  it('tells nobody in a role that nobody holds', () => {
    const planned = plan(left(), facts({ request: delegatedFacts(), financeEmployeeId: null }));

    expect(told(planned)).toEqual([`${PEOPLE.head}:REQUEST_CANCELLED_BENEFICIARY_GONE`]);
  });

  it('tells the same for the line of one person of a request for a group, and no one else of the group', () => {
    const group = facts({
      request: requestFacts({
        type: 'GROUP_GRANT',
        requesterEmployeeId: PEOPLE.head,
        beneficiaryEmployeeIds: [PEOPLE.beneficiary, PEOPLE.holder],
      }),
      financeEmployeeId: PEOPLE.finance,
    });
    const planned = plan(
      event('ACCESS_REQUEST.LINE_CANCELLED', {
        reasonKind: 'SYSTEM_BENEFICIARY_LEFT',
        cancelledByEmployeeId: null,
        beneficiaryEmployeeId: PEOPLE.holder,
        released: true,
      }),
      group,
    );

    expect(told(planned)).toEqual([
      `${PEOPLE.head}:REQUEST_CANCELLED_BENEFICIARY_GONE`,
      `${PEOPLE.finance}:REQUEST_CANCELLED_BENEFICIARY_GONE`,
    ]);
    expect(planned[0].params).toEqual({
      requestId: REQUEST_ID,
      beneficiaryEmployeeId: PEOPLE.holder,
      reasonKind: 'DEPARTURE',
    });
  });

  it('leaves the closing by the IT Admin as it was: the requester and the person, with the generic notice', () => {
    const planned = plan(
      event('ACCESS_REQUEST.CANCELLED', { reasonKind: 'BENEFICIARY_LEFT', cancelledByEmployeeId: PEOPLE.itAdmin }),
      facts({ request: delegatedFacts(), financeEmployeeId: PEOPLE.finance }),
    );

    expect(told(planned)).toEqual([`${PEOPLE.head}:REQUEST_CANCELLED`, `${PEOPLE.beneficiary}:REQUEST_CANCELLED`]);
  });
});
