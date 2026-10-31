import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import { BudgetsApi } from '../../../src/modules/budgets/public/budgets.api';
import { SpendHarness, Unit } from '../../support/spend-harness';

const h = new SpendHarness();
const M = 1_000_000;

interface CommitmentRow {
  year: number;
  amount_minor: string;
  state: string;
  attached_version_id: string | null;
  unattached_reason: string | null;
  snapshot_check_id: string | null;
}
interface TableRow {
  costCenter: { id: string };
  total: { amount: string };
  committed: { amount: string };
  remaining: { amount: string };
}

describe('the commitment held when a request is approved over PostgreSQL (US-06-04, US-06-07, US-06-09)', () => {
  let plan: string;
  let subscriptionId: string;
  let taxedPlan: string;
  let counter = 0;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    subscriptionId = await h.subscription(10);
    plan = await h.planOf(subscriptionId);
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

    return h.departmentWithHead(`P-C${counter}`);
  };
  /** 100 million, 20 held, 40 spent: 40 left. */
  const example = async (percent = 100) => {
    const u = await unit();

    return { u, version: await h.budgetFor(u, { total: 100 * M, held: 20 * M, spent: 40 * M, percent }) };
  };
  const approve = (id: string, over: object = {}) =>
    h.decideSpend(id, { decision: 'APPROVE', ...over }, h.boss.account);
  const held = async (requestId: string) =>
    (
      await h.ctx.sql.query<CommitmentRow>(
        `SELECT year, amount_minor::text, state, attached_version_id, unattached_reason, snapshot_check_id
           FROM budget_commitments WHERE request_id = $1 ORDER BY year`,
        [requestId],
      )
    ).rows;
  const row = async (u: Unit, year = h.year) =>
    h
      .dataOf<{ items: TableRow[] }>(await h.table(h.finance, { year, pageSize: 100 }).expect(200))
      .items.find((item) => item.costCenter.id === u.department.unitId);
  const approved = async (u: Unit, amount: number, planId = plan, spec: object = {}) => {
    const id = await h.waitingForApprover(u, planId, { amount, ...spec });
    await approve(id).expect(200);

    return id;
  };

  describe('one commitment for the cost that falls on the company (AC-1, AC-5)', () => {
    it('holds 21 million for a request that costs 20 before tax, on the snapshot it was approved on, and leaves 19 million', async () => {
      const { u, version } = await example();
      const id = await h.waitingForApprover(u, taxedPlan, { amount: 20 * M });

      await approve(id).expect(200);

      const [commitment] = await held(id);
      expect(await held(id)).toHaveLength(1);
      expect(commitment).toMatchObject({
        year: h.year,
        amount_minor: String(21 * M),
        state: 'HELD',
        attached_version_id: version.id,
        unattached_reason: null,
      });
      const snapshot = await h.ctx.sql.query<{ check_id: string }>(
        `SELECT check_id FROM spend_decisions WHERE request_id = $1`,
        [id],
      );
      expect(commitment.snapshot_check_id).toBe(snapshot.rows[0].check_id);
      expect(await row(u)).toMatchObject({
        committed: { amount: String(41 * M) },
        remaining: { amount: String(19 * M) },
      });
      const view = h.dataOf<{
        spendApproval: { cost: { estimatedCost: { amount: string }; deductibleTax: { amount: string } } };
      }>(await h.approvalOf(id, h.boss.account).expect(200)).spendApproval;
      // The tax that is deducted is shown apart and is not in what is held.
      expect(view.cost).toMatchObject({
        estimatedCost: { amount: String(21 * M) },
        deductibleTax: { amount: String(2 * M) },
      });
      const events = await h.ctx.sql.query(
        `SELECT 1 FROM audit_events WHERE action = 'BUDGET_COMMITMENT.CREATED' AND after->>'requestId' = $1`,
        [id],
      );
      expect(events.rowCount).toBe(1);
    });

    it('leaves Finance nothing to record or confirm, and the IT Admin can grant it at once (AC-2)', async () => {
      const { u } = await example();
      const id = await approved(u, 15 * M);

      const queue = h.dataOf<{ items: Array<{ requestId: string }> }>(
        await h.reviewQueue(h.finance, { pageSize: 100 }).expect(200),
      );

      expect(queue.items.map((item) => item.requestId)).not.toContain(id);
      expect(await h.steps(id, 'FINANCE_REVIEW')).toEqual([]);
      await h.grant({ requestId: id, subscriptionId }).expect(201);
    });

    it('is not held a second time for the same year, by the service or by the database (AC-3)', async () => {
      const { u } = await example();
      const id = await approved(u, 15 * M);
      const runner = h.ctx.app.get(TransactionRunner, { strict: false });
      const budgets = h.ctx.app.get(BudgetsApi, { strict: false });
      const [commitment] = await held(id);
      const input = {
        organizationId: h.seed.organizationId,
        requestId: id,
        costCenterId: u.department.unitId,
        snapshotCheckId: commitment.snapshot_check_id as string,
        currency: h.reporting,
        now: new Date(),
        items: [{ year: h.year, amountMinor: 1n }],
      };

      await expect(
        runner.run((tx) => budgets.holdForRequest(tx, h.principal(h.boss.account, ['SPENDING_APPROVER']), input)),
      ).rejects.toMatchObject({
        name: 'BudgetCommitmentExistsError',
        year: h.year,
      });
      expect(await held(id)).toHaveLength(1);
    });

    it('is held once when two approvals come at the same time: the first in the queue approves, the second finds the step decided', async () => {
      const { u } = await example();
      const id = await h.waitingForApprover(u, plan, { amount: 15 * M });

      const [first, second] = await h.queuedOnRequest(id, [() => approve(id), () => approve(id)]);

      expect([first.status, second.status]).toEqual([200, 409]);
      expect(await held(id)).toHaveLength(1);
    });
  });

  describe('a refusal and a batch (AC-8, AC-9)', () => {
    it('holds nothing and gives the IT Admin nothing when the request is refused (AC-8)', async () => {
      const { u } = await example();
      const id = await h.waitingForApprover(u, plan, { amount: 15 * M });

      await h.decideSpend(id, { decision: 'REJECT', reason: 'No' }, h.boss.account).expect(200);

      expect(await held(id)).toEqual([]);
      await h.grant({ requestId: id }).expect(409);
    });

    it('holds one commitment for each request of a batch decided together, and none for the batch (AC-9)', async () => {
      const { u } = await example();
      const ids = [await h.paidRequest(u, plan, { amount: 12 * M }), await h.paidRequest(u, plan, { amount: 8 * M })];
      const batch = h.dataOf<{ batch: { id: string } }>(await h.sendOn(ids, u.head.account).expect(201)).batch;

      await h.decideBatch(batch.id, { decision: 'APPROVE', requestIds: ids }, h.boss.account).expect(200);

      expect((await held(ids[0])).map((commitment) => commitment.amount_minor)).toEqual([String(12 * M)]);
      expect((await held(ids[1])).map((commitment) => commitment.amount_minor)).toEqual([String(8 * M)]);
      const columns = await h.ctx.sql.query(
        `SELECT 1 FROM information_schema.columns WHERE table_name = 'budget_commitments' AND column_name LIKE '%batch%'`,
      );
      expect(columns.rowCount).toBe(0);
    });
  });

  describe('which year, and how many (AC-10 to AC-13)', () => {
    it('is the year of the day the money goes out, whole, and leaves the year it is approved in as it was (AC-10)', async () => {
      const { u } = await example();
      await h.budgetFor(u, { total: 100 * M, year: h.next });
      const before = await row(u);
      const id = await approved(u, 10 * M, plan, { year: h.next, dueOn: `${h.next}-01-05` });

      expect(await held(id)).toEqual([expect.objectContaining({ year: h.next, amount_minor: String(10 * M) })]);
      expect(await row(u)).toEqual(before);
      expect(await row(u, h.next)).toMatchObject({ remaining: { amount: String(90 * M) } });
    });

    it('is one for each year the binding payments fall in, and the year with no budget waits for one (AC-11, US-06-07 AC-7)', async () => {
      const u = await unit();
      await h.budgetFor(u, { total: 5_000_000 });
      const id = await h.paidRequest(u, plan, {
        schedule: [
          { dueOn: `${h.year}-11-01`, amount: 2_400_000, year: h.year },
          { dueOn: `${h.next}-11-01`, amount: 2_400_000, year: h.next },
        ],
      });
      await h.sendOn([id], u.head.account).expect(201);
      await h
        .completeReview(id, {
          outcome: 'ASSESSED',
          opinion: 'No budget next year: accepted',
          direction: 'RECOMMEND_OVERRIDE',
        })
        .expect(200);

      await approve(id, { override: { reason: 'The budget of next year is being made', years: [h.next] } }).expect(200);

      const commitments = await held(id);
      expect(commitments).toEqual([
        expect.objectContaining({
          year: h.year,
          amount_minor: '2400000',
          attached_version_id: expect.any(String) as string,
        }),
        expect.objectContaining({
          year: h.next,
          amount_minor: '2400000',
          attached_version_id: null,
          unattached_reason: 'NO_BUDGET',
        }),
      ]);
      // This year loses its own payment only, and the one of next year waits in the list of Finance for the budget of next year.
      expect(await row(u)).toMatchObject({ remaining: { amount: '2600000' } });
      const waiting = h.dataOf<{
        items: Array<{ requestId: string; year: number; attached: boolean; unattachedReason: string }>;
      }>(await h.commitmentList(h.finance, { attached: 'false', year: h.next, pageSize: 100 }).expect(200));
      expect(waiting.items).toContainEqual(
        expect.objectContaining({ requestId: id, year: h.next, attached: false, unattachedReason: 'NO_BUDGET' }),
      );

      await h.budgetFor(u, { total: 32 * M, year: h.next });

      expect((await held(id))[1]).toMatchObject({
        unattached_reason: null,
        attached_version_id: expect.any(String) as string,
      });
      expect(await row(u, h.next)).toMatchObject({ remaining: { amount: String(32 * M - 2_400_000) } });
      expect((await held(id))[0].year).toBe(h.year);
      const events = await h.ctx.sql.query(
        `SELECT 1 FROM audit_events WHERE action = 'BUDGET_COMMITMENT.ATTACHED' AND after->>'requestId' = $1`,
        [id],
      );
      expect(events.rowCount).toBe(1);
    });

    it('is none for a period that is only a forecast (AC-12)', async () => {
      const { u } = await example();
      const id = await h.paidRequest(u, plan, {
        schedule: [
          { dueOn: `${h.year}-11-01`, amount: 2_400_000, year: h.year },
          { dueOn: `${h.next}-11-01`, amount: 2_400_000, year: h.next, binding: false },
        ],
      });
      await h.sendOn([id], u.head.account).expect(201);
      await approve(id).expect(200);

      expect(await held(id)).toEqual([expect.objectContaining({ year: h.year, amount_minor: '2400000' })]);
    });

    it('is one for the whole of a payment made once, and none for the years of the service after it (AC-13)', async () => {
      const { u } = await example();
      const id = await approved(u, 4_800_000);

      expect(await held(id)).toEqual([expect.objectContaining({ year: h.year, amount_minor: '4800000' })]);
      expect(await row(u, h.next)).toBeUndefined();
    });
  });

  describe('no budget yet (AC-7, US-06-07 AC-1, AC-2, AC-5)', () => {
    it('is held and waits with the reason, is in the list of Finance, blocks nothing and makes no budget of nothing', async () => {
      const u = await unit();
      const id = await h.paidRequest(u, plan, { amount: 30 * M });
      await h.sendOn([id], u.head.account).expect(201);
      await h
        .completeReview(id, { outcome: 'ASSESSED', opinion: 'No budget: accepted', direction: 'RECOMMEND_OVERRIDE' })
        .expect(200);
      const versions = await h.budgetRows('budget_versions');

      await approve(id, { override: { reason: 'The budget comes in March', years: [h.year] } }).expect(200);

      expect(await held(id)).toEqual([
        expect.objectContaining({
          amount_minor: String(30 * M),
          state: 'HELD',
          attached_version_id: null,
          unattached_reason: 'NO_BUDGET',
        }),
      ]);
      const list = h.dataOf<{ items: Array<{ requestId: string }> }>(
        await h.commitmentList(h.finance, { attached: 'false', pageSize: 100 }).expect(200),
      );
      expect(list.items.map((item) => item.requestId)).toContain(id);
      expect(await h.steps(id, 'FINANCE_REVIEW')).toEqual([expect.objectContaining({ state: 'COMPLETED' })]);
      await h.grant({ requestId: id, subscriptionId }).expect(201);
      expect(await h.budgetRows('budget_versions')).toBe(versions);
    });
  });

  describe('what Finance and the snapshot show (US-06-09 AC-2, AC-4, AC-9)', () => {
    it('lets Finance open the request a commitment was held for, and no other (AC-2)', async () => {
      const { u } = await example();
      const id = await approved(u, 15 * M);
      const other = await h.waitingForApprover(u, plan, { amount: 10 * M });
      const listed = h.dataOf<{ items: Array<{ requestId: string }> }>(
        await h.commitmentList(h.finance, { requestId: id }).expect(200),
      );

      expect(listed.items).toHaveLength(1);
      await h.fetch(id, h.finance).expect(200);
      await h.fetch(other, h.finance).expect(404);
    });

    it('holds nothing for a request that is not there, and the list is for Finance only (AC-4)', async () => {
      const orphans = await h.ctx.sql.query(
        `SELECT 1 FROM budget_commitments c LEFT JOIN access_requests r ON r.id = c.request_id WHERE r.id IS NULL`,
      );

      expect(orphans.rowCount).toBe(0);
      await h.commitmentList(h.boss.account).expect(403);
      await h.commitmentList(h.it1).expect(403);
    });

    it('keeps the snapshot of the decision as it was when the budget is revised afterwards (AC-9)', async () => {
      const { u } = await example(50);
      const id = await approved(u, 15 * M);
      const revision = h.dataOf<{ version: { id: string } }>(
        await h
          .createRevision({
            costCenterId: u.department.unitId,
            year: h.year,
            base: h.money(60 * M),
            reserve: h.money(20 * M),
            reason: 'Cut to the plan',
          })
          .expect(201),
      ).version;
      await h.sendVersion(revision.id).expect(200);
      await h.decideVersion(revision.id, { decision: 'APPROVE' }, await h.deciderOf(u)).expect(200);

      const years = h.dataOf<{ items: Array<{ budget: { amount: string } }> }>(
        await h.checkYears(id, h.finance).expect(200),
      ).items;

      expect(years[0].budget.amount).toBe(String(100 * M));
      expect(await row(u)).toMatchObject({ total: { amount: String(80 * M) } });
    });
  });
});
