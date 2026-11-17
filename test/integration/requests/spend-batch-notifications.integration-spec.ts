import { StatusHarness } from '../../support/status-harness';
import type { Unit } from '../../support/spend-harness';

const h = new StatusHarness();
const M = 1_000_000;

interface SubmitWire {
  batch: { id: string };
  results: Array<Record<string, unknown>>;
}

describe('the spending approver told of the requests sent to them, over PostgreSQL (FX-T3b, Q-5A-1 = B)', () => {
  let plan: string;
  let counter = 0;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    plan = await h.planOf(await h.subscription(10));
    await h
      .declareTaxProfile((await h.vendorOf(plan)).id, [{ taxType: 'GTGT', ratePercent: '10', deductible: true }])
      .expect(200);
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  /** 100 base and 50 reserve: a request of 120 uses the reserve, one of 10 is within the base, one of 400 is blocked. */
  const reserveUnit = async (): Promise<Unit> => {
    counter += 1;
    const unit = await h.departmentWithHead(`P-BN${counter}`);
    await h.budgetFor(unit, { total: 100 * M, reserve: 50 * M });
    await h.setItAdminInCharge(unit.department, { employeeId: h.it1.employeeId, account: h.it1 });

    return unit;
  };
  const waiting = (unit: Unit, amount: number) => h.paidRequest(unit, plan, { amount });
  const submit = async (unit: Unit, ids: string[], confirmations?: { requestId: string; reason: string }[]) =>
    h.dataOf<SubmitWire>(await h.sendOn(ids, unit.head.account, confirmations).expect(201));
  const batchNotices = () => h.noticesOf(h.boss.employeeId, 'SPEND_BATCH_SUBMITTED');

  describe('B2: one notice for each batch', () => {
    it('tells the approver once of a batch of three (within the base, confirmed in the batch, blocked): two steps, one notice, the answer unchanged', async () => {
      const unit = await reserveUnit();
      const within = await waiting(unit, 10 * M);
      const uses = await waiting(unit, 120 * M);
      const blocked = await waiting(unit, 400 * M);
      const before = (await batchNotices()).length;

      const { batch, results } = await submit(
        unit,
        [within, uses, blocked],
        [{ requestId: uses, reason: 'The release cannot wait' }],
      );
      await h.project();

      expect(results).toEqual([
        { requestId: within, outcome: 'SENT_TO_APPROVER', stopReason: null, reserveConfirmation: 'NOT_GIVEN' },
        { requestId: uses, outcome: 'SENT_TO_APPROVER', stopReason: null, reserveConfirmation: 'APPLIED' },
        { requestId: blocked, outcome: 'STOPPED', stopReason: 'OVER_RESERVE', reserveConfirmation: 'NOT_GIVEN' },
      ]);
      const told = (await batchNotices()).slice(before);
      expect(told).toHaveLength(1);
      expect(told[0]).toMatchObject({
        recipient_employee_id: h.boss.employeeId,
        subject_type: 'SPEND_BATCH',
        subject_id: batch.id,
        event_key: `SPEND_BATCH_SUBMITTED:${batch.id}`,
        params: { batchId: batch.id, departmentId: unit.department.id, sentCount: 2 },
      });
      // The head who sent the batch is told nothing, and no request of the batch has a notice of its own for the approver.
      expect(await h.noticesOf(unit.head.employeeId, 'SPEND_BATCH_SUBMITTED')).toEqual([]);
      for (const id of [within, uses, blocked]) expect(await h.codesFor(h.boss.employeeId, id)).toEqual([]);
    });

    it('tells nobody of a batch that opens no step: the requests are blocked or wait for the head', async () => {
      const unit = await reserveUnit();
      const uses = await waiting(unit, 120 * M);
      const blocked = await waiting(unit, 400 * M);
      const before = (await batchNotices()).length;

      const { results } = await submit(unit, [uses, blocked]);

      expect(results.map((item) => item.outcome)).toEqual(['AWAITING_RESERVE_CONFIRMATION', 'STOPPED']);
      expect(await batchNotices()).toHaveLength(before);
    });

    it('tells nobody of a batch whose only step waits because no approver can hold it', async () => {
      const unit = await reserveUnit();
      const conflicted = await waiting(unit, 10 * M);
      await h.ctx.sql.query(`UPDATE access_request_beneficiaries SET employee_id = $2 WHERE request_id = $1`, [
        conflicted,
        h.boss.employeeId,
      ]);
      const before = (await batchNotices()).length;

      await submit(unit, [conflicted]);

      expect(await h.steps(conflicted, 'SPEND_APPROVAL')).toEqual([
        expect.objectContaining({ state: 'WAITING', assignee_employee_id: null }),
      ]);
      expect(await batchNotices()).toHaveLength(before);
    });
  });

  describe('B2: a confirmation of the reserve given after the batch', () => {
    it('tells the approver who holds the step it opened (SPEND_SENT), as the head confirms the reserve alone', async () => {
      const unit = await reserveUnit();
      const uses = await waiting(unit, 120 * M);
      await submit(unit, [uses]);

      await h.confirmReserve(uses, { reason: 'Customer deadline' }, unit.head.account).expect(200);
      await h.project();

      expect(await h.codesFor(h.boss.employeeId, uses)).toEqual(['STEP_ASSIGNED']);
      expect((await h.noticesOf(h.boss.employeeId, 'STEP_ASSIGNED')).pop()?.params).toEqual({
        requestId: uses,
        stepKind: 'SPEND_APPROVAL',
        cause: 'SPEND_SENT',
      });
      // The head confirmed it, so they are not told the step is the approver's; the one notice they hold is of the need step.
      const ofHead = (await h.noticesOf(unit.head.employeeId, 'STEP_ASSIGNED')).filter(
        (row) => row.subject_id === uses,
      );
      expect(ofHead.map((row) => row.params.cause)).toEqual(['SUBMITTED']);
    });

    it('tells the approver too when the check made again finds the request within the base now (SPEND_SENT)', async () => {
      const unit = await reserveUnit();
      const uses = await waiting(unit, 120 * M);
      await submit(unit, [uses]);
      await h.setPayments(uses, { amount: 10 * M });

      const done = h.dataOf<{ reserveConfirmation: { budgetOutcome: string; confirmationKept: boolean } }>(
        await h.confirmReserve(uses, { reason: 'Now it fits' }, unit.head.account).expect(200),
      ).reserveConfirmation;
      await h.project();

      expect(done).toMatchObject({ budgetOutcome: 'WITHIN_BASE', confirmationKept: false });
      expect(await h.codesFor(h.boss.employeeId, uses)).toEqual(['STEP_ASSIGNED']);
      expect((await h.noticesOf(h.boss.employeeId, 'STEP_ASSIGNED')).pop()?.params).toMatchObject({
        stepKind: 'SPEND_APPROVAL',
        cause: 'SPEND_SENT',
      });
    });
  });

  describe('B3: an item of a batch that cannot be priced', () => {
    it('tells the requester and the IT Admin in charge why it stopped, and not the head who sent the batch', async () => {
      const unit = await reserveUnit();
      const unpriced = await waiting(unit, 10 * M);
      // An amount left in a currency with no rate cannot be checked: the batch stops the request there and goes on.
      await h.setPayments(unpriced, { amount: 100_000, currency: 'USD' });

      const { results } = await submit(unit, [unpriced]);
      await h.project();

      expect(results).toEqual([
        { requestId: unpriced, outcome: 'STOPPED', stopReason: 'PRICE_MISSING', reserveConfirmation: 'NOT_GIVEN' },
      ]);
      expect(await h.codesFor(unit.member.employeeId, unpriced)).toContain('REQUEST_BUDGET_BLOCKED');
      expect(await h.codesFor(h.it1.employeeId, unpriced)).toEqual(['REQUEST_BUDGET_BLOCKED']);
      expect((await h.noticesOf(h.it1.employeeId, 'REQUEST_BUDGET_BLOCKED')).pop()?.params).toEqual({
        requestId: unpriced,
        reasons: 'PRICE_MISSING',
      });
      expect(await h.codesFor(unit.head.employeeId, unpriced)).not.toContain('REQUEST_BUDGET_BLOCKED');
    });

    it('a confirmation of the reserve that cannot be priced is refused and writes no audit of it: nothing is told', async () => {
      const unit = await reserveUnit();
      const uses = await waiting(unit, 120 * M);
      await submit(unit, [uses]);
      await h.setPayments(uses, { amount: 100_000, currency: 'USD' });

      await h.confirmReserve(uses, { reason: 'Customer deadline' }, unit.head.account).expect(409);
      await h.project();

      const audit = await h.ctx.sql.query(
        `SELECT 1 FROM audit_events WHERE resource_id = $1 AND action = 'ACCESS_REQUEST.SPEND_NOT_CHECKABLE'`,
        [uses],
      );
      expect(audit.rowCount).toBe(0);
      expect(await h.codesFor(unit.member.employeeId, uses)).not.toContain('REQUEST_BUDGET_BLOCKED');
    });
  });
});
