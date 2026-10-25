import request from 'supertest';
import { medianSeconds } from '../../src/modules/requests/status/request-timing.policy';
import type { Unit } from '../support/spend-harness';
import { StatusHarness } from '../support/status-harness';

const h = new StatusHarness();
const M = 1_000_000;

interface TimingsWire {
  requestId: string;
  submittedAt: string;
  approvedAt: string | null;
  grantCompletedAt: string | null;
  approvalSeconds: number | null;
  grantSeconds: number | null;
  totalSeconds: number | null;
  countedInKpi: boolean;
  segments: Record<string, { startedAt: string; endedAt: string | null; seconds: number | null } | null>;
}
interface TaskWire {
  id: string;
  status: string;
}

describe('the time a request took over PostgreSQL (US-05-15 AC-1, AC-6, AC-11)', () => {
  let plan: string;
  let subscriptionId: string;
  let counter = 0;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    subscriptionId = await h.subscription(10);
    plan = await h.planOf(subscriptionId);
    await h
      .declareTaxProfile((await h.vendorOf(plan)).id, [{ taxType: 'GTGT', ratePercent: '10', deductible: true }])
      .expect(200);
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  const example = async (): Promise<Unit> => {
    counter += 1;
    const u = await h.departmentWithHead(`P-T${counter}`);
    await h.budgetFor(u, { total: 100 * M, held: 20 * M, spent: 40 * M });

    return u;
  };
  const timingsOf = async (id: string, account = h.it1) =>
    h.dataOf<{ timings: TimingsWire }>(await h.timings(id, account).expect(200)).timings;
  /** The segments the request had, in the order of the chain. */
  const present = (timings: TimingsWire) =>
    Object.entries(timings.segments).flatMap(([kind, segment]) => (segment === null ? [] : [[kind, segment] as const]));
  const granted = async (id: string): Promise<TaskWire> =>
    h.dataOf<{ task: TaskWire }>(await h.grant({ requestId: id, subscriptionId }).expect(201)).task;
  /** A request approved by the head and the approver and sent to the IT Admin as a task. */
  const approvedWithTask = async (u: Unit) => {
    const id = await h.waitingForApprover(u, plan, { amount: 15 * M });
    await h.decideSpend(id, { decision: 'APPROVE' }, h.boss.account).expect(200);

    return { id, task: await granted(id) };
  };
  const at = (day: number, hour: number) =>
    `2026-10-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00+00`;

  describe('the example of the story (AC-11)', () => {
    it('sent 09:00 on the 1st, decided on the 2nd, sent on the 5th, decided 10:00 on the 6th and granted 10:00 on the 7th', async () => {
      const u = await example();
      const { id, task } = await approvedWithTask(u);
      await h.claim(task.id).expect(200);
      await h.complete(task.id, { evidence: 'Added to the workspace' }).expect(200);
      // The moments of the example, written over the ones the real routes made: the request keeps nothing else for time.
      await h.ctx.sql.query(`UPDATE access_requests SET submitted_at = $2 WHERE id = $1`, [id, at(1, 9)]);
      await h.ctx.sql.query(
        `UPDATE access_request_steps SET created_at = $2, decided_at = $3 WHERE request_id = $1 AND kind = 'NEED'`,
        [id, at(1, 9), at(2, 9)],
      );
      // A batch is append-only, as it should be; the example moves its moment with the guard off for the statement.
      await h.ctx.sql.query(`ALTER TABLE spend_batches DISABLE TRIGGER USER`);
      try {
        await h.ctx.sql.query(
          `UPDATE spend_batches SET submitted_at = $2 WHERE id IN (SELECT batch_id FROM spend_batch_items WHERE request_id = $1)`,
          [id, at(5, 9)],
        );
      } finally {
        await h.ctx.sql.query(`ALTER TABLE spend_batches ENABLE TRIGGER USER`);
      }
      await h.ctx.sql.query(
        `UPDATE access_request_steps SET created_at = $2, decided_at = $3 WHERE request_id = $1 AND kind = 'SPEND_APPROVAL'`,
        [id, at(5, 9), at(6, 10)],
      );
      await h.ctx.sql.query(`UPDATE access_requests SET grant_completed_at = $2 WHERE id = $1`, [id, at(7, 10)]);

      const timings = await timingsOf(id, u.member.account);

      expect(timings).toMatchObject({
        submittedAt: '2026-10-01T09:00:00.000Z',
        approvedAt: '2026-10-06T10:00:00.000Z',
        grantCompletedAt: '2026-10-07T10:00:00.000Z',
        approvalSeconds: 435_600,
        grantSeconds: 86_400,
        totalSeconds: 522_000,
        countedInKpi: true,
      });
      expect(present(timings).map(([kind, segment]) => [kind, segment.seconds])).toEqual([
        ['NEED', 86_400],
        ['QUEUE_WAIT', 3 * 86_400],
        ['SPEND_DECISION', 90_000],
        ['GRANT', 86_400],
      ]);
    });
  });

  describe('where the time went, with the review of Finance (AC-1)', () => {
    it('has a segment for the need, the wait in the queue, the review of Finance, the decision of the spend and the grant, and no time of Finance after the approval', async () => {
      const u = await example();
      const id = await h.paidRequest(u, plan, { amount: 45 * M });
      await h.sendOn([id], u.head.account).expect(201);
      expect(await h.state(id)).toBe('AWAITING_FINANCE_REVIEW');
      await h
        .completeReview(id, {
          outcome: 'ASSESSED',
          opinion: 'An exception that a revision will mend',
          direction: 'RECOMMEND_OVERRIDE',
        })
        .expect(200);
      await h
        .decideSpend(
          id,
          { decision: 'APPROVE', override: { reason: 'Revision next month', years: [h.year] } },
          h.boss.account,
        )
        .expect(200);
      const task = await granted(id);
      await h.claim(task.id).expect(200);
      await h.complete(task.id, { evidence: 'Added to the workspace' }).expect(200);

      const timings = await timingsOf(id);

      expect(present(timings).map(([kind]) => kind)).toEqual([
        'NEED',
        'QUEUE_WAIT',
        'FINANCE_REVIEW',
        'SPEND_DECISION',
        'GRANT',
      ]);
      expect(present(timings).every(([, segment]) => segment.endedAt !== null && segment.seconds !== null)).toBe(true);
      expect(timings.countedInKpi).toBe(true);
      expect(timings.totalSeconds).toBe((timings.approvalSeconds ?? 0) + (timings.grantSeconds ?? 0));
      expect(JSON.stringify(timings)).not.toMatch(/amount|budget|override|opinion/i);
    });
  });

  describe('only a grant that was completed counts (AC-6)', () => {
    it('does not count a task that is queued, in progress or failed, and counts one that was completed, and takes the median of the counted ones', async () => {
      const queued = await approvedWithTask(await example());
      const running = await approvedWithTask(await example());
      await h.claim(running.task.id).expect(200);
      const failed = await approvedWithTask(await example());
      await h.claim(failed.task.id).expect(200);
      await h.fail(failed.task.id, { reason: 'The invitation bounced' }).expect(200);
      const done = [] as string[];
      for (let index = 0; index < 3; index += 1) {
        const request = await approvedWithTask(await example());
        await h.claim(request.task.id).expect(200);
        await h.complete(request.task.id, { evidence: 'Done' }).expect(200);
        done.push(request.id);
      }
      // The three that were completed took one, three and two days from the sending to the grant.
      for (const [index, days] of [1, 3, 2].entries()) {
        await h.ctx.sql.query(
          `UPDATE access_requests SET submitted_at = grant_completed_at - make_interval(days => $2::int) WHERE id = $1`,
          [done[index], days],
        );
      }

      const open = [queued.id, running.id, failed.id];
      for (const id of open) {
        const timings = await timingsOf(id);
        expect(timings).toMatchObject({
          countedInKpi: false,
          grantCompletedAt: null,
          grantSeconds: null,
          totalSeconds: null,
        });
        expect(timings.approvedAt).not.toBeNull();
      }
      const counted = await Promise.all([...done, ...open].map((id) => timingsOf(id)));
      expect(counted.filter((timings) => timings.countedInKpi)).toHaveLength(3);
      expect(medianSeconds(counted)).toBe(2 * 86_400);
    });

    it('writes the moment of the grant only for the request whose task was completed, and the database refuses it for any other state', async () => {
      const u = await example();
      const { id, task } = await approvedWithTask(u);
      expect(
        (
          await h.ctx.sql.query<{ grant_completed_at: Date | null }>(
            `SELECT grant_completed_at FROM access_requests WHERE id = $1`,
            [id],
          )
        ).rows[0].grant_completed_at,
      ).toBeNull();
      await h.claim(task.id).expect(200);
      await h.complete(task.id, { evidence: 'Done' }).expect(200);

      const row = (
        await h.ctx.sql.query<{ grant_completed_at: Date; state: string }>(
          `SELECT grant_completed_at, state::text FROM access_requests WHERE id = $1`,
          [id],
        )
      ).rows[0];

      expect(row.state).toBe('COMPLETED');
      expect(row.grant_completed_at).toBeInstanceOf(Date);
      const other = await h.waitingForApprover(await example(), plan, { amount: 5 * M });
      await expect(
        h.ctx.sql.query(`UPDATE access_requests SET grant_completed_at = now() WHERE id = $1`, [other]),
      ).rejects.toMatchObject({ code: '23514' });
    });
  });

  describe('who may read it', () => {
    it('lets the people who may see the request read it and answers 404 for anybody else, the Super Admin included', async () => {
      const u = await example();
      const stranger = await h.staff(await h.departmentWithUnit(`P-TS${counter}`), `TS-X${counter}`);
      const id = await h.waitingForApprover(u, plan, { amount: 5 * M });

      for (const account of [u.member.account, h.it1, u.head.account]) {
        expect((await timingsOf(id, account)).requestId).toBe(id);
      }
      for (const refused of [
        await h.timings(id, stranger.account).expect(404),
        await h.timings(id, h.boss.account).expect(404),
      ]) {
        expect(h.codeOf(refused)).toBe('ACCESS_REQUEST.NOT_FOUND');
      }
      const asSuperAdmin = await request(h.server())
        .get(`/api/v1/access-requests/${id}/timings`)
        .set({ Authorization: `Bearer ${h.admin}` })
        .expect(404);
      expect(h.codeOf(asSuperAdmin)).toBe('ACCESS_REQUEST.NOT_FOUND');
      expect(h.codeOf(await h.timings('11111111-1111-4111-8111-111111111111', h.it1).expect(404))).toBe(
        'ACCESS_REQUEST.NOT_FOUND',
      );
      expect(h.codeOf(await h.timings('not-an-id', h.it1).expect(422))).toBe('VALIDATION_ERROR');
    });

    it('shows an open segment while the request still waits in the queue of the head', async () => {
      const u = await example();
      const sent = await h.sent(u.member, plan, { termMonths: 1 });
      await h.decide(sent.id, { decision: 'APPROVE' }, u.head.account).expect(200);
      expect(await h.state(sent.id)).toBe('AWAITING_SPEND_SUBMISSION');

      const timings = await timingsOf(sent.id, u.member.account);

      expect(timings).toMatchObject({ approvedAt: null, approvalSeconds: null, countedInKpi: false });
      expect(timings.segments.QUEUE_WAIT).toMatchObject({ endedAt: null, seconds: null });
      expect(timings.segments.GRANT).toBeNull();
    });
  });
});
