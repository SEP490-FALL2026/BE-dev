import {
  PEOPLE,
  REQUEST_ID,
  event,
  facts,
  requestFacts,
} from '../../../../test/support/request-status-facts';
import { PROJECTED_ACTIONS, plan } from './request-status.policy';

const told = (planned: ReturnType<typeof plan>) =>
  planned.map((notice) => `${notice.recipientEmployeeId}:${notice.code}`);
const holders = { financeEmployeeId: PEOPLE.finance, departmentHeadEmployeeId: PEOPLE.head };

describe('the loop between Finance and the head about the money of a request (F67, QĐ-92b, rows 41, 47, 48)', () => {
  describe('the request enters the review of Finance (row 41)', () => {
    it.each(['ACCESS_REQUEST.BUDGET_CHECKED', 'ACCESS_REQUEST.BUDGET_REFUSED_REVIEW_OPENED'])(
      'tells Finance and the head, in the event %s, where it stands and nothing of the check',
      (action) => {
        const planned = plan(
          event(action, { opened: 'FINANCE_REVIEW', codes: 'INSUFFICIENT_BUDGET', trigger: 'SUBMISSION' }),
          facts(holders),
        );

        expect(told(planned)).toEqual([
          `${PEOPLE.finance}:REQUEST_FINANCE_REVIEW_OPENED`,
          `${PEOPLE.head}:REQUEST_FINANCE_REVIEW_OPENED`,
        ]);
        expect(planned.map((notice) => notice.params)).toEqual([
          { requestId: REQUEST_ID, stepKind: 'FINANCE_REVIEW' },
          { requestId: REQUEST_ID, stepKind: 'FINANCE_REVIEW' },
        ]);
      },
    );

    it('does not tell the head who sent the batch, though they caused the event', () => {
      const planned = plan(
        event('ACCESS_REQUEST.BUDGET_CHECKED', { opened: 'FINANCE_REVIEW' }, { actorEmployeeId: PEOPLE.head }),
        facts(holders),
      );

      expect(told(planned)).toEqual([`${PEOPLE.finance}:REQUEST_FINANCE_REVIEW_OPENED`]);
    });

    it.each([['SPEND_APPROVAL'], [null]])('tells nobody when the check opened %s and so no review', (opened) => {
      expect(plan(event('ACCESS_REQUEST.BUDGET_CHECKED', { opened }), facts(holders))).toEqual([]);
    });

    it('leaves out a role nobody can act in rather than telling somebody else', () => {
      const planned = plan(
        event('ACCESS_REQUEST.BUDGET_CHECKED', { opened: 'FINANCE_REVIEW' }),
        facts({ financeEmployeeId: null, departmentHeadEmployeeId: PEOPLE.head }),
      );

      expect(told(planned)).toEqual([`${PEOPLE.head}:REQUEST_FINANCE_REVIEW_OPENED`]);
    });
  });

  describe('Finance gives the request back (row 47)', () => {
    it('tells the head, with the reason Finance gave, and nobody else', () => {
      const planned = plan(
        event(
          'ACCESS_REQUEST.FINANCE_REVIEW_COMPLETED',
          { outcome: 'RETURNED_TO_HEAD', reason: 'Add the quote of the vendor', checkId: 'c-1' },
          { actorEmployeeId: PEOPLE.finance },
        ),
        facts(holders),
      );

      expect(told(planned)).toEqual([`${PEOPLE.head}:REQUEST_RETURNED_BY_FINANCE`]);
      expect(planned[0].params).toEqual({ requestId: REQUEST_ID, reason: 'Add the quote of the vendor' });
    });
  });

  describe('the request waits for a budget (row 48)', () => {
    it('tells the head that it waits, with the Cost Center and the year, and no figure', () => {
      const planned = plan(
        event(
          'ACCESS_REQUEST.FINANCE_REVIEW_COMPLETED',
          { outcome: 'BUDGET_REVISION_NEEDED', costCenterId: 'cc-1', year: 2026 },
          { actorEmployeeId: PEOPLE.finance },
        ),
        facts(holders),
      );

      expect(told(planned)).toEqual([`${PEOPLE.head}:REQUEST_AWAITING_BUDGET`]);
      expect(planned[0].params).toEqual({ requestId: REQUEST_ID, costCenterId: 'cc-1', year: 2026 });
      expect(JSON.stringify(planned[0].params)).not.toMatch(/amount|budget_|remaining|figure/i);
    });

    it.each([
      ['REJECTED', 2026],
      ['CHANGES_REQUESTED', 2026],
      ['EXPIRED', 2025],
    ])('tells Finance that the version it waited for ended as %s', (decision, year) => {
      const planned = plan(
        event('ACCESS_REQUEST.BUDGET_VERSION_ENDED', { versionId: 'v-1', costCenterId: 'cc-1', year, decision }),
        facts(holders),
      );

      expect(told(planned)).toEqual([`${PEOPLE.finance}:REQUEST_BUDGET_VERSION_ENDED`]);
      expect(planned[0].params).toEqual({
        requestId: REQUEST_ID,
        versionId: 'v-1',
        costCenterId: 'cc-1',
        year,
        decision,
      });
    });

    it('tells Finance of a version that expired though nobody acted, the system being the actor', () => {
      const planned = plan(
        event('ACCESS_REQUEST.BUDGET_VERSION_ENDED', { versionId: 'v-1', costCenterId: 'cc-1', year: 2026, decision: 'EXPIRED' }),
        facts({ ...holders, request: requestFacts() }),
      );

      expect(planned).toHaveLength(1);
    });
  });

  it('does not tell anybody of the outcomes that are not for them: an opinion, a plan line moved', () => {
    for (const outcome of ['ASSESSED', 'LINE_UPDATED']) {
      expect(plan(event('ACCESS_REQUEST.FINANCE_REVIEW_COMPLETED', { outcome }), facts(holders))).toEqual([]);
    }
  });

  it('reads these four actions from the Audit Trail, and nothing the loop does not tell', () => {
    expect(PROJECTED_ACTIONS).toEqual(
      expect.arrayContaining([
        'ACCESS_REQUEST.BUDGET_CHECKED',
        'ACCESS_REQUEST.BUDGET_REFUSED_REVIEW_OPENED',
        'ACCESS_REQUEST.FINANCE_REVIEW_COMPLETED',
        'ACCESS_REQUEST.BUDGET_VERSION_ENDED',
      ]),
    );
    expect(new Set(PROJECTED_ACTIONS).size).toBe(PROJECTED_ACTIONS.length);
  });
});
