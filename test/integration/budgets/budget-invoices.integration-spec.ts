import { BudgetsApi } from '../../../src/modules/budgets/public/budgets.api';
import { PurchaseInvoiceRecordRefusedError } from '../../../src/modules/budgets/public/budgets.errors';
import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import { InvoiceHarness } from '../../support/invoice-harness';
import type { Unit } from '../../support/spend-harness';

const h = new InvoiceHarness();
const M = 1_000_000;

interface Money {
  amount: string;
  currency: string;
}
interface InvoiceWire {
  id: string;
  number: string;
  issuedOn: string;
  netAmount: Money;
  deductibleTax: Money;
  nonDeductibleTax: Money;
  actualCost: Money;
  matchResult: string;
  note: string | null;
  recordedBy: { employeeId: string } | null;
  recordedAt: string;
}
interface CommitmentWire {
  id: string;
  requestId: string;
  state: string;
  amount: Money;
  released: Money;
  held: Money;
  invoiced: Money;
  invoiceCount: number;
  hasDiscrepancy: boolean;
}
interface TableRow {
  costCenter: { id: string };
  total: Money;
  committed: Money;
  spent: Money;
  remaining: Money;
}
/** What a test says of the invoice of a purchase, in whole units of the currency; the rest is the default of `book-purchase-invoice.ts`. */
interface Figures {
  net?: number;
  deductibleTax?: number;
  nonDeductibleTax?: number;
  number?: string;
}

/**
 * What an invoice does to the commitment and to what is spent, now that the only way an invoice enters the books is the signature of Finance on a
 * purchase invoice (`PI-1`, `B6`): the tests book it through the facade of the budgets as the signature does, and read what Finance reads through the
 * routes of the commitments and of their invoices (`US-12-02`, `US-06-06`).
 */
describe('invoices booked against commitments over PostgreSQL (US-12-02, US-06-06; PI-1.7)', () => {
  let plan: string;
  let vendorId: string;
  let counter = 0;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    plan = await h.planOf(await h.subscription(10));
    vendorId = (await h.vendorOf(plan)).id;
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  /** A Cost Center with a budget of 100 million and a commitment of `amount` that the spending approver made. */
  const committed = async (amount = 20 * M) => {
    counter += 1;
    const unit: Unit = await h.departmentWithHead(`P-V${counter}`);
    await h.budgetFor(unit, { total: 100 * M });
    const requestId = await h.waitingForApprover(unit, plan, { amount });
    await h.decideSpend(requestId, { decision: 'APPROVE' }, h.boss.account).expect(200);
    const [commitment] = h.dataOf<{ items: CommitmentWire[] }>(
      await h.commitmentList(h.finance, { requestId }).expect(200),
    ).items;

    return { unit, requestId, commitment };
  };
  type Committed = Awaited<ReturnType<typeof committed>>;
  const figuresOf = (over: Figures) => ({
    netMinor: BigInt(over.net ?? 12 * M),
    deductibleTaxMinor: BigInt(over.deductibleTax ?? 0),
    nonDeductibleTaxMinor: BigInt(over.nonDeductibleTax ?? 0),
    ...(over.number ? { number: over.number } : {}),
  });
  const commitmentOf = async (requestId: string) =>
    h.dataOf<{ items: CommitmentWire[] }>(await h.commitmentList(h.finance, { requestId }).expect(200)).items[0];
  /** Books an invoice for the request, as the Cost Center of the commitment bears it, and reads back the invoice and the commitment as Finance sees them. */
  const record = async (target: Committed, over: Figures = {}) => {
    const recorded = await h.recordPurchase(vendorId, {
      requestId: target.requestId,
      chargedCostCenterId: target.unit.department.unitId,
      ...figuresOf(over),
    });
    const listed = h.dataOf<{ items: InvoiceWire[] }>(
      await h.invoicesOf(target.commitment.id, h.finance, { pageSize: 100 }).expect(200),
    ).items;
    const invoice = listed.find((item) => item.id === recorded.invoiceId) as InvoiceWire;

    return { recorded, invoice, commitment: await commitmentOf(target.requestId) };
  };
  const refusalOf = (work: Promise<unknown>) =>
    work.then(
      () => null,
      (error: unknown) => (error instanceof PurchaseInvoiceRecordRefusedError ? error.reason : error),
    );
  const commitmentRow = async (id: string) =>
    (
      await h.ctx.sql.query<{ state: string; released_minor: string; applied_minor: string; released_at: Date | null }>(
        `SELECT state, released_minor::text, applied_minor::text, released_at FROM budget_commitments WHERE id = $1`,
        [id],
      )
    ).rows[0];
  const tableRow = async (unit: Unit) =>
    h
      .dataOf<{ items: TableRow[] }>(await h.table(h.finance, { year: h.year, pageSize: 100 }).expect(200))
      .items.find((item) => item.costCenter.id === unit.department.unitId);
  const yearFacts = async (unit: Unit) => {
    const facts = await h.ctx.app.get(BudgetsApi, { strict: false }).yearFacts(unit.department.unitId, [h.year]);

    return facts.get(h.year);
  };
  /** A commitment of the year after, made for a request and attached to no budget yet. */
  const waitingForBudget = async (unit: Unit, next: number) => {
    const requestId = await h.fixtureRequestId();
    const { rows } = await h.ctx.sql.query<{ id: string }>(
      `INSERT INTO budget_commitments (id, organization_id, request_id, cost_center_id, year, amount_minor, currency, state, unattached_reason)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, 'HELD', 'NO_BUDGET') RETURNING id`,
      [h.seed.organizationId, requestId, unit.department.unitId, next, 20 * M, h.reporting],
    );

    return { requestId, commitmentId: rows[0].id };
  };

  describe('what an invoice does to the commitment and to what is spent (US-06-06 AC-1, AC-5)', () => {
    it('takes the commitment down by the price, costs the price and the tax that cannot be deducted, and shows the rest apart', async () => {
      const target = await committed();
      expect(target.commitment.amount.amount).toBe(String(20 * M));

      const recorded = await record(target, { deductibleTax: 1_200_000, nonDeductibleTax: 600_000 });

      expect(recorded.invoice).toMatchObject({
        netAmount: { amount: String(12 * M), currency: h.reporting },
        deductibleTax: { amount: '1200000' },
        nonDeductibleTax: { amount: '600000' },
        actualCost: { amount: '12600000' },
        matchResult: 'TAX_ONLY',
        note: null,
        issuedOn: `${h.year}-11-03`,
        recordedBy: { employeeId: h.finance.employeeId },
      });
      expect(recorded.commitment).toMatchObject({
        id: target.commitment.id,
        state: 'HELD',
        held: { amount: String(8 * M) },
        invoiced: { amount: '12600000' },
        invoiceCount: 1,
        hasDiscrepancy: false,
      });
      expect(await commitmentRow(target.commitment.id)).toMatchObject({ state: 'HELD', applied_minor: String(12 * M) });
      expect(await tableRow(target.unit)).toMatchObject({
        committed: { amount: String(8 * M) },
        spent: { amount: '12600000' },
        remaining: { amount: String(100 * M - 8 * M - 12_600_000) },
      });
      const events = await h.ctx.sql.query(
        `SELECT 1 FROM audit_events WHERE action = 'INVOICE.RECORDED' AND after->>'commitmentId' = $1`,
        [target.commitment.id],
      );
      expect(events.rowCount).toBe(1);
    });

    it('records the vendor it is given, in dong, and the one who signed as the one who recorded it', async () => {
      const target = await committed();

      const { invoice: recorded } = await record(target);

      const stored = await h.ctx.sql.query<{ vendor_id: string; currency: string; recorded_by_employee_id: string }>(
        `SELECT vendor_id, currency, recorded_by_employee_id FROM invoices WHERE id = $1`,
        [recorded.id],
      );
      expect(stored.rows[0]).toEqual({
        vendor_id: vendorId,
        currency: h.reporting,
        recorded_by_employee_id: h.finance.employeeId,
      });
    });

    it('makes the commitment an expense when nothing is left to hold, and a later invoice is still an expense without taking it down', async () => {
      const target = await committed();

      const first = await record(target, { net: 12 * M });
      const second = await record(target, { net: 8 * M, nonDeductibleTax: 400_000 });
      const third = await record(target, { net: 500_000 });

      expect(first.commitment).toMatchObject({ state: 'HELD', held: { amount: String(8 * M) } });
      expect(second.commitment).toMatchObject({ state: 'EXPENSED', held: { amount: '0' } });
      expect(third.commitment).toMatchObject({
        state: 'EXPENSED',
        held: { amount: '0' },
        invoiceCount: 3,
        invoiced: { amount: String(12 * M + 8 * M + 400_000 + 500_000) },
      });
      expect(await commitmentRow(target.commitment.id)).toMatchObject({
        state: 'EXPENSED',
        applied_minor: String(20 * M),
      });
      // Nothing is held any more; everything invoiced is spent, over the commitment included (QĐ-34b).
      expect(await tableRow(target.unit)).toMatchObject({
        committed: { amount: '0' },
        spent: { amount: String(12 * M + 8 * M + 400_000 + 500_000) },
      });
    });

    it('does not let an expense be counted twice: held plus spent never exceeds the commitment while the invoices fit it', async () => {
      const target = await committed();

      await record(target, { net: 5 * M });

      const row = await tableRow(target.unit);
      expect(Number(row?.committed.amount) + Number(row?.spent.amount)).toBe(20 * M);
    });
  });

  describe('how an invoice stands against what the commitment allowed (US-12-02 AC-5, AC-6)', () => {
    it('matches an invoice of exactly the amount, and does not flag one that costs more dong: only the count and the price of one say a difference (R-44, QĐ-111an)', async () => {
      const exact = await committed();
      const over = await committed();

      const matched = await record(exact, { net: 20 * M });
      const dearer = await record(over, { net: 20 * M + 1 });

      expect(matched.invoice.matchResult).toBe('MATCHED');
      expect(matched.commitment).toMatchObject({ state: 'EXPENSED', hasDiscrepancy: false });
      expect(dearer.invoice.matchResult).toBe('MATCHED');
      expect(dearer.commitment).toMatchObject({ state: 'EXPENSED', hasDiscrepancy: false });
      // The whole price is an expense although the commitment gave up only what it held (QĐ-34b).
      expect((await tableRow(over.unit))?.spent.amount).toBe(String(20 * M + 1));
    });

    it('judges the invoices of a commitment one by one: the second that takes the total over the allowance is not flagged for the dong', async () => {
      const target = await committed();

      const first = await record(target, { net: 12 * M });
      const second = await record(target, { net: 8 * M + 1 });

      expect(first.invoice.matchResult).toBe('MATCHED');
      expect(second.invoice.matchResult).toBe('MATCHED');
      expect(second.commitment.hasDiscrepancy).toBe(false);
    });

    it('is recorded with a difference in tax alone as TAX_ONLY and does not open a discrepancy', async () => {
      const target = await committed();

      const recorded = await record(target, { net: 20 * M, deductibleTax: 2 * M });

      expect(recorded.invoice.matchResult).toBe('TAX_ONLY');
      expect(recorded.commitment.hasDiscrepancy).toBe(false);
    });
  });

  describe('what it does to the check of the next request (A8)', () => {
    it('lowers what is left by the tax that cannot be deducted, and not by the tax that can', async () => {
      const target = await committed();
      const before = await yearFacts(target.unit);

      await record(target, { net: 5 * M, deductibleTax: 500_000 });
      const afterDeductible = await yearFacts(target.unit);
      await record(target, { net: 5 * M, nonDeductibleTax: 250_000 });
      const afterNonDeductible = await yearFacts(target.unit);

      expect(before?.spentMinor).toBe(0n);
      expect(afterDeductible?.spentMinor).toBe(BigInt(5 * M));
      expect(afterNonDeductible?.spentMinor).toBe(BigInt(10 * M + 250_000));
      // What is held went down by the prices only.
      expect(afterNonDeductible?.heldMinor).toBe(BigInt(10 * M));
    });
  });

  describe('an invoice that comes before the budget of its year (FIX-1, QĐ-98k)', () => {
    it('counts as spent of its year from the day it is recorded, and once the budget is approved it is not counted twice', async () => {
      counter += 1;
      const unit: Unit = await h.departmentWithHead(`P-V${counter}`);
      const next = h.year + 1;
      const { requestId, commitmentId } = await waitingForBudget(unit, next);

      await h.recordPurchase(vendorId, {
        requestId,
        chargedCostCenterId: unit.department.unitId,
        netMinor: BigInt(20 * M),
        serviceMonth: `${next}-02-01`,
        issuedOn: `${next}-02-03`,
      });

      expect(await commitmentRow(commitmentId)).toMatchObject({ state: 'EXPENSED', applied_minor: String(20 * M) });
      const unattached = await h.ctx.app
        .get(TransactionRunner, { strict: false })
        .run((tx) => h.ctx.app.get(BudgetsApi, { strict: false }).yearFacts(unit.department.unitId, [next], tx));
      // No budget for the year yet: nothing to read it against.
      expect(unattached.size).toBe(0);

      await h.budgetFor(unit, { total: 100 * M, year: next });

      const facts = (await h.ctx.app.get(BudgetsApi, { strict: false }).yearFacts(unit.department.unitId, [next])).get(
        next,
      );
      expect(facts).toMatchObject({ heldMinor: 0n, spentMinor: BigInt(20 * M) });
      const summary = h.dataOf<{
        totals: Record<string, { spent: Money; committed: Money }>;
        lastInvoiceRecordedAt: string | null;
      }>(await h.summary(h.finance, { year: next }).expect(200));
      expect(summary.totals[h.reporting]).toMatchObject({
        spent: { amount: String(20 * M) },
        committed: { amount: '0' },
      });
      expect(summary.lastInvoiceRecordedAt).toEqual(expect.any(String));
    });
  });

  describe('when a request ends after an invoice (A9, US-06-06 AC-4, AC-9)', () => {
    const endRequest = (requestId: string, reason: 'REQUEST_CANCELLED' | 'REQUEST_WITHDRAWN' = 'REQUEST_CANCELLED') =>
      h.ctx.app
        .get(TransactionRunner, { strict: false })
        .run((tx) =>
          h.ctx.app.get(BudgetsApi, { strict: false }).releaseForRequest(tx, { requestId, reason, now: new Date() }),
        );

    it('gives back only the part that did not become an expense, and the commitment stays an expense', async () => {
      const target = await committed();
      await record(target, { net: 12 * M });

      const released = await endRequest(target.requestId);

      expect(released).toHaveLength(1);
      expect(released[0]).toMatchObject({ releasedMinor: BigInt(8 * M), heldMinor: 0n, released: true });
      expect(await commitmentRow(target.commitment.id)).toMatchObject({
        state: 'EXPENSED',
        released_minor: String(8 * M),
        applied_minor: String(12 * M),
        released_at: null,
      });
      expect(await tableRow(target.unit)).toMatchObject({
        committed: { amount: '0' },
        spent: { amount: String(12 * M) },
        remaining: { amount: String(88 * M) },
      });
      expect(await commitmentOf(target.requestId)).toMatchObject({
        state: 'EXPENSED',
        held: { amount: '0' },
        released: { amount: String(8 * M) },
      });
    });

    it('does not take the money of an invoice back: ending the request twice gives back nothing more', async () => {
      const target = await committed();
      await record(target, { net: 12 * M });
      await endRequest(target.requestId);

      const again = await endRequest(target.requestId);

      expect(again).toEqual([]);
      expect((await commitmentRow(target.commitment.id)).released_minor).toBe(String(8 * M));
    });

    it('lets Finance give back the rest once the request has ended, and only the rest', async () => {
      const target = await committed();
      await record(target, { net: 12 * M });
      await h.ctx.sql.query(`UPDATE access_requests SET state = 'COMPLETED' WHERE id = $1`, [target.requestId]);

      const response = await h
        .releaseCommitment(target.commitment.id, { reason: 'No more invoices' }, h.finance)
        .expect(200);

      expect(h.dataOf<{ commitment: CommitmentWire }>(response).commitment).toMatchObject({
        state: 'EXPENSED',
        released: { amount: String(8 * M) },
        held: { amount: '0' },
        invoiced: { amount: String(12 * M) },
      });
      expect(await tableRow(target.unit)).toMatchObject({
        committed: { amount: '0' },
        spent: { amount: String(12 * M) },
      });
    });

    it('never makes an expense held again: Finance cannot give back the rest of one, and a later invoice leaves it an expense', async () => {
      const target = await committed();
      await record(target, { net: 20 * M });
      await h.ctx.sql.query(`UPDATE access_requests SET state = 'COMPLETED' WHERE id = $1`, [target.requestId]);

      await h.releaseCommitment(target.commitment.id, { reason: 'Nothing is left' }, h.finance).expect(409);
      await record(target, { net: 1 });

      expect((await commitmentRow(target.commitment.id)).state).toBe('EXPENSED');
    });

    it('queues behind an invoice that is being recorded and gives back what it leaves held, instead of failing on a stale read', async () => {
      const { requestId, commitment } = await committed();

      const released = await h.lockedWhile(
        commitment.id,
        () => endRequest(requestId),
        (holder) =>
          holder.query(`UPDATE budget_commitments SET applied_minor = $2 WHERE id = $1`, [commitment.id, 12 * M]),
      );

      expect(released).toHaveLength(1);
      expect(released[0]).toMatchObject({ releasedMinor: BigInt(8 * M), heldMinor: 0n });
      expect(await commitmentRow(commitment.id)).toMatchObject({
        state: 'EXPENSED',
        released_minor: String(8 * M),
        applied_minor: String(12 * M),
      });
    });

    it('books an invoice for a commitment that was released whole as an expense of its Cost Center, and the commitment stays released (QĐ-55b, R-51)', async () => {
      const target = await committed();
      await endRequest(target.requestId);
      const before = await yearFacts(target.unit);

      const recorded = await h.recordPurchase(vendorId, {
        requestId: target.requestId,
        chargedCostCenterId: target.unit.department.unitId,
        netMinor: BigInt(6 * M),
      });

      expect(recorded).toMatchObject({
        booking: 'COST_CENTER',
        commitmentId: null,
        costCenterId: target.unit.department.unitId,
        appliedMinor: 0n,
      });
      expect((await commitmentRow(target.commitment.id)).state).toBe('RELEASED');
      expect(before?.spentMinor).toBe(0n);
      expect((await yearFacts(target.unit))?.spentMinor).toBe(BigInt(6 * M));
    });
  });

  describe('a budget approved while an invoice makes a waiting commitment an expense (FIX-2)', () => {
    it('attaches only what is still held and the approval goes through', async () => {
      counter += 1;
      const unit: Unit = await h.departmentWithHead(`P-V${counter}`);
      const next = h.year + 1;
      const { commitmentId } = await waitingForBudget(unit, next);

      await h.lockedWhile(
        commitmentId,
        () => h.budgetFor(unit, { total: 100 * M, year: next }),
        (holder) =>
          holder.query(`UPDATE budget_commitments SET applied_minor = amount_minor, state = 'EXPENSED' WHERE id = $1`, [
            commitmentId,
          ]),
      );

      const row = await h.ctx.sql.query<{ state: string; attached_version_id: string | null }>(
        `SELECT state::text, attached_version_id FROM budget_commitments WHERE id = $1`,
        [commitmentId],
      );
      expect(row.rows[0]).toEqual({ state: 'EXPENSED', attached_version_id: null });
      const approved = await h.ctx.sql.query(
        `SELECT 1 FROM budget_versions WHERE cost_center_id = $1 AND year = $2 AND state = 'APPROVED'`,
        [unit.department.unitId, next],
      );
      expect(approved.rowCount).toBe(1);
    });
  });

  describe('what refuses it', () => {
    it('refuses a number the vendor has used already, and the first invoice stays as it was', async () => {
      const first = await committed();
      const second = await committed();
      await record(first, { number: 'DUP-1', net: 5 * M });

      const refused = await refusalOf(
        h.recordPurchase(vendorId, {
          requestId: second.requestId,
          chargedCostCenterId: second.unit.department.unitId,
          number: 'DUP-1',
        }),
      );

      expect(refused).toBe('DUPLICATE_NUMBER');
      expect(await commitmentRow(second.commitment.id)).toMatchObject({ state: 'HELD', applied_minor: '0' });
      const stored = await h.ctx.sql.query(`SELECT 1 FROM invoices WHERE number = 'DUP-1'`);
      expect(stored.rowCount).toBe(1);
    });

    it('answers 404 for a commitment that does not exist when its invoices are read', async () => {
      await h.invoicesOf('0a1b2c3d-0000-4000-8000-000000000099').expect(404);
    });

    it.each([
      ['a price of nothing', { net: 0 }],
      ['a negative price', { net: -5 }],
      ['a negative tax that can be deducted', { deductibleTax: -1 }],
      ['a negative tax that cannot be deducted', { nonDeductibleTax: -1 }],
    ])('turns away %s and records nothing', async (_name, over) => {
      const target = await committed();

      const refused = await refusalOf(
        h.recordPurchase(vendorId, {
          requestId: target.requestId,
          chargedCostCenterId: target.unit.department.unitId,
          ...figuresOf(over),
        }),
      );

      expect(refused).toBe('AMOUNT_NOT_POSITIVE');
      expect(await commitmentRow(target.commitment.id)).toMatchObject({ state: 'HELD', applied_minor: '0' });
      expect(h.dataOf<{ items: unknown[] }>(await h.invoicesOf(target.commitment.id).expect(200)).items).toEqual([]);
    });

    it('turns away every role but Finance, the IT Admin included, from reading the invoices', async () => {
      const { unit, commitment } = await committed();

      for (const account of [h.it1, h.boss.account, unit.head.account, unit.member.account]) {
        await h.invoicesOf(commitment.id, account).expect(403);
      }
    });
  });

  describe('the list of the invoices of a commitment', () => {
    it('gives them newest first with both kinds of tax, and pages them', async () => {
      const target = await committed();
      const first = await record(target, { net: 1 * M, number: 'A-1' });
      const second = await record(target, { net: 2 * M, number: 'A-2', deductibleTax: 200_000 });

      const page = h.dataOf<{ items: InvoiceWire[]; pagination: { totalItems: number } }>(
        await h.invoicesOf(target.commitment.id, h.finance, { pageSize: 1 }).expect(200),
      );
      const all = h.dataOf<{ items: InvoiceWire[] }>(await h.invoicesOf(target.commitment.id).expect(200)).items;

      expect(all.map((item) => item.id)).toEqual([second.invoice.id, first.invoice.id]);
      expect(all[0]).toMatchObject({ deductibleTax: { amount: '200000' }, matchResult: 'TAX_ONLY' });
      expect(page.items).toHaveLength(1);
      expect(page.pagination.totalItems).toBe(2);
    });
  });

  describe('what the list says of where an invoice came from (PI-1.7)', () => {
    it('leaves the month, the label and the way of payment empty for an invoice kept from before, and gives the month for a booked one the purchase of which is not known', async () => {
      const target = await committed();
      await h.invoiceOf(target.commitment.id, 1 * M, 'OLD-1');
      const booked = await record(target, { net: 2 * M, number: 'NEW-1' });

      const all = h.dataOf<{ items: Array<InvoiceWire & Record<string, unknown>> }>(
        await h.invoicesOf(target.commitment.id).expect(200),
      ).items;

      expect(all.find((item) => item.number === 'OLD-1')).toMatchObject({
        servicePeriodMonth: null,
        label: null,
        paymentSource: null,
      });
      expect(all.find((item) => item.id === booked.invoice.id)).toMatchObject({
        servicePeriodMonth: `${h.year}-11`,
        label: null,
        paymentSource: null,
      });
    });
  });

  describe('two invoices at the same time (A7)', () => {
    const queued = (target: Committed, numbers: [string, string], net: number) =>
      h.queuedOnCommitment(
        target.commitment.id,
        numbers.map(
          (number) => () =>
            h
              .recordPurchase(vendorId, {
                requestId: target.requestId,
                chargedCostCenterId: target.unit.department.unitId,
                netMinor: BigInt(net),
                number,
              })
              .then(
                () => 'recorded',
                (error: unknown) => (error instanceof PurchaseInvoiceRecordRefusedError ? error.reason : error),
              ),
        ),
      );

    it('queue on the row of the commitment: neither takes it down by more than it held, and the second sees the first', async () => {
      const target = await committed();

      const answers = await queued(target, ['RACE-1', 'RACE-2'], 15 * M);

      expect(answers).toEqual(['recorded', 'recorded']);
      const row = await commitmentRow(target.commitment.id);
      // 20 million held: the first takes 15, the second only the 5 that is left; both prices are spent.
      expect(row).toMatchObject({ state: 'EXPENSED', applied_minor: String(20 * M) });
      const applied = await h.ctx.sql.query<{ number: string; applied_minor: string; match_result: string }>(
        `SELECT number, applied_minor::text, match_result::text FROM invoices WHERE commitment_id = $1 ORDER BY recorded_at, number`,
        [target.commitment.id],
      );
      expect(applied.rows).toEqual([
        { number: 'RACE-1', applied_minor: String(15 * M), match_result: 'MATCHED' },
        { number: 'RACE-2', applied_minor: String(5 * M), match_result: 'MATCHED' },
      ]);
    });

    it('refuses the one that comes second with a number the first used', async () => {
      const target = await committed();

      const answers = await queued(target, ['SAME', 'SAME'], 1 * M);

      expect(answers).toEqual(['recorded', 'DUPLICATE_NUMBER']);
      expect((await commitmentRow(target.commitment.id)).applied_minor).toBe(String(1 * M));
    });
  });

  describe('the database keeps it too', () => {
    it('refuses to change or delete an invoice, even to the owner of the schema', async () => {
      const target = await committed();
      const { invoice: recorded } = await record(target);

      const update = h.ctx.sql.query(`UPDATE invoices SET note = 'x' WHERE id = $1`, [recorded.id]);
      const remove = h.ctx.sql.query(`DELETE FROM invoices WHERE id = $1`, [recorded.id]);

      await expect(update).rejects.toMatchObject({ code: '23001' });
      await expect(remove).rejects.toMatchObject({ code: '23001' });
    });
  });
});
