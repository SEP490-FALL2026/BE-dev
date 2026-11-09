import request from 'supertest';
import { SpendHarness, Unit } from '../../support/spend-harness';

const h = new SpendHarness();
const M = 1_000_000;

interface ItemWire {
  requestId: string;
  position: number;
  outcome: string;
  stopReason: string | null;
  leftReason: string | null;
  leftAt: string | null;
  requestState: string;
}
interface QueueWire {
  requestId: string;
  stage: string;
  budgetOutcome: string | null;
  blockedReasons: string[];
  overBy: { currency: string } | null;
  readyToSubmit: boolean;
}

describe('sending requests on in a batch over PostgreSQL (US-06-14)', () => {
  let plan: string;
  let design: Unit;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    plan = await h.planOf(await h.subscription(10));
    await h
      .declareTaxProfile((await h.vendorOf(plan)).id, [{ taxType: 'GTGT', ratePercent: '10', deductible: true }])
      .expect(200);
    design = await h.departmentWithHead('P-DES');
    await h.budgetFor(design, { total: 1000 * M });
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  const waiting = (amount = 10 * M, unit: Unit = design) => h.paidRequest(unit, plan, { amount });
  const send = async (ids: string[], account = design.head.account) =>
    h.dataOf<{ batch: { id: string; itemCount: number; submittedBy: { employeeId: string } } }>(
      await h.sendOn(ids, account).expect(201),
    ).batch;
  const items = async (batchId: string, account = design.head.account) =>
    h.dataOf<{ items: ItemWire[] }>(await h.batchItems(batchId, account, { pageSize: 100 }).expect(200)).items;
  const queue = async (account = design.head.account) =>
    h.dataOf<{ items: QueueWire[] }>(await h.spendQueue(account, { pageSize: 100 }).expect(200)).items;
  const batches = () => h.budgetRows('spend_batches');

  describe('sending on (AC-1 to AC-4, AC-11)', () => {
    it('makes a batch of three, a step for the approver on each, and a record of who, when and which (AC-1)', async () => {
      const [first, second, third] = [await waiting(), await waiting(), await waiting()];

      const batch = await send([first, second, third]);

      expect(batch).toMatchObject({ itemCount: 3, submittedBy: { employeeId: design.head.employeeId } });
      expect((await items(batch.id)).map((item) => [item.requestId, item.outcome])).toEqual([
        [first, 'SENT_TO_APPROVER'],
        [second, 'SENT_TO_APPROVER'],
        [third, 'SENT_TO_APPROVER'],
      ]);
      for (const id of [first, second, third]) {
        expect(await h.steps(id, 'SPEND_APPROVAL')).toEqual([
          expect.objectContaining({ state: 'PENDING', assignee_employee_id: h.boss.employeeId }),
        ]);
        expect(await h.state(id)).toBe('AWAITING_SPEND_DECISION');
      }
      // The clock of the step starts when the batch is sent, not before.
      const clock = await h.ctx.sql.query<{ same: boolean }>(
        `SELECT bool_and(s.created_at = b.submitted_at) AS same
           FROM spend_batches b JOIN spend_batch_items i ON i.batch_id = b.id
           JOIN access_request_steps s ON s.request_id = i.request_id AND s.kind = 'SPEND_APPROVAL'
          WHERE b.id = $1`,
        [batch.id],
      );
      expect(clock.rows[0].same).toBe(true);
      const events = await h.ctx.sql.query<{ actor_app_user_id: string; after: { requestIds: string } }>(
        `SELECT actor_app_user_id, after FROM audit_events WHERE resource_id = $1 AND action = 'SPEND_BATCH.SUBMITTED'`,
        [batch.id],
      );
      expect(events.rows).toHaveLength(1);
      expect(events.rows[0].actor_app_user_id).toBe(design.head.account.appUserId);
      expect(events.rows[0].after.requestIds.split(',').sort()).toEqual([first, second, third].sort());
    });

    it('gives the approver nothing of a request that is not sent on (AC-2)', async () => {
      const id = await waiting();

      await h.checkOf(id, h.boss.account).expect(404);
      expect(await h.steps(id, 'SPEND_APPROVAL')).toEqual([]);
      expect(await h.state(id)).toBe('AWAITING_SPEND_SUBMISSION');
    });

    it('is an envelope: who, when and the list, and no decision, no state and no commitment (AC-3)', async () => {
      const commitments = await h.budgetRows('budget_commitments');
      const id = await waiting();

      const batch = await send([id]);

      const wire = h.dataOf<{ batch: Record<string, unknown> }>(
        await h.batchOf(batch.id, design.head.account).expect(200),
      ).batch;
      expect(Object.keys(wire).sort()).toEqual(['department', 'id', 'itemCount', 'submittedAt', 'submittedBy']);
      expect(await h.budgetRows('budget_commitments')).toBe(commitments);
      const [item] = await items(batch.id);
      expect(item).toMatchObject({
        requestId: id,
        leftReason: null,
        leftAt: null,
        requestState: 'AWAITING_SPEND_DECISION',
      });
    });

    it('is a batch of one when one is chosen, and the others stay in the queue (AC-4)', async () => {
      const [first, second, third] = [await waiting(), await waiting(), await waiting()];

      const batch = await send([first]);

      expect(batch.itemCount).toBe(1);
      const stillWaiting = (await queue()).map((item) => item.requestId);
      expect(stillWaiting).toEqual(expect.arrayContaining([second, third]));
      expect(stillWaiting).not.toContain(first);
    });

    it('can be sent at once when the request has just entered the queue, with nothing that gathers by the week (AC-11)', async () => {
      const id = await waiting();

      await h.sendOn([id], design.head.account).expect(201);

      expect(await h.state(id)).toBe('AWAITING_SPEND_DECISION');
    });

    it('is refused as a whole, and writes nothing, when a request is not waiting, is not theirs, or is named twice', async () => {
      const waitingId = await waiting();
      const done = await waiting();
      await send([done]);
      const before = await batches();
      const other = await h.departmentWithHead('P-OTH');
      await h.budgetFor(other, { total: 100 * M });
      const theirs = await waiting(10 * M, other);

      expect(h.codeOf(await h.sendOn([waitingId, done], design.head.account).expect(409))).toBe('SPEND.NOT_IN_QUEUE');
      expect(h.codeOf(await h.sendOn([waitingId, theirs], design.head.account).expect(404))).toBe(
        'ACCESS_REQUEST.NOT_FOUND',
      );
      expect(h.codeOf(await h.sendOn([waitingId, waitingId], design.head.account).expect(422))).toBe(
        'VALIDATION_ERROR',
      );
      expect(h.codeOf(await h.sendOn([], design.head.account).expect(422))).toBe('VALIDATION_ERROR');
      expect(await h.state(waitingId)).toBe('AWAITING_SPEND_SUBMISSION');
      expect(await batches()).toBe(before);
    });
  });

  describe('no line of the plan any more (AC-5, QĐ-101n)', () => {
    it('sends a request that waits in the queue as it is: the head has no line to attach, and none is kept', async () => {
      const ready = await waiting();

      const batch = await send([ready]);

      expect((await items(batch.id)).map((item) => [item.outcome, item.stopReason])).toEqual([
        ['SENT_TO_APPROVER', null],
      ]);
      const chosen = await h.ctx.sql.query(
        `SELECT 1 FROM audit_events WHERE resource_id = $1 AND action = 'ACCESS_REQUEST.PLAN_LINE_CHOSEN'`,
        [ready],
      );
      expect(chosen.rowCount).toBe(0);
    });

    it('has no route to choose a line or to list the lines of the plan', async () => {
      const id = await waiting();
      const as = h.as(design.head.account);
      const base = `/api/v1/access-requests/${id}`;

      await request(h.server()).put(`${base}/plan-line`).set(as).send({ offPlan: true }).expect(404);
      await request(h.server()).get(`${base}/plan-line-suggestions`).set(as).expect(404);
    });
  });

  describe('a request that stops does not hold the others back (AC-9, AC-12)', () => {
    it('BR-MF1-06i(iv): stays with the reason and without a step, and the head reads no figure of what is left (AC-9)', async () => {
      const ok = await waiting();
      const stale = await h.staleRequest(design);

      const batch = await send([ok, stale]);

      expect((await items(batch.id)).map((item) => [item.outcome, item.stopReason])).toEqual([
        ['SENT_TO_APPROVER', null],
        ['STOPPED', 'PRICE_EXPIRED'],
      ]);
      expect(await h.steps(stale, 'SPEND_APPROVAL')).toEqual([]);
      const row = (await queue()).find((item) => item.requestId === stale);
      expect(row).toMatchObject({ stage: 'BLOCKED', blockedReasons: ['PRICE_EXPIRED'], readyToSubmit: true });
      const text = JSON.stringify((await h.spendQueue(design.head.account, { pageSize: 100 })).body);
      expect(text).not.toMatch(/remaining|INSUFFICIENT|HIGH_VALUE|NO_ACTIVE_BUDGET|budget":\{/);
    });

    it('BR-MF1-06g(3)(i): a request over the base and the reserve stays in the queue, blocked, and the others go to the approver (AC-12)', async () => {
      const ok = await waiting();
      const big = await waiting(1500 * M);
      const batch = await send([ok, big]);

      expect((await items(batch.id)).map((item) => [item.outcome, item.stopReason])).toEqual([
        ['SENT_TO_APPROVER', null],
        ['STOPPED', 'OVER_RESERVE'],
      ]);
      expect(await h.steps(big, 'SPEND_APPROVAL')).toEqual([]);
      expect(await h.state(big)).toBe('AWAITING_SPEND_SUBMISSION');
      expect((await queue()).find((item) => item.requestId === big)).toMatchObject({
        stage: 'BLOCKED',
        budgetOutcome: 'BLOCKED',
        blockedReasons: ['OVER_RESERVE'],
        overBy: { currency: 'VND' },
      });
    });

    it('BR-MF1-06i: has no item that goes to Finance and none that Finance gives back: the batch never leaves a request for it', async () => {
      const id = await waiting(1500 * M);

      const batch = await send([id]);

      const [item] = await items(batch.id);
      expect(item).toMatchObject({ outcome: 'STOPPED', leftReason: null, leftAt: null });
      expect(await h.ctx.sql.query(`SELECT 1 FROM spend_batch_items WHERE outcome = 'SENT_TO_FINANCE'`)).toHaveProperty(
        'rowCount',
        0,
      );
    });
  });

  describe('BR-MF1-06h, RV-11: a request that uses the reserve waits for the line of reason of the head', () => {
    let counter = 0;
    /** 100 base and 50 reserve: a request of 120 uses the reserve, one of 10 is within the base. */
    const reserveUnit = async (): Promise<Unit> => {
      counter += 1;
      const unit = await h.departmentWithHead(`P-RS${counter}`);
      await h.budgetFor(unit, { total: 100 * M, reserve: 50 * M });

      return unit;
    };
    const submit = async (unit: Unit, ids: string[], confirmations?: { requestId: string; reason: string }[]) =>
      h.dataOf<{ batch: { id: string }; results: Array<Record<string, unknown>> }>(
        await h.sendOn(ids, unit.head.account, confirmations).expect(201),
      );

    it('BR-MF1-06h: stays in the queue, with no step, when no reason is given: the item says it awaits the confirmation', async () => {
      const unit = await reserveUnit();
      const uses = await waiting(120 * M, unit);

      const { batch, results } = await submit(unit, [uses]);

      expect(results).toEqual([
        {
          requestId: uses,
          outcome: 'AWAITING_RESERVE_CONFIRMATION',
          stopReason: null,
          reserveConfirmation: 'NOT_GIVEN',
        },
      ]);
      expect((await items(batch.id, unit.head.account))[0]).toMatchObject({ outcome: 'AWAITING_RESERVE_CONFIRMATION' });
      expect(await h.steps(uses, 'SPEND_APPROVAL')).toEqual([]);
      expect(await h.state(uses)).toBe('AWAITING_SPEND_SUBMISSION');
      const row = (await queue(unit.head.account)).find((item) => item.requestId === uses);
      expect(row).toMatchObject({ stage: 'RESERVE_CONFIRMATION', budgetOutcome: 'USES_RESERVE', blockedReasons: [] });
    });

    it('RV-11: sends it on in the same act when the head gives a reason, keeps the confirmation on the step it opened', async () => {
      const unit = await reserveUnit();
      const uses = await waiting(120 * M, unit);

      const { results } = await submit(unit, [uses], [{ requestId: uses, reason: 'The release cannot wait' }]);

      expect(results).toEqual([
        { requestId: uses, outcome: 'SENT_TO_APPROVER', stopReason: null, reserveConfirmation: 'APPLIED' },
      ]);
      const kept = await h.ctx.sql.query<{ reason: string; confirmed_by_employee_id: string }>(
        `SELECT c.reason, c.confirmed_by_employee_id FROM request_reserve_confirmations c
           JOIN access_request_steps s ON s.id = c.spend_step_id WHERE c.request_id = $1 AND s.kind = 'SPEND_APPROVAL'`,
        [uses],
      );
      expect(kept.rows).toEqual([
        { reason: 'The release cannot wait', confirmed_by_employee_id: unit.head.employeeId },
      ]);
      expect(await h.state(uses)).toBe('AWAITING_SPEND_DECISION');
    });

    it('RV-11: ignores a confirmation given for a request that does not use the reserve, and says so', async () => {
      const unit = await reserveUnit();
      const within = await waiting(10 * M, unit);
      const blocked = await waiting(400 * M, unit);

      const { results } = await submit(
        unit,
        [within, blocked],
        [
          { requestId: within, reason: 'Not needed' },
          { requestId: blocked, reason: 'Not enough either' },
        ],
      );

      expect(results).toEqual([
        { requestId: within, outcome: 'SENT_TO_APPROVER', stopReason: null, reserveConfirmation: 'IGNORED' },
        { requestId: blocked, outcome: 'STOPPED', stopReason: 'OVER_RESERVE', reserveConfirmation: 'IGNORED' },
      ]);
      const none = await h.ctx.sql.query(
        `SELECT 1 FROM request_reserve_confirmations WHERE request_id = ANY($1::uuid[])`,
        [[within, blocked]],
      );
      expect(none.rowCount).toBe(0);
    });

    it('RV-11: refuses the whole batch with 422 when a confirmation names a request that is not in it, and writes nothing', async () => {
      const unit = await reserveUnit();
      const inBatch = await waiting(10 * M, unit);
      const outside = await waiting(120 * M, unit);
      const before = await batches();

      const response = await h
        .sendOn([inBatch], unit.head.account, [{ requestId: outside, reason: 'Not part of the batch' }])
        .expect(422);

      expect(h.codeOf(response)).toBe('SPEND_BATCH.CONFIRMATION_NOT_IN_BATCH');
      expect(await batches()).toBe(before);
      expect(await h.state(inBatch)).toBe('AWAITING_SPEND_SUBMISSION');
    });

    it('P0-04: the endpoint confirms a request left in the queue, after which the approver holds the step', async () => {
      const unit = await reserveUnit();
      const uses = await waiting(120 * M, unit);
      await submit(unit, [uses]);

      const done = h.dataOf<{ reserveConfirmation: Record<string, unknown> }>(
        await h.confirmReserve(uses, { reason: 'Customer deadline' }, unit.head.account).expect(200),
      ).reserveConfirmation;

      expect(done).toMatchObject({
        result: 'SPEND_STEP_OPENED',
        budgetOutcome: 'USES_RESERVE',
        confirmationKept: true,
      });
      expect(await h.steps(uses, 'SPEND_APPROVAL')).toEqual([
        expect.objectContaining({ state: 'PENDING', assignee_employee_id: h.boss.employeeId }),
      ]);
      expect(h.codeOf(await h.confirmReserve(uses, { reason: 'Again' }, unit.head.account).expect(409))).toBe(
        'SPEND.RESERVE_NOT_PENDING',
      );
    });

    it('M-11: the confirmation stays when the head changes, and a request not yet confirmed goes to the successor', async () => {
      const unit = await reserveUnit();
      const confirmed = await waiting(120 * M, unit);
      const waitingOne = await waiting(25 * M, unit); // 150 in all less the 120 that wait: it still uses the reserve
      await submit(unit, [confirmed], [{ requestId: confirmed, reason: 'Kept through the change' }]);
      await submit(unit, [waitingOne]);
      counter += 1;
      const successor = await h.staff(unit.department, `SUC-${counter}`);
      await h.makeHead(unit.department, successor);

      expect((await queue(successor.account)).map((item) => item.requestId)).toContain(waitingOne);
      const kept = await h.ctx.sql.query(`SELECT 1 FROM request_reserve_confirmations WHERE request_id = $1`, [
        confirmed,
      ]);
      expect(kept.rowCount).toBe(1);
      await h.confirmReserve(waitingOne, { reason: 'The successor decides' }, successor.account).expect(200);
    });

    it('QT 1.6: the head who is a party to the request does not confirm it; another department head is refused too', async () => {
      const unit = await reserveUnit();
      const other = await reserveUnit();
      const uses = await waiting(120 * M, unit);
      await submit(unit, [uses]);

      expect(h.codeOf(await h.confirmReserve(uses, { reason: 'x' }, other.head.account).expect(403))).toBe(
        'SPEND.NOT_HEAD',
      );
      await h.confirmReserve(uses, { reason: 'x' }, unit.member.account).expect(403);
      await h.confirmReserve(uses, { reason: 'x' }, h.finance).expect(403);
      await h.confirmReserve(uses, { reason: 'x' }, h.boss.account).expect(403);
    });
  });

  describe('when the approver is a party (data of before QĐ-93, SoD-7)', () => {
    it('gives the step of that request to nobody: it waits for the approver, no substitute holds it, and the others stay with the approver', async () => {
      const own = await waiting();
      const conflicted = await waiting();
      await h.ctx.sql.query(`UPDATE access_request_beneficiaries SET employee_id = $2 WHERE request_id = $1`, [
        conflicted,
        h.boss.employeeId,
      ]);

      const batch = await send([own, conflicted]);

      // No item leaves the batch for a conflict of interest any more: that reason is only read from the history.
      expect((await items(batch.id)).map((item) => [item.outcome, item.leftReason])).toEqual([
        ['SENT_TO_APPROVER', null],
        ['SENT_TO_APPROVER', null],
      ]);
      expect(await h.steps(conflicted, 'SPEND_APPROVAL')).toEqual([
        expect.objectContaining({
          state: 'WAITING',
          assignee_employee_id: null,
          waiting_reason: 'SPENDING_APPROVER_IS_PARTY',
        }),
      ]);
      expect((await items(batch.id, h.boss.account)).map((item) => item.requestId)).toEqual([own]);
      await h.ctx.sql.query(`UPDATE access_request_beneficiaries SET employee_id = $2 WHERE request_id = $1`, [
        conflicted,
        design.member.employeeId,
      ]);
    });
  });

  describe('who sends and who reads (AC-10, AC-1)', () => {
    it.each([
      ['an Employee', () => design.member.account],
      ['Finance', () => h.finance],
      ['an IT Admin', () => h.it1],
    ])('is closed to %s', async (_name, account) => {
      const id = await waiting();

      await h.sendOn([id], account()).expect(403);
      await h.spendQueue(account()).expect(403);
      expect(await h.state(id)).toBe('AWAITING_SPEND_SUBMISSION');
    });

    it('is closed to the Super Admin and to a person who heads no department', async () => {
      const id = await waiting();

      const admin = { Authorization: `Bearer ${h.admin}` };
      await request(h.server()).get('/api/v1/spend-queue').set(admin).expect(403);
      await request(h.server())
        .post('/api/v1/spend-batches')
        .set(admin)
        .send({ requestIds: [id] })
        .expect(403);
      await h.sendOn([id], design.member.account).expect(403);
    });

    it('is read by the head who sent it, by the approver who holds a step of it and by Finance, and by nobody else', async () => {
      const id = await waiting();
      const batch = await send([id]);
      const stranger = await h.departmentWithHead('P-STR');

      await h.batchOf(batch.id, design.head.account).expect(200);
      await h.batchOf(batch.id, h.boss.account).expect(200);
      await h.batchOf(batch.id, h.finance).expect(200);
      await h.batchOf(batch.id, stranger.head.account).expect(404);
      await h.batchItems(batch.id, stranger.head.account).expect(404);
      await h.batchItems(batch.id, design.member.account).expect(404);
    });

    it('is a queue only the head of the department reads: of their own department, and the approver has none of it', async () => {
      const id = await waiting();
      const other = await h.departmentWithHead('P-QU');

      expect((await queue()).map((item) => item.requestId)).toContain(id);
      expect((await queue(other.head.account)).map((item) => item.requestId)).not.toContain(id);
      // The approver heads no department (QĐ-93b), so the queue of a head is not theirs to read.
      await h.spendQueue(h.boss.account).expect(403);
    });
  });
});
