import { Client } from 'pg';
import { SpendHarness, Unit } from '../../support/spend-harness';

const h = new SpendHarness();
const M = 1_000_000;

interface YearWire {
  year: number;
  code: string | null;
  cost: { amount: string };
  budget: { amount: string } | null;
  held: { amount: string } | null;
  spent: { amount: string } | null;
  remaining: { amount: string } | null;
  pending: { amount: string } | null;
  base: { amount: string } | null;
  reserve: { amount: string } | null;
  remainingBase: { amount: string } | null;
  remainingWithReserve: { amount: string } | null;
}
interface DetailWire {
  step: {
    state: string;
    samePersonAsSpend: boolean;
    assignee: { employeeId: string } | null;
  };
  request: { state: string };
  need: { decidedBy: { employeeId: string } } | null;
  cost: {
    estimatedCost: { amount: string };
    deductibleTax: { amount: string };
    nonDeductibleTax: { amount: string };
  } | null;
  decision: { decision: string; reason: string | null } | null;
  budgetSnapshot: Record<string, unknown> | null;
  annualVendorAmount: { amount: string } | null;
}

describe('the decision of the spending approver over PostgreSQL (US-06-01)', () => {
  let plan: string;
  let taxedPlan: string;
  let counter = 0;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    plan = await h.planOf(await h.subscription(10));
    taxedPlan = await h.planOf(await h.subscription(10));
    await h
      .declareTaxProfile((await h.vendorOf(plan)).id, [{ taxType: 'GTGT', ratePercent: '10', deductible: true }])
      .expect(200);
    await h
      .declareTaxProfile((await h.vendorOf(taxedPlan)).id, [
        { taxType: 'GTGT', ratePercent: '10', deductible: true },
        { taxType: 'TNDN nhà thầu', ratePercent: '5', deductible: false },
      ])
      .expect(200);
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  const unit = async (): Promise<Unit> => {
    counter += 1;

    return h.departmentWithHead(`P-A${counter}`);
  };
  /** The example of the stories: 100 million, 20 held, 40 spent, so 40 left. */
  const example = async (extra: { held?: number; spent?: number; reserve?: number } = {}) => {
    const u = await unit();
    const version = await h.budgetFor(u, { total: 100 * M, held: 20 * M, spent: 40 * M, ...extra });

    return { u, version };
  };
  const detail = async (id: string, account = h.boss.account) =>
    h.dataOf<{ spendApproval: DetailWire }>(await h.approvalOf(id, account).expect(200)).spendApproval;
  const years = async (id: string, account = h.boss.account) =>
    h.dataOf<{ items: YearWire[] }>(await h.checkYears(id, account).expect(200)).items;
  const approve = (id: string, over: object = {}, account = h.boss.account) =>
    h.decideSpend(id, { decision: 'APPROVE', ...over }, account);
  const records = async (id: string) =>
    (
      await h.ctx.sql.query<{ decision: string; decider_role: string; reason: string | null }>(
        `SELECT decision, decider_role, reason FROM approval_records WHERE request_id = $1 AND step_id IN (SELECT id FROM access_request_steps WHERE kind = 'SPEND_APPROVAL') ORDER BY decided_at`,
        [id],
      )
    ).rows;
  const decided = async (id: string) =>
    (
      await h.ctx.sql.query<{ check_id: string | null }>(`SELECT check_id FROM spend_decisions WHERE request_id = $1`, [
        id,
      ])
    ).rows;

  describe('what the approver sees (AC-1, AC-9, AC-10, AC-14)', () => {
    it('is the request, what the head confirmed and the figures of the budget with what the others that wait cost (AC-1)', async () => {
      const { u } = await example();
      const first = await h.waitingForApprover(u, plan, { amount: 15 * M });
      await h.waitingForApprover(u, plan, { amount: 15 * M });

      const queue = h.dataOf<{ items: Array<{ requestId: string; primaryCode: string; batchId: string | null }> }>(
        await h.approvals(h.boss.account, { pageSize: 100 }).expect(200),
      );
      const view = await detail(first);

      expect(queue.items.find((item) => item.requestId === first)).toMatchObject({ primaryCode: 'BUDGET_OK' });
      expect(queue.items.find((item) => item.requestId === first)?.batchId).not.toBeNull();
      expect(view).toMatchObject({
        step: { state: 'PENDING', assignee: { employeeId: h.boss.employeeId } },
        need: { decidedBy: { employeeId: u.head.employeeId } },
      });
      // BR-MF1-07b: the snapshot has the two levels, what is spent, held and waiting.
      expect(view.budgetSnapshot).toMatchObject({
        year: h.year,
        base: { amount: String(100 * M) },
        reserve: { amount: '0' },
        spent: { amount: String(40 * M) },
        committed: { amount: String(20 * M) },
        pending: { amount: String(15 * M) },
        remainingBase: { amount: String(25 * M) },
        remainingWithReserve: { amount: String(25 * M) },
        outcome: 'WITHIN_BASE',
        blockedReasons: [],
        reserveConfirmation: null,
      });
      expect(view.annualVendorAmount).toBeNull();
      expect((await years(first))[0]).toMatchObject({
        code: 'BUDGET_OK',
        budget: { amount: String(100 * M) },
        held: { amount: String(20 * M) },
        spent: { amount: String(40 * M) },
        remaining: { amount: String(25 * M) },
        pending: { amount: String(15 * M) },
      });
    });

    it('counts as waiting only what the same Cost Center asks in the same year (AC-9)', async () => {
      const { u } = await example();
      const other = await example();
      const first = await h.waitingForApprover(u, plan, { amount: 15 * M });
      await h.waitingForApprover(other.u, plan, { amount: 30 * M });
      await h.budgetFor(u, { total: 100 * M, year: h.next });
      await h.waitingForApprover(u, plan, { year: h.next, amount: 10 * M });

      expect((await years(first))[0].pending).toEqual({ amount: '0', currency: 'VND' });
      const second = await h.waitingForApprover(u, plan, { amount: 12 * M });
      expect((await years(second))[0].pending).toEqual({ amount: String(15 * M), currency: 'VND' });
    });

    it('shows the estimate of the tax apart, and counts the price before tax as waiting (AC-14, FR-3.2, QĐ-109)', async () => {
      const { u } = await example();
      const first = await h.waitingForApprover(u, taxedPlan, { amount: 20 * M });
      const second = await h.waitingForApprover(u, taxedPlan, { amount: 5 * M });

      const view = await detail(first);

      // 20 million before tax, 2 million of tax that is deducted and 1 million that is not: the estimate says 21, the amount that waits is 20.
      expect(view.cost).toMatchObject({
        estimatedCost: { amount: String(21 * M) },
        deductibleTax: { amount: String(2 * M) },
        nonDeductibleTax: { amount: String(1 * M) },
      });
      expect((await years(second))[0].pending).toEqual({ amount: String(20 * M), currency: 'VND' });
    });

    it('is closed to those who do not hold the step, and nothing of a request that is blocked is open to the approver (AC-8, AC-17)', async () => {
      const { u } = await example();
      const id = await h.waitingForApprover(u, plan, { amount: 15 * M });
      const waiting = await h.paidRequest(u, plan, { amount: 50 * M }); // more than the 40 left, no reserve: blocked
      await h.sendOn([waiting], u.head.account).expect(201);

      for (const account of [h.finance, u.head.account, h.it1, u.member.account]) {
        await h.approvalOf(id, account).expect(404);
      }
      expect(await h.steps(waiting, 'SPEND_APPROVAL')).toEqual([]);
      expect(await h.state(waiting)).toBe('AWAITING_SPEND_SUBMISSION');
      const queue = h.dataOf<{ items: Array<{ requestId: string }> }>(
        await h.approvals(h.boss.account, { pageSize: 100 }).expect(200),
      );
      expect(queue.items.map((item) => item.requestId)).not.toContain(waiting);
      expect(queue.items.map((item) => item.requestId)).toContain(id);
    });
  });

  describe('software that was not in the catalog (AC-10)', () => {
    it('shows the level of control, the risk and the conclusion of the IT Admin, which the approver cannot change', async () => {
      const { u } = await example();
      const id = await h.staleRequest(u);
      await h.ctx.sql.query(
        `UPDATE access_request_assessments SET quote_valid_until = current_date + 1 WHERE request_id = $1`,
        [id],
      );
      await h.sendOn([id], u.head.account).expect(201);

      const view = h.dataOf<{
        spendApproval: { assessment: Record<string, unknown>; request: { softwareName: string } };
      }>(await h.approvalOf(id, h.boss.account).expect(200)).spendApproval;

      expect(view.assessment).toMatchObject({
        classification: 'PAID_LICENSED',
        controlLevel: 'PARTIAL',
        controlRiskNote: 'No export of usage',
        equivalentTool: null,
      });
      expect(view.request.softwareName).toBe('Miro');
      await h.saveAssessment(id, { controlLevel: 'FULL' }, h.boss.account).expect(403);
      await h.completeAssessment(id, h.boss.account).expect(403);
    });
  });

  describe('approving and refusing (AC-2, AC-4, AC-12)', () => {
    it('approves, keeps the electronic record of the approver and the snapshot, and sends the request to the IT Admin (AC-2, AC-12)', async () => {
      const { u, version } = await example();
      const id = await h.waitingForApprover(u, plan, { amount: 15 * M });

      const response = await approve(id).expect(200);

      expect(h.dataOf<{ spendApproval: DetailWire }>(response).spendApproval).toMatchObject({
        step: { state: 'APPROVED' },
        request: { state: 'AWAITING_EXECUTION' },
        decision: { decision: 'APPROVED' },
      });
      // Nobody decides in place of the approver and no exception is accepted past the budget (QĐ-93, QĐ-97c).
      expect(h.dataOf<{ spendApproval: DetailWire }>(response).spendApproval.decision).not.toHaveProperty(
        'overrideReason',
      );
      expect(await records(id)).toEqual([
        expect.objectContaining({ decision: 'APPROVED', decider_role: 'SPENDING_APPROVER', reason: null }),
      ]);
      const [kept] = await decided(id);
      expect(kept.check_id).not.toBeNull();
      // What the budget does afterwards does not change what the decision was made on.
      await h.commit(u, version.id, h.year, 30 * M, 'HELD');
      const after = (await years(id))[0];
      expect(after).toMatchObject({ remaining: { amount: String(40 * M) }, held: { amount: String(20 * M) } });
      const trigger = await h.ctx.sql.query<{ trigger: string }>(
        `SELECT trigger FROM request_budget_checks WHERE id = $1`,
        [kept.check_id],
      );
      expect(trigger.rows[0].trigger).toBe('SPEND_DECISION');
    });

    it('does not decide a step twice', async () => {
      const { u } = await example();
      const id = await h.waitingForApprover(u, plan, { amount: 15 * M });
      await approve(id).expect(200);

      const again = await approve(id).expect(409);

      expect(h.codeOf(again)).toBe('SPEND.NO_SPEND_STEP');
      expect(await records(id)).toHaveLength(1);
    });

    it('never answers 409 for a spend step after a transfer of the role: the new holder decides, anybody else is refused as not the assignee', async () => {
      const { u } = await example();
      const transferred = await h.waitingForApprover(u, plan, { amount: 15 * M });
      const other = await h.waitingForApprover(u, plan, { amount: 15 * M });
      counter += 1;
      const next = await h.staff(await h.departmentWithUnit(`P-NX${counter}`), `NX-${counter}`);
      const substitute = await h.staff(await h.departmentWithUnit(`P-SB${counter}`), `SB-${counter}`);
      // A step of the rule before QĐ-93 (the migration of the removal refuses a database that still has one): the substitute holds
      // it and never held the role. Nothing freezes it any more (`STEP_AWAITING_CONVERSION` is gone), so it is refused as a step
      // of somebody else is, with the code of every refusal of a person who does not hold the step.
      await h.ctx.sql.query(
        `UPDATE access_request_steps SET assignee_employee_id = $2 WHERE request_id = $1 AND kind = 'SPEND_APPROVAL'`,
        [other, substitute.employeeId],
      );

      try {
        // The role is handed over: the step the approver held goes to the new one, who decides it with no 409.
        await h.setRole('SPENDING_APPROVER', next);
        await approve(transferred, {}, next.account).expect(200);
        expect(h.codeOf(await approve(other, {}, next.account).expect(403))).toBe('SPEND.NOT_THE_ASSIGNEE');
        expect(await records(other)).toEqual([]);
        expect(await decided(other)).toEqual([]);
        expect(await h.state(other)).toBe('AWAITING_SPEND_DECISION');
      } finally {
        await h.setRole('SPENDING_APPROVER', h.boss);
      }
    });

    it('refuses with a reason, ends the request as refused, and makes nothing after it (AC-4)', async () => {
      const { u } = await example();
      const id = await h.waitingForApprover(u, plan, { amount: 15 * M });

      const missing = await h.decideSpend(id, { decision: 'REJECT' }, h.boss.account).expect(422);
      const blank = await h.decideSpend(id, { decision: 'REJECT', reason: '  ' }, h.boss.account).expect(422);
      const response = await h
        .decideSpend(id, { decision: 'REJECT', reason: 'Not this quarter' }, h.boss.account)
        .expect(200);

      expect([h.codeOf(missing), h.codeOf(blank)]).toEqual(['VALIDATION_ERROR', 'VALIDATION_ERROR']);
      expect(h.dataOf<{ spendApproval: DetailWire }>(response).spendApproval).toMatchObject({
        request: { state: 'REJECTED' },
        decision: { decision: 'REJECTED', reason: 'Not this quarter' },
      });
      expect(await records(id)).toEqual([
        expect.objectContaining({ decision: 'REJECTED', reason: 'Not this quarter' }),
      ]);
      expect(await h.steps(id, 'SPEND_APPROVAL')).toEqual([expect.objectContaining({ state: 'REJECTED' })]);
      const wire = h.dataOf<{ request: { state: string; spend: { stage: string; refusalReason: string } } }>(
        await h.fetch(id, u.member.account).expect(200),
      ).request;
      expect(wire).toMatchObject({ state: 'REJECTED', spend: { stage: 'REFUSED', refusalReason: 'Not this quarter' } });
    });

    it('is not for Finance, the head, the IT Admin or an Employee, and not for the person who asked (AC-8)', async () => {
      const { u } = await example();
      const id = await h.waitingForApprover(u, plan, { amount: 15 * M });

      for (const account of [h.finance, u.head.account, h.it1]) {
        expect(h.codeOf(await approve(id, {}, account).expect(403))).toBe('SPEND.NOT_THE_ASSIGNEE');
      }
      expect(h.codeOf(await approve(id, {}, u.member.account).expect(403))).toBe('SPEND.OWN_REQUEST');
      await h.ctx.sql.query(`UPDATE access_requests SET requester_employee_id = $2 WHERE id = $1`, [
        id,
        h.boss.employeeId,
      ]);
      expect(h.codeOf(await approve(id).expect(403))).toBe('SPEND.OWN_REQUEST');
      expect(await records(id)).toEqual([]);
    });

    it('has two records of two decisions, each flagged as one person, when the same person holds both steps (AC-7)', async () => {
      // A head's own request goes to the spending approver for the need (row 2), who also holds the spend step.
      const { u } = await example();
      const sent = await h.sent(u.head, plan, { termMonths: 1 });
      await h.decide(sent.id, { decision: 'APPROVE' }, h.boss.account).expect(200);
      await h.setPayments(sent.id, { amount: 10 * M });
      const id = sent.id;

      await approve(id).expect(200);

      const all = await h.ctx.sql.query<{ kind: string; same_person_as_spend: boolean }>(
        `SELECT s.kind, s.same_person_as_spend FROM access_request_steps s WHERE s.request_id = $1 AND s.kind IN ('NEED', 'SPEND_APPROVAL')`,
        [id],
      );
      expect(all.rows.map((row) => [row.kind, row.same_person_as_spend]).sort()).toEqual([
        ['NEED', true],
        ['SPEND_APPROVAL', true],
      ]);
      const count = await h.ctx.sql.query(`SELECT 1 FROM approval_records WHERE request_id = $1`, [id]);
      expect(count.rowCount).toBe(2);
    });
  });

  describe('BR-MF1-07c: a request that is blocked is not approved, and there is no override (QĐ-97c)', () => {
    it('BR-MF1-06g: a request that costs more than what is left with the reserve stays in the queue of its head: no spend step, nothing to approve', async () => {
      const { u } = await example();
      const id = await h.paidRequest(u, plan, { amount: 45 * M });
      await h.sendOn([id], u.head.account).expect(201);

      const refused = await approve(id).expect(409);

      expect(h.codeOf(refused)).toBe('SPEND.NO_SPEND_STEP');
      expect(await records(id)).toEqual([]);
      expect(await decided(id)).toEqual([]);
      expect((await years(id, h.finance))[0]).toMatchObject({
        code: 'INSUFFICIENT_BUDGET',
        remainingBase: { amount: String(40 * M) },
        remainingWithReserve: { amount: String(40 * M) },
      });
    });

    it('L2-14 AC-23: a body that carries an override is not a body, whatever the request is', async () => {
      const { u } = await example();
      const ok = await h.waitingForApprover(u, plan, { amount: 15 * M });

      const needless = await approve(ok, { override: { reason: 'Why', years: [h.year] } }).expect(422);

      expect(h.codeOf(needless)).toBe('VALIDATION_ERROR');
      expect(await records(ok)).toEqual([]);
    });

    it('BR-MF1-06g(3)(ii): a year with no approved version blocks the request and says it has none, not that it has nothing', async () => {
      const u = await unit();
      const id = await h.paidRequest(u, plan, { amount: 30 * M });
      await h.sendOn([id], u.head.account).expect(201);

      const view = (await years(id, h.finance))[0];

      expect(view).toMatchObject({ code: 'NO_ACTIVE_BUDGET', budget: null, remaining: null, base: null });
      expect(await h.steps(id, 'SPEND_APPROVAL')).toEqual([]);
      expect(await h.state(id)).toBe('AWAITING_SPEND_SUBMISSION');
    });

    it('QĐ-109: names the year the amount is counted in when that year has no approved version', async () => {
      // Rewritten from "a request over several years": the request has one amount for one year now.
      const u = await unit();
      await h.budgetFor(u, { total: 5_000_000 });
      const id = await h.paidRequest(u, plan, { amount: 2_400_000, year: h.next });
      await h.sendOn([id], u.head.account).expect(201);

      expect((await years(id, h.finance)).map((year) => [year.year, year.code])).toEqual([
        [h.next, 'NO_ACTIVE_BUDGET'],
      ]);
      expect(await h.steps(id, 'SPEND_APPROVAL')).toEqual([]);
    });
  });

  describe('BR-MF1-06h, BR-MF1-07c: a request that uses the reserve is approved on the confirmation of the head', () => {
    /** 100 base, 20 held, 40 spent, a reserve of 10: 40 left of the base and 50 with the reserve. */
    const withReserve = async () => {
      const { u } = await example({ reserve: 10 * M });
      const id = await h.paidRequest(u, plan, { amount: 45 * M });

      return { u, id };
    };

    it('BR-MF1-06h: is approved, the decision keeps the check that used the reserve, the flag and the line of reason of the head', async () => {
      const { u, id } = await withReserve();
      await h.sendOn([id], u.head.account, [{ requestId: id, reason: 'The release cannot wait' }]).expect(201);

      const before = await detail(id);
      expect(before.budgetSnapshot).toMatchObject({
        outcome: 'USES_RESERVE',
        base: { amount: String(100 * M) },
        reserve: { amount: String(10 * M) },
        remainingBase: { amount: String(40 * M) },
        remainingWithReserve: { amount: String(50 * M) },
        overBaseBy: { amount: String(5 * M) },
        reserveConfirmation: { reason: 'The release cannot wait', confirmedBy: { employeeId: u.head.employeeId } },
        decisionSnapshotCheckId: null,
      });
      const response = await approve(id).expect(200);

      const after = h.dataOf<{ spendApproval: DetailWire }>(response).spendApproval;
      expect(after.budgetSnapshot).toMatchObject({
        outcome: 'USES_RESERVE',
        decisionSnapshotCheckId: expect.stringMatching(/./) as string,
      });
      const audit = await h.ctx.sql.query<{ after: Record<string, unknown> }>(
        `SELECT after FROM audit_events WHERE action = 'ACCESS_REQUEST.SPEND_APPROVED' AND resource_id::uuid IN
           (SELECT id FROM access_request_steps WHERE request_id = $1)`,
        [id],
      );
      expect(audit.rows[0].after).toMatchObject({ usesReserve: true, reserveReason: 'The release cannot wait' });
      const commitment = await h.ctx.sql.query<{ amount_minor: string }>(
        `SELECT amount_minor FROM budget_commitments WHERE request_id = $1`,
        [id],
      );
      expect(commitment.rows.map((row) => row.amount_minor)).toEqual([String(45 * M)]);
    });

    it('BR-MF1-07c: the confirmation of the endpoint opens the step too, and the approver approves it the same way', async () => {
      const { u, id } = await withReserve();
      await h.sendOn([id], u.head.account).expect(201);
      expect(await h.steps(id, 'SPEND_APPROVAL')).toEqual([]);

      await h.confirmReserve(id, { reason: 'Customer deadline' }, u.head.account).expect(200);

      expect((await detail(id)).budgetSnapshot).toMatchObject({ reserveConfirmation: { reason: 'Customer deadline' } });
      await approve(id).expect(200);
    });
  });

  describe('who may decide is judged before the row of the request is locked (R-D2)', () => {
    it('answers a request with no spend step at once, even while another transaction holds the row of the request', async () => {
      const { u } = await example();
      const id = await h.paidRequest(u, plan, { amount: 45 * M });
      await h.sendOn([id], u.head.account).expect(201);
      expect(await h.steps(id, 'SPEND_APPROVAL')).toEqual([]);
      const holder = new Client({ connectionString: h.ctx.database.url });
      await holder.connect();
      await holder.query('BEGIN');
      await holder.query('SELECT id FROM access_requests WHERE id = $1 FOR UPDATE', [id]);
      try {
        const answer = await Promise.race([
          approve(id).then((response) => response.status),
          new Promise<string>((resolve) => setTimeout(() => resolve('waited for the lock'), 4000)),
        ]);

        expect(answer).toBe(409);
      } finally {
        await holder.query('ROLLBACK');
        await holder.end();
      }
    });
  });

  describe('BR-MF1-07c: a request that has to be checked again as it is decided (AC-18)', () => {
    it('goes back to its head, with nothing decided, when it became blocked: over the reserve now', async () => {
      const { u, version } = await example({ held: 10 * M, spent: 0 }); // 90 left
      const id = await h.waitingForApprover(u, plan, { amount: 20 * M });
      await h.commit(u, version.id, h.year, 75 * M, 'HELD'); // another request was approved: 15 left, no reserve

      const response = await approve(id).expect(409);

      expect(h.codeOf(response)).toBe('SPEND.RECHECKED_RETURNED_TO_HEAD');
      expect(h.detailsOf(response)).toMatchObject({ reasons: ['OVER_RESERVE'] });
      expect(await records(id)).toEqual([]);
      expect(await decided(id)).toEqual([]);
      expect(await h.steps(id, 'SPEND_APPROVAL')).toEqual([expect.objectContaining({ state: 'CLOSED' })]);
      expect(await h.state(id)).toBe('AWAITING_SPEND_SUBMISSION');
      const head = h.dataOf<{ request: { spend: { stage: string; blockedReasons: string[] } } }>(
        await h.fetch(id, u.member.account).expect(200),
      );
      expect(head.request.spend).toMatchObject({ stage: 'BLOCKED', blockedReasons: ['OVER_RESERVE'] });
    });

    it('BR-MF1-07c: goes back with RESERVE_UNCONFIRMED when it now uses a reserve nobody confirmed', async () => {
      const { u, version } = await example({ held: 10 * M, spent: 0, reserve: 10 * M });
      const id = await h.waitingForApprover(u, plan, { amount: 20 * M }); // within the base when it was sent
      await h.commit(u, version.id, h.year, 75 * M, 'HELD'); // 15 left of the base, 25 with the reserve

      const response = await approve(id).expect(409);

      expect(h.codeOf(response)).toBe('SPEND.RECHECKED_RETURNED_TO_HEAD');
      expect(h.detailsOf(response)).toMatchObject({ reasons: ['RESERVE_UNCONFIRMED'] });
      expect(await decided(id)).toEqual([]);
      expect(await h.steps(id, 'SPEND_APPROVAL')).toEqual([expect.objectContaining({ state: 'CLOSED' })]);
      expect(await h.state(id)).toBe('AWAITING_SPEND_SUBMISSION');
    });

    it('BR-MF1-07c, US-06-16 AC-6: tells the requester and the head, never Finance, that it went back', async () => {
      const { u, version } = await example({ held: 10 * M, spent: 0 });
      const id = await h.waitingForApprover(u, plan, { amount: 20 * M });
      await h.commit(u, version.id, h.year, 75 * M, 'HELD');
      await approve(id).expect(409);

      const audit = await h.ctx.sql.query<{ after: Record<string, unknown> }>(
        `SELECT after FROM audit_events WHERE action = 'ACCESS_REQUEST.SPEND_RETURNED_AT_DECISION' AND resource_id = $1`,
        [id],
      );

      expect(audit.rows).toHaveLength(1);
      expect(audit.rows[0].after).toMatchObject({ blockReasons: 'OVER_RESERVE' });
    });

    it('BR-MF1-06i(iv): goes back to its head, with nothing decided, when its quote is no longer valid now', async () => {
      const { u } = await example();
      const id = await h.staleRequest(u);
      // The quote was in force when it was sent on; the day it expires is a day later (made by hand to follow that).
      await h.ctx.sql.query(
        `UPDATE access_request_assessments SET quote_valid_until = current_date + 1 WHERE request_id = $1`,
        [id],
      );
      await h.sendOn([id], u.head.account).expect(201);
      await h.ctx.sql.query(
        `UPDATE access_request_assessments SET quote_valid_until = current_date - 1 WHERE request_id = $1`,
        [id],
      );

      const response = await approve(id).expect(409);

      expect(h.codeOf(response)).toBe('SPEND.RECHECKED_RETURNED_TO_HEAD');
      expect(h.detailsOf(response)).toMatchObject({ reasons: ['PRICE_EXPIRED'] });
      expect(await records(id)).toEqual([]);
      expect(await h.steps(id, 'SPEND_APPROVAL')).toEqual([expect.objectContaining({ state: 'CLOSED' })]);
      expect(await h.state(id)).toBe('AWAITING_SPEND_SUBMISSION');
    });
  });
});
