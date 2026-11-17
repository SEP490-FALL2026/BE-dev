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

describe('what the inbox tells the holder of a step that was opened again or asked for by the proposal of a head', () => {
  describe('the request was sent again after it was returned (B1)', () => {
    const OTHER_HEAD = 'a0000000-0000-4000-8000-0000000000a1';

    it('gives the step of the assessment to the IT Admin who holds it, and tells nobody else', () => {
      const planned = plan(
        event(
          'ACCESS_REQUEST.RESUBMITTED',
          { reopenedStepKind: 'IT_ASSESSMENT', requestState: 'AWAITING_IT_ASSESSMENT' },
          { actorEmployeeId: PEOPLE.requester },
        ),
        facts({ request: requestFacts({ branch: 'NEW_SOFTWARE' }), assessmentHolderEmployeeId: PEOPLE.itAdmin }),
      );

      expect(told(planned)).toEqual([`${PEOPLE.itAdmin}:STEP_ASSIGNED`]);
      expect(planned[0].params).toEqual({ requestId: REQUEST_ID, stepKind: 'IT_ASSESSMENT', cause: 'RESUBMITTED' });
    });

    it('tells nobody of an assessment step that nobody holds', () => {
      const planned = plan(
        event(
          'ACCESS_REQUEST.RESUBMITTED',
          { reopenedStepKind: 'IT_ASSESSMENT' },
          { actorEmployeeId: PEOPLE.requester },
        ),
        facts({ request: requestFacts({ branch: 'NEW_SOFTWARE' }), assessmentHolderEmployeeId: null }),
      );

      expect(planned).toEqual([]);
    });

    it('gives each need step that was opened again to the person who holds it, once for a person who holds two', () => {
      const planned = plan(
        event(
          'ACCESS_REQUEST.RESUBMITTED',
          {
            reopenedStepIds: 'step-1,step-2,step-3',
            assigneeEmployeeIds: `${PEOPLE.head},${OTHER_HEAD},${PEOPLE.head}`,
          },
          { actorEmployeeId: PEOPLE.requester },
        ),
        facts(),
      );

      expect(told(planned)).toEqual([`${PEOPLE.head}:STEP_ASSIGNED`, `${OTHER_HEAD}:STEP_ASSIGNED`]);
      expect(planned[0].params).toEqual({ requestId: REQUEST_ID, stepKind: 'NEED', cause: 'RESUBMITTED' });
    });

    it('does not tell the person who sent it again, even when they hold the step, and tells nobody of a step nobody holds', () => {
      const own = plan(
        event('ACCESS_REQUEST.RESUBMITTED', { assigneeEmployeeIds: PEOPLE.head }, { actorEmployeeId: PEOPLE.head }),
        facts({ request: delegatedFacts() }),
      );
      const nobody = plan(
        event('ACCESS_REQUEST.RESUBMITTED', { reopenedStepIds: 'step-1' }, { actorEmployeeId: PEOPLE.requester }),
        facts(),
      );

      expect(own).toEqual([]);
      expect(nobody).toEqual([]);
    });
  });

  describe('a head sent a proposal of new software for themselves (B4)', () => {
    it('gives the step of the assessment to the IT Admin of the payload when the request is one-step', () => {
      const planned = plan(
        event(
          'ACCESS_REQUEST.ASSESSMENT_REQUESTED',
          { routingMode: 'ONE_STEP', itAdminEmployeeId: PEOPLE.itAdmin },
          { actorEmployeeId: PEOPLE.head },
        ),
        facts({ request: requestFacts({ branch: 'NEW_SOFTWARE', requesterEmployeeId: PEOPLE.head }) }),
      );

      expect(told(planned)).toEqual([`${PEOPLE.itAdmin}:STEP_ASSIGNED`]);
      expect(planned[0].params).toEqual({ requestId: REQUEST_ID, stepKind: 'IT_ASSESSMENT', cause: 'SUBMITTED' });
    });

    it('says nothing when the assessment was asked for by the approval of the need, which already tells the IT Admin (row 2)', () => {
      const planned = plan(
        event(
          'ACCESS_REQUEST.ASSESSMENT_REQUESTED',
          { itAdminEmployeeId: PEOPLE.itAdmin },
          { actorEmployeeId: PEOPLE.head },
        ),
        facts({ request: requestFacts({ branch: 'NEW_SOFTWARE' }) }),
      );

      expect(planned).toEqual([]);
    });

    it('tells nobody when no IT Admin holds the step', () => {
      const planned = plan(
        event('ACCESS_REQUEST.ASSESSMENT_REQUESTED', { routingMode: 'ONE_STEP', itAdminEmployeeId: null }),
        facts({ request: requestFacts({ branch: 'NEW_SOFTWARE' }) }),
      );

      expect(planned).toEqual([]);
    });
  });
});
