import type { AccessRequestWire } from '../../support/request-harness';
import { buildTicketWorld, type TicketWorld } from '../../support/request-ticket-harness';
import { StatusHarness } from '../../support/status-harness';

const h = new StatusHarness();

// W4-12
describe('head withdrawal from the spend submission queue', () => {
  let w: TicketWorld;

  beforeAll(async () => {
    await h.start();
    w = await buildTicketWorld(h);
  }, 240000);

  afterAll(async () => {
    jest.restoreAllMocks();
    await h.stop();
  });

  async function approvedNeed(planId: string): Promise<string> {
    const sent = await h.sent(w.e1, planId, { termMonths: 1 });
    await h.decide(sent.id, { decision: 'APPROVE' }, w.h1.account).expect(200);
    return sent.id;
  }

  it('requires a reason and withdraws both a newly queued request and one returned by the spending approver', async () => {
    const queued = await approvedNeed(w.plans.miro);
    const returned = await approvedNeed(w.plans.notion);
    await h.sendOn([returned], w.h1.account).expect(201);
    await h
      .decideSpend(returned, { decision: 'RETURN', reason: 'Review the spending justification' }, w.c1.account)
      .expect(200);

    for (const id of [queued, returned]) {
      const before = h.dataOf<{ request: AccessRequestWire }>(await h.fetch(id, w.e1.account).expect(200)).request;
      expect(before).toMatchObject({ state: 'AWAITING_SPEND_SUBMISSION', spend: { stage: 'NOT_SUBMITTED' } });
      const withoutReason = await h.withdrawRequest(id, {}, w.h1.account).expect(422);
      expect(h.codeOf(withoutReason)).toBe('ACCESS_REQUEST.REASON_REQUIRED');
      const withdrawn = h.dataOf<{ request: AccessRequestWire }>(
        await h
          .withdrawRequest(id, { reason: 'The department no longer needs the software' }, w.h1.account)
          .expect(200),
      ).request;
      expect(withdrawn.state).toBe('WITHDRAWN');
      const commitments = await h.ctx.sql.query('SELECT id FROM budget_commitments WHERE request_id = $1', [id]);
      expect(commitments.rows).toEqual([]);
    }
    await h.project();
    for (const id of [queued, returned]) {
      expect(await h.codesFor(w.e1.employeeId, id)).toContain('REQUEST_WITHDRAWN');
    }
  });

  it('still refuses a head withdrawing an item returned to its requester', async () => {
    const sent = await h.sent(w.e1, w.plans.slack, { termMonths: 1 });
    await h.decide(sent.id, { decision: 'RETURN', reason: 'Add the intended use' }, w.h1.account).expect(200);
    const refused = await h.withdrawRequest(sent.id, { reason: 'No longer needed' }, w.h1.account).expect(403);
    expect(h.codeOf(refused)).toBe('ACCESS_REQUEST.NOT_REQUESTER');
    const current = h.dataOf<{ request: AccessRequestWire }>(await h.fetch(sent.id, w.e1.account).expect(200)).request;
    expect(current.state).toBe('AWAITING_REQUESTER_REVISION');
    expect(current.spend?.stage).toBe('RETURNED_TO_REQUESTER');
  });
});
