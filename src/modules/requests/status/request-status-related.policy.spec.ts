import {
  PEOPLE,
  REQUEST_ID,
  RETURN_ID,
  STEP_ID,
  delegatedFacts,
  event,
  facts,
  requestFacts,
} from '../../../../test/support/request-status-facts';
import { plan } from './request-status.policy';

const told = (planned: ReturnType<typeof plan>) =>
  planned.map((notice) => `${notice.recipientEmployeeId}:${notice.code}`);
const step = { resourceType: 'ACCESS_REQUEST_STEP', resourceId: STEP_ID } as const;

describe('what the inbox tells about a withdrawal, a step that moves or waits, and the requests that are not a plain grant', () => {
  describe('the request was withdrawn (rows 9 to 12)', () => {
    it('tells the requester and the person it is for, not the one who withdrew, and everybody who held a step that was closed (row 9)', () => {
      const planned = plan(
        event(
          'ACCESS_REQUEST.WITHDRAWN',
          { byRequester: false, withdrawnByEmployeeId: PEOPLE.head, reason: 'Not this quarter' },
          { actorEmployeeId: PEOPLE.head },
        ),
        facts({
          request: requestFacts({ beneficiaryEmployeeIds: [PEOPLE.beneficiary] }),
          closedStepHolders: [
            { kind: 'NEED', employeeId: PEOPLE.head },
            { kind: 'SPEND_APPROVAL', employeeId: PEOPLE.approver },
          ],
        }),
      );

      expect(told(planned)).toEqual([
        `${PEOPLE.requester}:REQUEST_WITHDRAWN`,
        `${PEOPLE.beneficiary}:REQUEST_WITHDRAWN`,
        `${PEOPLE.approver}:STEP_CLOSED_BY_WITHDRAWAL`,
      ]);
      expect(planned[0].params).toEqual({ requestId: REQUEST_ID, byRequester: false, reason: 'Not this quarter' });
      expect(planned[2].params).toEqual({ requestId: REQUEST_ID, stepKind: 'SPEND_APPROVAL' });
    });

    it('needs no reason when the requester withdrew for themselves, and does not tell them (row 9)', () => {
      const planned = plan(
        event('ACCESS_REQUEST.WITHDRAWN', {
          byRequester: true,
          withdrawnByEmployeeId: PEOPLE.requester,
          reason: 'changed my mind',
        }),
        facts({ closedStepHolders: [{ kind: 'NEED', employeeId: PEOPLE.head }] }),
      );

      expect(told(planned)).toEqual([`${PEOPLE.head}:STEP_CLOSED_BY_WITHDRAWAL`]);
    });

    it('knows who withdrew from the request when the IT Admin closed the task and the system wrote the event (row 9)', () => {
      const planned = plan(
        event('ACCESS_REQUEST.WITHDRAWN', {
          from: 'AWAITING_IT_CLOSE',
          to: 'WITHDRAWN',
          withdrawnByEmployeeId: PEOPLE.requester,
        }),
        facts({ request: requestFacts({ beneficiaryEmployeeIds: [PEOPLE.requester, PEOPLE.beneficiary] }) }),
      );

      expect(told(planned)).toEqual([`${PEOPLE.beneficiary}:REQUEST_WITHDRAWN`]);
    });

    it('tells one holder once even if they held two of the steps that were closed (row 9)', () => {
      const planned = plan(
        event('ACCESS_REQUEST.WITHDRAWN', { withdrawnByEmployeeId: PEOPLE.requester }),
        facts({
          closedStepHolders: [
            { kind: 'NEED', employeeId: PEOPLE.head },
            { kind: 'SPEND_APPROVAL', employeeId: PEOPLE.head },
          ],
        }),
      );

      expect(told(planned)).toEqual([`${PEOPLE.head}:STEP_CLOSED_BY_WITHDRAWAL`]);
    });

    it('gives the IT Admin in charge the task to close, and tells the requester it is not over when a head withdrew (row 10)', () => {
      const planned = plan(
        event(
          'ACCESS_REQUEST.WITHDRAWAL_REQUESTED',
          { to: 'AWAITING_IT_CLOSE', taskId: 'f0000000-0000-4000-8000-000000000009' },
          { actorEmployeeId: PEOPLE.head },
        ),
        facts({ request: requestFacts({ withdrawnByEmployeeId: PEOPLE.head }), itAdminEmployeeId: PEOPLE.itAdmin }),
      );

      expect(told(planned)).toEqual([
        `${PEOPLE.itAdmin}:WITHDRAWAL_AWAITING_IT_CLOSE`,
        `${PEOPLE.requester}:REQUEST_WITHDRAWAL_PENDING`,
      ]);
      expect(planned[0].params).toEqual({ requestId: REQUEST_ID, taskId: 'f0000000-0000-4000-8000-000000000009' });
    });

    it('does not tell the requester that their own withdrawal is pending, only the IT Admin (row 10)', () => {
      const planned = plan(
        event(
          'ACCESS_REQUEST.WITHDRAWAL_REQUESTED',
          { taskId: 'f0000000-0000-4000-8000-000000000009' },
          { actorEmployeeId: PEOPLE.requester },
        ),
        facts({
          request: requestFacts({ withdrawnByEmployeeId: PEOPLE.requester }),
          itAdminEmployeeId: PEOPLE.itAdmin,
        }),
      );

      expect(told(planned)).toEqual([`${PEOPLE.itAdmin}:WITHDRAWAL_AWAITING_IT_CLOSE`]);
    });

    it('tells Finance and the IT Admin once that what was held went back, one key for the request however many years it was held (row 11)', () => {
      const year = (id: string) =>
        plan(
          event(
            'BUDGET_COMMITMENT.RELEASED',
            { reason: 'REQUEST_WITHDRAWN', year: 2026 },
            { id, resourceType: 'BUDGET_COMMITMENT' },
          ),
          facts({ financeEmployeeId: PEOPLE.finance, itAdminEmployeeId: PEOPLE.itAdmin }),
        );
      const first = year('e0000000-0000-4000-8000-0000000000a1');
      const second = year('e0000000-0000-4000-8000-0000000000a2');

      expect(told(first)).toEqual([
        `${PEOPLE.finance}:COMMITMENT_RELEASED_BY_WITHDRAWAL`,
        `${PEOPLE.itAdmin}:COMMITMENT_RELEASED_BY_WITHDRAWAL`,
      ]);
      expect(first.map((notice) => notice.eventKey)).toEqual(second.map((notice) => notice.eventKey));
      expect(first[0].eventKey).toBe(`REL:${REQUEST_ID}`);
      expect(first[0].params).toEqual({ requestId: REQUEST_ID });
    });

    it('does not tell of money that went back for another reason, such as a failed grant (row 11)', () => {
      const planned = plan(
        event('BUDGET_COMMITMENT.RELEASED', { reason: 'GRANT_FAILED' }),
        facts({ financeEmployeeId: PEOPLE.finance, itAdminEmployeeId: PEOPLE.itAdmin }),
      );

      expect(planned).toEqual([]);
    });

    it('tells the IT Admin in charge, not the one who cancelled the task, that the task was cancelled (row 12)', () => {
      const cancelled = (actorEmployeeId: string | null) =>
        plan(
          event(
            'PROVISIONING_TASK.CANCELLED',
            { status: 'CANCELLED' },
            { resourceType: 'ProvisioningTask', resourceId: 'f0000000-0000-4000-8000-000000000009', actorEmployeeId },
          ),
          facts({ itAdminEmployeeId: PEOPLE.itAdmin }),
        );

      expect(told(cancelled(PEOPLE.requester))).toEqual([`${PEOPLE.itAdmin}:GRANT_TASK_CANCELLED`]);
      expect(cancelled(PEOPLE.itAdmin)).toEqual([]);
    });

    it('has nobody to tell when no IT Admin is in charge (rows 10 to 12)', () => {
      expect(plan(event('PROVISIONING_TASK.CANCELLED', {}), facts({ itAdminEmployeeId: null }))).toEqual([]);
    });
  });

  describe('a step that waits or moves (rows 13 to 15)', () => {
    it('tells the requester that a step waits for somebody who can hold it (row 13)', () => {
      const planned = plan(event('ACCESS_REQUEST.STEP_WAITING', { stepKind: 'SPEND_APPROVAL' }, step), facts());

      expect(told(planned)).toEqual([`${PEOPLE.requester}:REQUEST_WAITING_CONTROLLED`]);
      expect(planned[0].params).toEqual({ requestId: REQUEST_ID, stepKind: 'SPEND_APPROVAL' });
    });

    it('tells the requester the wait is over and the new holder that the step is theirs (row 14)', () => {
      const planned = plan(
        event('ACCESS_REQUEST.STEP_ASSIGNED_FROM_WAIT', { stepKind: 'NEED', assigneeEmployeeId: PEOPLE.head }, step),
        facts(),
      );

      expect(told(planned)).toEqual([`${PEOPLE.requester}:REQUEST_WAITING_ENDED`, `${PEOPLE.head}:STEP_ASSIGNED`]);
      expect(planned[1].params).toEqual({ requestId: REQUEST_ID, stepKind: 'NEED', cause: 'WAIT_ENDED' });
    });

    it('tells only the new holder when a step moved from one person to another (row 15)', () => {
      const planned = plan(
        event('ACCESS_REQUEST.STEP_REDETERMINED', { stepKind: 'NEED', assigneeEmployeeId: PEOPLE.approver }, step),
        facts(),
      );

      expect(told(planned)).toEqual([`${PEOPLE.approver}:STEP_ASSIGNED`]);
      expect(planned[0].params).toMatchObject({ cause: 'REASSIGNED' });
    });
  });

  describe('what is told beyond that list (rows 17 to 24)', () => {
    it('tells the Super Admin of the alert of a step that waits, and the IT Admin in charge when the event names that role', () => {
      const alert = (notify: string) =>
        plan(
          event(
            'ACCESS_REQUEST.STEP_WAIT_ALERTED',
            {
              stepKind: 'NEED',
              waitingReason: 'NO_FALLBACK_APPROVER',
              configurationHint: 'CONFIGURE_FALLBACK_APPROVER',
              notify,
              itAdminEmployeeId: PEOPLE.itAdmin,
            },
            step,
          ),
          facts({ superAdminEmployeeId: PEOPLE.superAdmin }),
        );

      expect(told(alert('SUPER_ADMIN'))).toEqual([`${PEOPLE.superAdmin}:CONTROLLED_WAIT_ALERT`]);
      expect(told(alert('SUPER_ADMIN,IT_ADMIN_IN_CHARGE'))).toEqual([
        `${PEOPLE.superAdmin}:CONTROLLED_WAIT_ALERT`,
        `${PEOPLE.itAdmin}:CONTROLLED_WAIT_ALERT`,
      ]);
      expect(alert('SUPER_ADMIN')[0].params).toEqual({
        requestId: REQUEST_ID,
        stepKind: 'NEED',
        waitingReason: 'NO_FALLBACK_APPROVER',
        configurationHint: 'CONFIGURE_FALLBACK_APPROVER',
      });
    });

    it('tells nobody of an alert for a role nobody holds', () => {
      const planned = plan(
        event(
          'ACCESS_REQUEST.STEP_WAIT_ALERTED',
          { stepKind: 'NEED', notify: 'SUPER_ADMIN', itAdminEmployeeId: null },
          step,
        ),
        facts({ superAdminEmployeeId: null }),
      );

      expect(planned).toEqual([]);
    });

    it('tells the requester that the boundary of a service account was accepted', () => {
      const planned = plan(
        event('ACCESS_REQUEST.SERVICE_ACCOUNT_BOUNDARY_ACCEPTED', {}, { actorEmployeeId: PEOPLE.itAdmin }),
        facts(),
      );

      expect(told(planned)).toEqual([`${PEOPLE.requester}:SERVICE_ACCOUNT_BOUNDARY_ACCEPTED`]);
    });

    it('tells a refusal of the boundary as a refusal of the IT Admin, with the spending approver only when what was held went back', () => {
      const refused = (released: boolean) =>
        plan(
          event(
            'ACCESS_REQUEST.SERVICE_ACCOUNT_BOUNDARY_REJECTED',
            { responsibleEmployeeId: PEOPLE.holder, released },
            { actorEmployeeId: PEOPLE.itAdmin },
          ),
          facts({
            departmentHeadEmployeeId: PEOPLE.head,
            serviceAccount: { boundaryReason: 'A shared mailbox is people, not a service' },
            spendDeciderEmployeeId: PEOPLE.approver,
          }),
        );

      expect(told(refused(true))).toEqual([
        `${PEOPLE.requester}:REQUEST_IT_REJECTED`,
        `${PEOPLE.head}:REQUEST_IT_REJECTED`,
        `${PEOPLE.holder}:REQUEST_IT_REJECTED`,
        `${PEOPLE.approver}:REQUEST_IT_REJECTED`,
      ]);
      expect(told(refused(false))).not.toContain(`${PEOPLE.approver}:REQUEST_IT_REJECTED`);
      expect(refused(true)[0].params).toEqual({
        requestId: REQUEST_ID,
        kind: 'SERVICE_ACCOUNT_BOUNDARY',
        reason: 'A shared mailbox is people, not a service',
        alternativePlanId: null,
        alternativeNote: null,
        noAlternative: true,
      });
    });

    it('warns the holder that the revocation is coming, unless they sent the return themselves', () => {
      const submitted = (actorEmployeeId: string) =>
        plan(
          event(
            'RETURN_REQUEST.SUBMITTED',
            {
              returnRequestId: RETURN_ID,
              holderEmployeeId: PEOPLE.holder,
              planId: 'f0000000-0000-4000-8000-000000000003',
              source: 'HEAD_CONFIRMATION',
              handoverRequired: true,
              handoverDueOn: '2026-10-30',
            },
            { resourceType: 'RETURN_REQUEST', resourceId: RETURN_ID, actorEmployeeId },
          ),
          facts({ request: null }),
        );

      const planned = submitted(PEOPLE.head);
      expect(told(planned)).toEqual([`${PEOPLE.holder}:RETURN_REQUESTED`]);
      expect(planned[0].subject).toEqual({ type: 'RETURN_REQUEST', id: RETURN_ID });
      expect(planned[0].params).toEqual({
        returnRequestId: RETURN_ID,
        planId: 'f0000000-0000-4000-8000-000000000003',
        source: 'HEAD_CONFIRMATION',
        handoverRequired: true,
        handoverDueOn: '2026-10-30',
      });
      expect(submitted(PEOPLE.holder)).toEqual([]);
    });

    it('tells the holder and the sender that a return is done, and the sender that it failed', () => {
      const returned = facts({
        request: null,
        returnRequest: { id: RETURN_ID, requestedByEmployeeId: PEOPLE.head, holderEmployeeId: PEOPLE.holder },
      });
      const base = { resourceType: 'RETURN_REQUEST', resourceId: RETURN_ID, actorEmployeeId: PEOPLE.itAdmin };

      expect(
        told(
          plan(
            event('RETURN_REQUEST.COMPLETED', { returnRequestId: RETURN_ID, handoverFlagged: false }, base),
            returned,
          ),
        ),
      ).toEqual([`${PEOPLE.holder}:RETURN_COMPLETED`, `${PEOPLE.head}:RETURN_COMPLETED`]);
      expect(told(plan(event('RETURN_REQUEST.FAILED', { returnRequestId: RETURN_ID }, base), returned))).toEqual([
        `${PEOPLE.head}:RETURN_FAILED`,
      ]);
    });

    it('tells the requester and the holder of a renewal that it took effect, or could not', () => {
      const renewal = facts({ request: delegatedFacts({ type: 'RENEWAL' }) });

      const applied = plan(
        event(
          'ACCESS_REQUEST.RENEWAL_APPLIED',
          { newExpectedEndDate: '2027-03-31' },
          { actorEmployeeId: PEOPLE.approver },
        ),
        renewal,
      );
      const notApplied = plan(
        event('ACCESS_REQUEST.RENEWAL_NOT_APPLIED', { problem: 'NOT_OPEN' }, { actorEmployeeId: PEOPLE.approver }),
        renewal,
      );

      expect(told(applied)).toEqual([
        `${PEOPLE.head}:REQUEST_RENEWAL_APPLIED`,
        `${PEOPLE.beneficiary}:REQUEST_RENEWAL_APPLIED`,
      ]);
      expect(applied[0].params).toEqual({ requestId: REQUEST_ID, newExpectedEndDate: '2027-03-31' });
      expect(told(notApplied)).toEqual([
        `${PEOPLE.head}:REQUEST_RENEWAL_NOT_APPLIED`,
        `${PEOPLE.beneficiary}:REQUEST_RENEWAL_NOT_APPLIED`,
      ]);
    });
  });
});
