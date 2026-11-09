import { PEOPLE, REQUEST_ID, event, facts } from '../../../../../test/support/request-status-facts';
import { PROJECTED_ACTIONS, plan } from './request-status-rules.policy';

const told = (planned: ReturnType<typeof plan>) =>
  planned.map((notice) => `${notice.recipientEmployeeId}:${notice.code}`);
const holders = {
  departmentHeadEmployeeId: PEOPLE.head,
  itAdminEmployeeId: PEOPLE.itAdmin,
  financeEmployeeId: PEOPLE.finance,
};

describe('what the check of the budget tells in the inbox (BR-MF1-06g, BR-MF1-06i, BR-MF1-07c)', () => {
  describe('BR-MF1-06h: the request uses the reserve and waits for the head', () => {
    it('tells the head to confirm it, and nobody else, and no figure', () => {
      const planned = plan(
        event(
          'ACCESS_REQUEST.BUDGET_CHECKED',
          { outcome: 'USES_RESERVE', overBaseBy: '5' },
          { actorEmployeeId: PEOPLE.other },
        ),
        facts(holders),
      );

      expect(told(planned)).toEqual([`${PEOPLE.head}:REQUEST_RESERVE_CONFIRMATION_NEEDED`]);
      expect(planned[0].params).toEqual({ requestId: REQUEST_ID });
    });

    it('does not tell the head who sent the batch, though they caused the event', () => {
      const planned = plan(
        event('ACCESS_REQUEST.BUDGET_CHECKED', { outcome: 'USES_RESERVE' }, { actorEmployeeId: PEOPLE.head }),
        facts(holders),
      );

      expect(planned).toEqual([]);
    });
  });

  describe('BR-MF1-06i: the request is blocked', () => {
    it('tells the one who asked and the head, with the reasons as codes and not Finance, who has no step', () => {
      const planned = plan(
        event('ACCESS_REQUEST.BUDGET_CHECKED', { outcome: 'BLOCKED', blockReasons: 'NO_APPROVED_BUDGET,OVER_RESERVE' }),
        facts(holders),
      );

      expect(told(planned)).toEqual([
        `${PEOPLE.requester}:REQUEST_BUDGET_BLOCKED`,
        `${PEOPLE.head}:REQUEST_BUDGET_BLOCKED`,
      ]);
      expect(planned.map((notice) => notice.params)).toEqual([
        { requestId: REQUEST_ID, reasons: 'NO_APPROVED_BUDGET,OVER_RESERVE' },
        { requestId: REQUEST_ID, reasons: 'NO_APPROVED_BUDGET,OVER_RESERVE' },
      ]);
    });

    it('BR-MF1-06i(iv): tells the IT Admin in charge too when the price is no longer valid', () => {
      const planned = plan(
        event('ACCESS_REQUEST.BUDGET_CHECKED', { outcome: 'BLOCKED', blockReasons: 'PRICE_EXPIRED' }),
        facts(holders),
      );

      expect(told(planned)).toEqual([
        `${PEOPLE.requester}:REQUEST_BUDGET_BLOCKED`,
        `${PEOPLE.head}:REQUEST_BUDGET_BLOCKED`,
        `${PEOPLE.itAdmin}:REQUEST_BUDGET_BLOCKED`,
      ]);
    });

    it('leaves out a role nobody can act in rather than telling somebody else', () => {
      const planned = plan(
        event('ACCESS_REQUEST.BUDGET_CHECKED', { outcome: 'BLOCKED', blockReasons: 'PRICE_EXPIRED' }),
        facts({ departmentHeadEmployeeId: null, itAdminEmployeeId: null }),
      );

      expect(told(planned)).toEqual([`${PEOPLE.requester}:REQUEST_BUDGET_BLOCKED`]);
    });
  });

  it('tells nobody when the request is within the base: the spend step is its notice', () => {
    expect(plan(event('ACCESS_REQUEST.BUDGET_CHECKED', { outcome: 'WITHIN_BASE' }), facts(holders))).toEqual([]);
  });

  describe('BR-MF1-07c, US-06-16 AC-6: the check at the decision sent the request back to the head', () => {
    it('tells the one who asked and the head, with the reasons, and not Finance', () => {
      const planned = plan(
        event(
          'ACCESS_REQUEST.SPEND_RETURNED_AT_DECISION',
          { blockReasons: 'RESERVE_UNCONFIRMED', stepId: 's-1' },
          { actorEmployeeId: PEOPLE.approver },
        ),
        facts(holders),
      );

      expect(told(planned)).toEqual([
        `${PEOPLE.requester}:REQUEST_RETURNED_AT_DECISION`,
        `${PEOPLE.head}:REQUEST_RETURNED_AT_DECISION`,
      ]);
      expect(planned[0].params).toEqual({ requestId: REQUEST_ID, reasons: 'RESERVE_UNCONFIRMED' });
    });
  });

  it('projects the two events and none of the retired ones (the review of Finance, the wait for a budget, the version that ended)', () => {
    expect(PROJECTED_ACTIONS).toEqual(
      expect.arrayContaining(['ACCESS_REQUEST.BUDGET_CHECKED', 'ACCESS_REQUEST.SPEND_RETURNED_AT_DECISION']),
    );
    expect(PROJECTED_ACTIONS).not.toContain('ACCESS_REQUEST.FINANCE_REVIEW_COMPLETED');
    expect(PROJECTED_ACTIONS).not.toContain('ACCESS_REQUEST.BUDGET_REFUSED_REVIEW_OPENED');
    expect(PROJECTED_ACTIONS).not.toContain('ACCESS_REQUEST.BUDGET_VERSION_ENDED');
  });
});
