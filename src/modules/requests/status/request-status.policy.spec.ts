import {
  PEOPLE,
  REQUEST_ID,
  STEP_ID,
  delegatedFacts,
  event,
  facts,
  requestFacts,
} from '../../../../test/support/request-status-facts';
import { MAX_PARAM_TEXT, PROJECTED_ACTIONS, plan } from './request-status.policy';

const told = (planned: ReturnType<typeof plan>) =>
  planned.map((notice) => `${notice.recipientEmployeeId}:${notice.code}`);

describe('what the inbox tells the people of a request about how it is going and how it ended', () => {
  describe('the request was sent (row 1)', () => {
    it('tells the requester it waits for the decision of the head and tells the head the step is theirs', () => {
      const planned = plan(
        event(
          'ACCESS_REQUEST.NEED_STEP_ROUTED',
          { outcome: 'ASSIGNED', assigneeEmployeeId: PEOPLE.head },
          { actorEmployeeId: PEOPLE.requester },
        ),
        facts(),
      );

      expect(told(planned)).toEqual([`${PEOPLE.requester}:REQUEST_SUBMITTED`, `${PEOPLE.head}:STEP_ASSIGNED`]);
      expect(planned[0].params).toEqual({ requestId: REQUEST_ID, stage: 'WAITING_NEED_DECISION' });
      expect(planned[1].params).toEqual({ requestId: REQUEST_ID, stepKind: 'NEED', cause: 'SUBMITTED' });
    });

    it('tells the requester that it waits under control when nobody holds the step, and nobody else', () => {
      const planned = plan(
        event('ACCESS_REQUEST.NEED_STEP_ROUTED', { outcome: 'WAITING', assigneeEmployeeId: null }),
        facts(),
      );

      expect(told(planned)).toEqual([`${PEOPLE.requester}:REQUEST_SUBMITTED`]);
      expect(planned[0].params).toMatchObject({ stage: 'WAITING_CONTROLLED' });
    });

    it('tells a head who sent it for somebody else that it is confirmed, though they caused the event', () => {
      const planned = plan(
        event(
          'ACCESS_REQUEST.NEED_STEP_ROUTED',
          { outcome: 'CONFIRMED_BY_SENDING', assigneeEmployeeId: PEOPLE.head },
          { actorEmployeeId: PEOPLE.head },
        ),
        facts({ request: delegatedFacts() }),
      );

      expect(told(planned)).toEqual([`${PEOPLE.head}:REQUEST_SUBMITTED`]);
      expect(planned[0].params).toMatchObject({ stage: 'CONFIRMED' });
    });
  });

  describe('the need step was approved (row 2)', () => {
    it.each([
      ['AWAITING_IT_ASSESSMENT', 'IT_ASSESSMENT'],
      ['AWAITING_SPEND_SUBMISSION', 'SPEND_SUBMISSION'],
      ['AWAITING_EXECUTION', 'EXECUTION'],
    ])('tells the requester, not the head who decided, that it goes to %s', (requestState, next) => {
      const planned = plan(
        event('ACCESS_REQUEST.NEED_APPROVED', { requestState }, { actorEmployeeId: PEOPLE.head }),
        facts(),
      );

      expect(told(planned)).toEqual([`${PEOPLE.requester}:REQUEST_NEED_APPROVED`]);
      expect(planned[0].params).toEqual({ requestId: REQUEST_ID, next });
    });

    it('gives the IT Admin who holds the assessment of new software the step', () => {
      const planned = plan(
        event(
          'ACCESS_REQUEST.NEED_APPROVED',
          { requestState: 'AWAITING_IT_ASSESSMENT' },
          { actorEmployeeId: PEOPLE.head },
        ),
        facts({ request: requestFacts({ branch: 'NEW_SOFTWARE' }), assessmentHolderEmployeeId: PEOPLE.itAdmin }),
      );

      expect(told(planned)).toEqual([`${PEOPLE.requester}:REQUEST_NEED_APPROVED`, `${PEOPLE.itAdmin}:STEP_ASSIGNED`]);
      expect(planned[1].params).toEqual({ requestId: REQUEST_ID, stepKind: 'IT_ASSESSMENT', cause: 'ASSESSMENT' });
    });

    it('tells nobody of a step that waits for an IT Admin to hold it, and a renewal that it is applied at once', () => {
      const waiting = plan(
        event('ACCESS_REQUEST.NEED_APPROVED', { requestState: 'AWAITING_IT_ASSESSMENT' }),
        facts({ request: requestFacts({ branch: 'NEW_SOFTWARE' }), assessmentHolderEmployeeId: null }),
      );
      const renewal = plan(
        event('ACCESS_REQUEST.NEED_APPROVED', { requestState: 'AWAITING_EXECUTION' }),
        facts({ request: requestFacts({ type: 'RENEWAL' }) }),
      );

      expect(told(waiting)).toEqual([`${PEOPLE.requester}:REQUEST_NEED_APPROVED`]);
      expect(renewal[0].params).toMatchObject({ next: 'RENEWAL_APPLIED' });
    });

    it('does not tell the head who sent a request for somebody else that they approved it', () => {
      const planned = plan(
        event(
          'ACCESS_REQUEST.NEED_APPROVED',
          { requestState: 'AWAITING_EXECUTION', delegated: true },
          { actorEmployeeId: PEOPLE.head },
        ),
        facts({ request: delegatedFacts() }),
      );

      expect(planned).toEqual([]);
    });
  });

  describe('how it ended (rows 3 to 8 and 16)', () => {
    it('tells the requester and the person it is for, not the head who refused it, with the reason of the head (row 3)', () => {
      const planned = plan(
        event(
          'ACCESS_REQUEST.NEED_REJECTED',
          {},
          { actorEmployeeId: PEOPLE.approver, resourceType: 'ACCESS_REQUEST_STEP', resourceId: STEP_ID },
        ),
        facts({
          request: requestFacts({ requesterEmployeeId: PEOPLE.approver, beneficiaryEmployeeIds: [PEOPLE.beneficiary] }),
          decision: { deciderEmployeeId: PEOPLE.approver, reason: 'Not needed this quarter' },
        }),
      );

      expect(told(planned)).toEqual([`${PEOPLE.beneficiary}:REQUEST_REJECTED`]);
      expect(planned[0].params).toEqual({
        requestId: REQUEST_ID,
        by: 'NEED',
        reason: 'Not needed this quarter',
        suggestedPlanId: null,
      });
    });

    it('tells the requester, the person it is for and the head of the refusal of the IT Admin, never the spending approver (row 4)', () => {
      const planned = plan(
        event('ACCESS_REQUEST.ASSESSMENT_REJECTED', { kind: 'UNCONTROLLABLE' }, { actorEmployeeId: PEOPLE.itAdmin }),
        facts({
          request: requestFacts({ beneficiaryEmployeeIds: [PEOPLE.beneficiary] }),
          departmentHeadEmployeeId: PEOPLE.head,
          itRejection: {
            kind: 'UNCONTROLLABLE',
            reason: 'No admin console',
            alternativePlanId: null,
            alternativeNote: null,
          },
        }),
      );

      expect(told(planned)).toEqual([
        `${PEOPLE.requester}:REQUEST_IT_REJECTED`,
        `${PEOPLE.beneficiary}:REQUEST_IT_REJECTED`,
        `${PEOPLE.head}:REQUEST_IT_REJECTED`,
      ]);
      expect(planned[0].params).toEqual({
        requestId: REQUEST_ID,
        kind: 'UNCONTROLLABLE',
        reason: 'No admin console',
        alternativePlanId: null,
        alternativeNote: null,
        noAlternative: true,
      });
    });

    it('carries the alternative of the IT Admin when there is one (row 4)', () => {
      const planned = plan(
        event('ACCESS_REQUEST.ASSESSMENT_REJECTED', {}),
        facts({
          itRejection: {
            kind: 'NOT_ELIGIBLE',
            reason: 'Duplicates Figma',
            alternativePlanId: 'f0000000-0000-4000-8000-000000000001',
            alternativeNote: null,
          },
        }),
      );

      expect(planned[0].params).toMatchObject({
        alternativePlanId: 'f0000000-0000-4000-8000-000000000001',
        noAlternative: false,
      });
    });

    it('tells the requester that the spend was approved, not the approver who approved it (row 5)', () => {
      const approved = plan(event('ACCESS_REQUEST.SPEND_APPROVED', {}, { actorEmployeeId: PEOPLE.approver }), facts());

      expect(told(approved)).toEqual([`${PEOPLE.requester}:REQUEST_SPEND_APPROVED`]);
    });

    it('tells the requester a refusal of the spend with the reason and the tool that does the same work (row 6)', () => {
      const planned = plan(
        event('ACCESS_REQUEST.SPEND_REJECTED', {}, { actorEmployeeId: PEOPLE.approver }),
        facts({
          decision: { deciderEmployeeId: PEOPLE.approver, reason: 'Figma already does it' },
          equivalentPlanId: 'f0000000-0000-4000-8000-000000000002',
        }),
      );

      expect(told(planned)).toEqual([`${PEOPLE.requester}:REQUEST_REJECTED`]);
      expect(planned[0].params).toEqual({
        requestId: REQUEST_ID,
        by: 'SPEND',
        reason: 'Figma already does it',
        suggestedPlanId: 'f0000000-0000-4000-8000-000000000002',
      });
    });

    it('has no suggestion when the IT Admin recorded no tool that does the same work (row 6)', () => {
      const planned = plan(
        event('ACCESS_REQUEST.SPEND_REJECTED', {}),
        facts({ decision: { deciderEmployeeId: PEOPLE.approver, reason: null } }),
      );

      expect(planned[0].params).toMatchObject({ suggestedPlanId: null, reason: null });
    });

    it('tells the requester how to get in and where, when the software was declared with a homepage (row 7)', () => {
      const planned = plan(event('ACCESS_REQUEST.GRANT_COMPLETED', {}), facts({ homepageUrl: 'https://miro.com' }));

      expect(told(planned)).toEqual([`${PEOPLE.requester}:REQUEST_GRANTED`]);
      expect(planned[0].params).toEqual({
        requestId: REQUEST_ID,
        accessGuide: 'LOGIN_WITH_WORK_ACCOUNT',
        homepageUrl: 'https://miro.com',
      });
    });

    it('tells the person it was sent for the outcome too, and only the outcome (rows 7 and 8)', () => {
      const delegated = facts({ request: delegatedFacts() });

      expect(told(plan(event('ACCESS_REQUEST.GRANT_COMPLETED', {}), delegated))).toEqual([
        `${PEOPLE.head}:REQUEST_GRANTED`,
        `${PEOPLE.beneficiary}:REQUEST_GRANTED`,
      ]);
      expect(told(plan(event('ACCESS_REQUEST.GRANT_FAILED', {}), delegated))).toEqual([
        `${PEOPLE.head}:REQUEST_FAILED`,
        `${PEOPLE.beneficiary}:REQUEST_FAILED`,
      ]);
    });

    it('says nothing of why a grant failed: only where to turn (row 8)', () => {
      const planned = plan(
        event('ACCESS_REQUEST.GRANT_FAILED', {
          from: 'EXECUTING',
          to: 'FAILED',
          lastError: 'smtp 550',
          closeReason: 'vendor down',
        }),
        facts(),
      );

      expect(planned[0].params).toEqual({ requestId: REQUEST_ID, contact: 'IT_ADMIN' });
    });

    it('tells a cancelled request as a cancellation, never a withdrawal or a failure, and not to the person who closed it (row 16)', () => {
      const planned = plan(
        event('ACCESS_REQUEST.CANCELLED', { reasonKind: 'BENEFICIARY_LEFT', cancelledByEmployeeId: PEOPLE.itAdmin }),
        facts({ request: delegatedFacts() }),
      );

      expect(told(planned)).toEqual([`${PEOPLE.head}:REQUEST_CANCELLED`, `${PEOPLE.beneficiary}:REQUEST_CANCELLED`]);
      expect(planned[0].params).toEqual({ requestId: REQUEST_ID, reasonKind: 'BENEFICIARY_LEFT' });
    });
  });

  describe('one person of a request for a group (US-05-15 AC-9)', () => {
    it('tells the head who made it and that person alone, with a key of their own', () => {
      const group = facts({
        request: requestFacts({
          requesterEmployeeId: PEOPLE.head,
          beneficiaryEmployeeIds: [PEOPLE.beneficiary, PEOPLE.holder],
        }),
      });
      const planned = plan(event('ACCESS_REQUEST.GRANT_COMPLETED', { beneficiaryEmployeeId: PEOPLE.holder }), group);

      expect(told(planned)).toEqual([`${PEOPLE.head}:REQUEST_GRANTED`, `${PEOPLE.holder}:REQUEST_GRANTED`]);
      expect(planned.map((notice) => notice.eventKey)).toEqual([
        `AUD:${'e0000000-0000-4000-8000-000000000001'}:REQUEST_GRANTED:${PEOPLE.holder}`,
        `AUD:${'e0000000-0000-4000-8000-000000000001'}:REQUEST_GRANTED:${PEOPLE.holder}`,
      ]);
    });

    it('tells the head and the person who left of the removal of that person alone, and neither the IT Admin nor the others of the group', () => {
      const group = facts({
        request: requestFacts({
          requesterEmployeeId: PEOPLE.head,
          beneficiaryEmployeeIds: [PEOPLE.beneficiary, PEOPLE.holder],
        }),
      });
      const planned = plan(
        event('ACCESS_REQUEST.LINE_CANCELLED', {
          beneficiaryEmployeeId: PEOPLE.holder,
          reasonKind: 'BENEFICIARY_LEFT',
          cancelledByEmployeeId: PEOPLE.itAdmin,
        }),
        group,
      );

      expect(told(planned)).toEqual([`${PEOPLE.head}:REQUEST_CANCELLED`, `${PEOPLE.holder}:REQUEST_CANCELLED`]);
      expect(planned[0].params).toEqual({ requestId: REQUEST_ID, reasonKind: 'BENEFICIARY_LEFT' });
    });
  });

  describe('how a notice is made', () => {
    it('does not tell the person who caused the event, unless the rule says that is the point', () => {
      const planned = plan(
        event('ACCESS_REQUEST.SPEND_APPROVED', {}, { actorEmployeeId: PEOPLE.requester }),
        facts({ request: requestFacts({ requesterEmployeeId: PEOPLE.requester }) }),
      );

      expect(planned).toEqual([]);
    });

    it('tells a person named twice once for each code', () => {
      const planned = plan(
        event('ACCESS_REQUEST.ASSESSMENT_REJECTED', {}),
        facts({
          departmentHeadEmployeeId: PEOPLE.requester,
          itRejection: { kind: 'NOT_ELIGIBLE', reason: 'x', alternativePlanId: null, alternativeNote: null },
        }),
      );

      expect(told(planned)).toEqual([`${PEOPLE.requester}:REQUEST_IT_REJECTED`]);
    });

    it('makes the key from the event and the code so that reading the event again makes nothing new', () => {
      const first = plan(event('ACCESS_REQUEST.GRANT_COMPLETED', {}), facts());
      const again = plan(event('ACCESS_REQUEST.GRANT_COMPLETED', {}), facts());

      expect(first[0].eventKey).toBe('AUD:e0000000-0000-4000-8000-000000000001:REQUEST_GRANTED:-');
      expect(again).toEqual(first);
    });

    it('keeps a long reason to a size the inbox takes', () => {
      const planned = plan(
        event('ACCESS_REQUEST.NEED_REJECTED', {}),
        facts({ decision: { deciderEmployeeId: PEOPLE.head, reason: 'x'.repeat(5000) } }),
      );

      expect((planned[0].params.reason as string).length).toBe(MAX_PARAM_TEXT);
    });

    it('makes nothing for an action the table does not know, an event that names nothing it is about, or a request that is gone', () => {
      expect(plan(event('ACCESS_REQUEST.SUBMITTED', {}), facts())).toEqual([]);
      expect(plan(event('ACCESS_REQUEST.GRANT_COMPLETED', { requestId: null }), facts())).toEqual([]);
      expect(plan(event('ACCESS_REQUEST.GRANT_COMPLETED', {}), facts({ request: null }))).toEqual([]);
    });

    it('reads only the actions of its table', () => {
      expect(PROJECTED_ACTIONS).toEqual(
        expect.arrayContaining(['ACCESS_REQUEST.GRANT_COMPLETED', 'RETURN_REQUEST.SUBMITTED']),
      );
      expect(PROJECTED_ACTIONS).not.toContain('ACCESS_REQUEST.SUBMITTED');
      expect(new Set(PROJECTED_ACTIONS).size).toBe(PROJECTED_ACTIONS.length);
    });
  });
});
