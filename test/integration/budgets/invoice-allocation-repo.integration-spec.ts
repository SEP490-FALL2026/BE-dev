import { randomUUID } from 'node:crypto';
import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import { InvoiceRepo } from '../../../src/modules/budgets/budget/invoice.repo';
import { InvoiceAllocationRepo } from '../../../src/modules/budgets/invoice/invoice-allocation.repo';
import { InvoiceYearApplicationRepo } from '../../../src/modules/budgets/invoice/invoice-year-application.repo';
import { SeatMonthRepo } from '../../../src/modules/budgets/seat-month/seat-month.repo';
import { InvoiceHarness } from '../../support/invoice-harness';
import type { Unit } from '../../support/spend-harness';

const h = new InvoiceHarness();
const YEAR = 2026;

/**
 * Redesign wave 3, W3-26 (M7): the lines an invoice is split into by month and bucket, and the rows of the year it was applied to a Cost Center. A line is added
 * and never changed; an invoice with lines is summed by its lines, month by month and by Cost Center, and an invoice with none as it always was.
 */
describe('the allocation of an invoice by month and bucket (integration, real PostgreSQL)', () => {
  const repos = () => ({
    lines: h.ctx.app.get(InvoiceAllocationRepo),
    years: h.ctx.app.get(InvoiceYearApplicationRepo),
    invoices: h.ctx.app.get(InvoiceRepo),
    seatMonths: h.ctx.app.get(SeatMonthRepo),
    transactions: h.ctx.app.get(TransactionRunner),
  });
  let first: Unit;
  let second: Unit;

  beforeAll(async () => {
    await h.start();
    first = await h.departmentWithHead('AL-1');
    second = await h.departmentWithHead('AL-2');
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  async function vendorId(): Promise<string> {
    const found = await h.ctx.sql.query<{ id: string }>(
      `SELECT id FROM vendors WHERE organization_id = $1 ORDER BY id LIMIT 1`,
      [h.seed.organizationId],
    );

    return (
      found.rows[0]?.id ??
      (
        await h.ctx.sql.query<{ id: string }>(
          `INSERT INTO vendors (id, organization_id, name, normalized_name)
           VALUES (gen_random_uuid(), $1, 'Allocation vendor', 'allocation vendor') RETURNING id`,
          [h.seed.organizationId],
        )
      ).rows[0].id
    );
  }

  /** An invoice that no commitment backs, booked whole to a Cost Center for a month (what an invoice outside the process leaves). */
  async function invoiceOf(unit: Unit, amount: number, serviceMonth: string): Promise<string> {
    const id = randomUUID();
    await h.ctx.sql.query(
      `INSERT INTO invoices (id, organization_id, cost_center_id, vendor_id, number, issued_on, currency, net_minor, deductible_tax_minor,
          non_deductible_tax_minor, actual_cost_minor, applied_minor, match_result, recorded_by_employee_id, recorded_at, service_month)
       VALUES ($1, $2, $3, $4, $5, current_date, $6, $7, 0, 0, $7, 0, 'MATCHED', $8, now(), $9)`,
      [
        id,
        h.seed.organizationId,
        unit.department.unitId,
        await vendorId(),
        `AL-${id}`,
        h.reporting,
        amount,
        h.finance.employeeId,
        serviceMonth,
      ],
    );

    return id;
  }

  const spentBy = async (unit: Unit, before?: string): Promise<bigint> =>
    (await repos().invoices.spentOf([{ costCenterId: unit.department.unitId, year: YEAR }], undefined, before)).get(
      `${unit.department.unitId}:${YEAR}`,
    ) ?? 0n;

  it('sums an invoice with no line as it was, and by its lines once it has them: month by month, only the lines of a Cost Center', async () => {
    const { lines, transactions } = repos();
    const invoice = await invoiceOf(first, 900, `${YEAR}-03-01`);
    expect(await spentBy(first)).toBe(900n);

    await transactions.run((tx) =>
      lines.insertMany(tx, [
        {
          invoiceId: invoice,
          month: `${YEAR}-03-01`,
          amountMinor: 300n,
          bucket: 'COST_CENTER',
          costCenterId: first.department.unitId,
        },
        {
          invoiceId: invoice,
          month: `${YEAR}-04-01`,
          amountMinor: 300n,
          bucket: 'COST_CENTER',
          costCenterId: first.department.unitId,
        },
        {
          invoiceId: invoice,
          month: `${YEAR}-04-01`,
          amountMinor: 200n,
          bucket: 'COST_CENTER',
          costCenterId: second.department.unitId,
        },
        { invoiceId: invoice, month: `${YEAR}-04-01`, amountMinor: 100n, bucket: 'POOL_IDLE' },
      ]),
    );

    // The invoice cost 900 as one; by its lines the first Cost Center bears 600, the second 200, and the pool 100 costs a department nothing.
    expect(await spentBy(first)).toBe(600n);
    expect(await spentBy(second)).toBe(200n);
    // What was spent before April is what the lines of March say.
    expect(await spentBy(first, `${YEAR}-04-01`)).toBe(300n);
    expect(await spentBy(second, `${YEAR}-04-01`)).toBe(0n);
    expect(await repos().lines.idsWithLines([invoice, randomUUID()])).toEqual(new Set([invoice]));
    expect(await repos().lines.totalOfInvoice(invoice)).toBe(900n);
  });

  it('adds the company year from the lines of the invoices that have some, whatever their bucket, in the year of each line', async () => {
    const { lines, transactions, seatMonths } = repos();
    const before = (await seatMonths.yearTotals(YEAR)).companyMinor;
    const invoice = await invoiceOf(second, 1000, `${YEAR}-06-01`);
    expect((await seatMonths.yearTotals(YEAR)).companyMinor - before).toBe(1000n);

    await transactions.run((tx) =>
      lines.insertMany(tx, [
        {
          invoiceId: invoice,
          month: `${YEAR}-06-01`,
          amountMinor: 700n,
          bucket: 'COST_CENTER',
          costCenterId: second.department.unitId,
        },
        { invoiceId: invoice, month: `${YEAR}-06-01`, amountMinor: 200n, bucket: 'POOL_DEVICE_LOT' },
        // A line that falls in another year is not of this one.
        { invoiceId: invoice, month: `${YEAR + 1}-01-01`, amountMinor: 100n, bucket: 'POOL_REPLACEMENT' },
      ]),
    );

    expect((await seatMonths.yearTotals(YEAR)).companyMinor - before).toBe(900n);
  });

  it('only adds: a line is never changed or deleted, a negative amount is for the lines that take away, a pool line has no Cost Center', async () => {
    const { lines, transactions } = repos();
    const invoice = await invoiceOf(first, 500, `${YEAR}-07-01`);
    const [original] = await transactions.run((tx) =>
      lines.insertMany(tx, [
        {
          invoiceId: invoice,
          month: `${YEAR}-07-01`,
          amountMinor: 500n,
          bucket: 'COST_CENTER',
          costCenterId: first.department.unitId,
        },
      ]),
    );

    await expect(
      h.ctx.sql.query(`UPDATE invoice_allocations SET amount_minor = 1 WHERE id = $1`, [original.id]),
    ).rejects.toMatchObject({
      constraint: 'invoice_allocations_immutable',
    });
    await expect(h.ctx.sql.query(`DELETE FROM invoice_allocations WHERE id = $1`, [original.id])).rejects.toMatchObject(
      {
        constraint: 'invoice_allocations_immutable',
      },
    );
    await expect(
      transactions.run((tx) =>
        lines.insertMany(tx, [{ invoiceId: invoice, month: `${YEAR}-07-01`, amountMinor: -1n, bucket: 'POOL_IDLE' }]),
      ),
    ).rejects.toThrow();
    await expect(
      transactions.run((tx) =>
        lines.insertMany(tx, [
          {
            invoiceId: invoice,
            month: `${YEAR}-07-01`,
            amountMinor: 5n,
            bucket: 'POOL_IDLE',
            costCenterId: first.department.unitId,
          },
        ]),
      ),
    ).rejects.toThrow();
    // What takes away is a line of its own that names the one it adjusts, and a second line of the same kind for the same month, bucket and Cost Center is refused.
    await transactions.run((tx) =>
      lines.insertMany(tx, [
        {
          invoiceId: invoice,
          month: `${YEAR}-07-01`,
          amountMinor: -200n,
          bucket: 'COST_CENTER',
          costCenterId: first.department.unitId,
          kind: 'TRANSFER_OUT',
          adjustsAllocationId: original.id,
        },
      ]),
    );
    await expect(
      transactions.run((tx) =>
        lines.insertMany(tx, [
          { invoiceId: invoice, month: `${YEAR}-07-01`, amountMinor: 1n, bucket: 'POOL_IDLE' },
          { invoiceId: invoice, month: `${YEAR}-07-01`, amountMinor: 1n, bucket: 'POOL_IDLE' },
        ]),
      ),
    ).rejects.toThrow();
    expect(await spentBy(first)).toBeGreaterThan(0n);
    // The refused pair left nothing behind (one transaction): the original less what was taken away.
    expect(await repos().lines.totalOfInvoice(invoice)).toBe(300n);
  });

  it('keeps the year an invoice was applied to a Cost Center as rows that are added, and sums them', async () => {
    const { years, transactions } = repos();
    const invoice = await invoiceOf(first, 400, `${YEAR}-08-01`);

    await transactions.run(async (tx) => {
      await years.insert(tx, {
        invoiceId: invoice,
        year: YEAR,
        costCenterId: first.department.unitId,
        source: 'CONFIRMATION',
        appliedMinor: 400n,
      });
      await years.insert(tx, {
        invoiceId: invoice,
        year: YEAR,
        costCenterId: first.department.unitId,
        source: 'WITHDRAWAL',
        appliedMinor: -150n,
      });
    });

    expect(await years.appliedOf(invoice, YEAR, first.department.unitId)).toBe(250n);
    expect(await years.appliedOf(invoice, YEAR + 1, first.department.unitId)).toBe(0n);
    expect((await years.ofInvoice(invoice)).map((row) => row.source)).toEqual(['CONFIRMATION', 'WITHDRAWAL']);
    await expect(
      h.ctx.sql.query(`UPDATE invoice_year_applications SET applied_minor = 0 WHERE invoice_id = $1`, [invoice]),
    ).rejects.toMatchObject({ constraint: 'invoice_allocations_immutable' });
  });
});
