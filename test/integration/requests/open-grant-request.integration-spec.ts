import { RequestsApi } from '../../../src/modules/requests/public/requests.api';
import { declarePlan } from '../../support/builders/catalog.builder';
import type { Person } from '../../support/request-harness';
import { SpendHarness, type Unit } from '../../support/spend-harness';

/**
 * `FIX-B3b` OOP-1a: what the module of requests tells the review of the accounts outside the process about the Request the person sent for the same software
 * (`US-13-05` AC-23): none, one that has not reached the step of the spending approver, one at that step, or one that was approved (carried out or done on or
 * after the day of the conclusion). A Request that ended unsuccessfully, a draft, a Request of another person, of another software or for a group is none.
 */
const h = new SpendHarness();

interface Plan {
  planId: string;
  applicationId: string;
}

describe('the Request of a person for the software of a case outside the process (integration, real PostgreSQL)', () => {
  let counter = 0;
  let paid: Plan;
  let other: Plan;
  let unit: Unit;

  beforeAll(async () => {
    await h.start();
    paid = await planOf(await h.plan('K2'));
    other = await planOf(await h.plan('K2'));
    unit = await h.departmentWithHead('P-OG1');
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  const planOf = async (planId: string): Promise<Plan> => ({
    planId,
    applicationId: (
      await h.ctx.sql.query<{ application_id: string }>('SELECT application_id FROM plans WHERE id = $1', [planId])
    ).rows[0].application_id,
  });
  const requests = () => h.ctx.app.get(RequestsApi, { strict: false });
  const person = async (): Promise<Person> => {
    counter += 1;

    return h.staff(unit.department, `OG-E${counter}`);
  };
  /** A Request of the person for the plan, waiting for the head (the first step of the need). */
  const sentBy = async (who: Person, plan: Plan = paid): Promise<string> => (await h.sent(who, plan.planId)).id;
  /** The columns the database keeps in step with a state that closes a Request, so the state can be set without going through the whole route. */
  const COLUMNS_OF: Record<string, string> = {
    AWAITING_IT_CLOSE: 'withdrawal_requested_at = now(), withdrawn_by_employee_id = requester_employee_id',
    WITHDRAWN:
      'withdrawal_requested_at = now(), withdrawn_by_employee_id = requester_employee_id, withdrawn_at = now()',
    CANCELLED: `cancelled_at = now(), cancelled_by_employee_id = requester_employee_id, cancel_cause = 'BENEFICIARY_LEFT'`,
  };
  const stateOf = (requestId: string, state: string) =>
    h.ctx.sql.query(
      `UPDATE access_requests SET state = $2::"AccessRequestState"${COLUMNS_OF[state] ? `, ${COLUMNS_OF[state]}` : ''} WHERE id = $1`,
      [requestId, state],
    );
  const found = (who: Person, plan: Plan = paid, since = '2026-01-01') =>
    requests().openGrantRequestOf(who.employeeId, plan.applicationId, since);

  it('says nothing for a person who sent no Request, and for a Request of another software or of another person', async () => {
    const lonely = await person();
    const asker = await person();
    await sentBy(asker, other);
    await sentBy(await person(), paid);

    expect(await found(lonely)).toBeNull();
    expect(await found(asker, paid)).toBeNull();
  });

  it('says a Request that waits for the head, or for the IT Admin to assess it, has not reached the step of the spending approver', async () => {
    const who = await person();
    const id = await sentBy(who);

    expect(await found(who)).toEqual({ requestId: id, stage: 'BEFORE_SPEND', reachedSpendOn: null });

    await stateOf(id, 'AWAITING_IT_ASSESSMENT');
    expect(await found(who)).toMatchObject({ requestId: id, stage: 'BEFORE_SPEND' });
    await stateOf(id, 'WAITING_CONTROLLED');
    expect(await found(who)).toMatchObject({ requestId: id, stage: 'BEFORE_SPEND' });
  });

  it('says a Request in the queue of the head to be sent as spend, or waiting for the spending approver, is at that step, with the day it came to it', async () => {
    const who = await person();
    const id = await sentBy(who);
    await stateOf(id, 'AWAITING_SPEND_SUBMISSION');
    await h.ctx.sql.query(`UPDATE access_requests SET spend_queued_at = '2026-08-12T03:00:00Z' WHERE id = $1`, [id]);

    expect(await found(who)).toEqual({ requestId: id, stage: 'AT_SPEND', reachedSpendOn: '2026-08-12' });

    await stateOf(id, 'AWAITING_SPEND_DECISION');
    expect(await found(who)).toEqual({ requestId: id, stage: 'AT_SPEND', reachedSpendOn: '2026-08-12' });
    await stateOf(id, 'AWAITING_REQUESTER_REVISION');
    expect(await found(who)).toMatchObject({ requestId: id, stage: 'AT_SPEND' });
  });

  it('says a Request that has no record of the day it came to the step is at it, with no day', async () => {
    const who = await person();
    const id = await sentBy(who);
    await stateOf(id, 'AWAITING_SPEND_DECISION');
    await h.ctx.sql.query('UPDATE access_requests SET spend_queued_at = NULL WHERE id = $1', [id]);

    expect(await found(who)).toEqual({ requestId: id, stage: 'AT_SPEND', reachedSpendOn: null });
  });

  it('says a Request that was approved, to be carried out or being carried out, is approved', async () => {
    const who = await person();
    const id = await sentBy(who);
    await stateOf(id, 'AWAITING_EXECUTION');

    expect(await found(who)).toMatchObject({ requestId: id, stage: 'APPROVED' });

    await stateOf(id, 'EXECUTING');
    expect(await found(who)).toMatchObject({ requestId: id, stage: 'APPROVED' });
  });

  it('says a Request that is done is approved only when the right was granted on or after the day of the conclusion', async () => {
    const who = await person();
    const id = await sentBy(who);
    await h.ctx.sql.query(
      `UPDATE access_requests SET state = 'COMPLETED', granted_on = '2026-08-20', grant_completed_at = '2026-08-20T03:00:00Z' WHERE id = $1`,
      [id],
    );

    expect(await found(who, paid, '2026-08-04')).toMatchObject({ requestId: id, stage: 'APPROVED' });
    expect(await found(who, paid, '2026-08-20')).toMatchObject({ requestId: id, stage: 'APPROVED' });
    expect(await found(who, paid, '2026-08-21')).toBeNull();
  });

  it.each(['REJECTED', 'IT_REJECTED', 'FAILED', 'WITHDRAWN', 'CANCELLED', 'AWAITING_IT_CLOSE'])(
    'says nothing of a Request that ended unsuccessfully (%s): the case is as if the person sent none',
    async (state) => {
      const who = await person();
      const id = await sentBy(who);
      await stateOf(id, state);

      expect(await found(who)).toBeNull();
    },
  );

  it('chooses the furthest Request when the person has more than one for the software, and answers the questions of a batch in order', async () => {
    const who = await person();
    const near = await person();
    const none = await person();
    const sibling = await declarePlan(h.ctx, h.it1.accessToken, {
      applicationId: paid.applicationId,
      name: h.unique('Plan'),
      provisioningType: 'K2',
      pricingModel: 'PER_SEAT',
      controlLevel: 'FULL',
    });
    const first = await sentBy(who);
    const second = await sentBy(who, { planId: sibling, applicationId: paid.applicationId });
    await stateOf(second, 'AWAITING_SPEND_DECISION');
    const waiting = await sentBy(near);

    const answers = await requests().openGrantRequestsOf([
      { employeeId: none.employeeId, applicationId: paid.applicationId, since: '2026-01-01' },
      { employeeId: who.employeeId, applicationId: paid.applicationId, since: '2026-01-01' },
      { employeeId: near.employeeId, applicationId: paid.applicationId, since: '2026-01-01' },
      { employeeId: near.employeeId, applicationId: other.applicationId, since: '2026-01-01' },
    ]);

    expect(first).not.toBe(second);
    expect(answers).toEqual([
      null,
      expect.objectContaining({ requestId: second, stage: 'AT_SPEND' }),
      expect.objectContaining({ requestId: waiting, stage: 'BEFORE_SPEND' }),
      null,
    ]);
  });

  it('reads nothing for no questions', async () => {
    expect(await requests().openGrantRequestsOf([])).toEqual([]);
  });
});
