import request from 'supertest';
import { pretendBusinessToday } from '../../support/pretend-today';
import { InvoiceHarness } from '../../support/invoice-harness';
import type { Unit } from '../../support/spend-harness';

const h = new InvoiceHarness();
const M = 1_000_000;

interface LineWire {
  id: string;
  costCenter: { id: string } | null;
  base: { amount: string };
  spent: { amount: string };
  committed: { amount: string };
  pendingSpend: { amount: string };
  changedAfterSnapshot: { amount: string };
  remaining: { amount: string };
  variancePpm: number;
  priceIncrease: { amount: string };
  forecast: { amount: string };
  paceBasisPoints: number | null;
  light: string;
}
interface PeriodWire {
  id: string;
  year: number;
  month: number;
  kind: string;
  state: string;
  lightCounts: Record<string, number>;
  company: { spent: { amount: string } } | null;
  closedBy: { employeeId: string } | null;
}
interface DetailWire {
  period: PeriodWire;
  items: LineWire[];
  pagination: { totalItems: number };
}

/**
 * The close of a month (`RV-1.3`, `T-RV1`): the figures of a Cost Center are the ones of the day, worked out from what the invoices, the commitments and the
 * budget say, kept as a picture that a later invoice does not move (`R-2`), read by Finance and the spending approver in full and by a manager for their own
 * department only (`D8`).
 */
describe('Finance closes a month and the picture of each Cost Center is kept (integration; RV-1.3, T-RV1)', () => {
  let a: Unit;
  let b: Unit;
  let closed: PeriodWire;
  const closing = (body: Record<string, unknown>) =>
    request(h.server()).post('/api/v1/budget-review-periods').set(h.as(h.finance)).send(body);
  const detail = async (id: string, account: Parameters<typeof h.as>[0] = h.finance): Promise<DetailWire> =>
    h.dataOf<DetailWire>(
      await request(h.server())
        .get(`/api/v1/budget-review-periods/${id}`)
        .query({ pageSize: 100 })
        .set(h.as(account))
        .expect(200),
    );
  const lineOf = (view: DetailWire, unit: Unit) =>
    view.items.find((line) => line.costCenter?.id === unit.department.unitId);

  /** An expense of a Cost Center whose invoice cost `tax` more than its price: the price takes the commitment down, the tax is an expense on top (`QĐ-34b`). */
  async function expense(unit: Unit, versionId: string, net: number, tax: number, serviceMonth: string): Promise<void> {
    const sql = h.ctx.sql;
    const commitment = await sql.query<{ id: string }>(
      `INSERT INTO budget_commitments
         (id, organization_id, request_id, cost_center_id, year, amount_minor, currency, state, attached_version_id, attached_at, applied_minor)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, 'EXPENSED'::"CommitmentState", $7, now(), $5) RETURNING id`,
      [h.seed.organizationId, await h.fixtureRequestId(), unit.department.unitId, h.year, net, h.reporting, versionId],
    );
    const vendors = await sql.query<{ id: string }>(
      `SELECT id FROM vendors WHERE organization_id = $1 ORDER BY id LIMIT 1`,
      [h.seed.organizationId],
    );
    const vendorId =
      vendors.rows[0]?.id ??
      (
        await sql.query<{ id: string }>(
          `INSERT INTO vendors (id, organization_id, name, normalized_name)
           VALUES (gen_random_uuid(), $1, 'Review vendor', 'review vendor') RETURNING id`,
          [h.seed.organizationId],
        )
      ).rows[0].id;
    await sql.query(
      `INSERT INTO invoices (id, organization_id, commitment_id, vendor_id, number, issued_on, currency, net_minor, deductible_tax_minor,
          non_deductible_tax_minor, actual_cost_minor, applied_minor, match_result, recorded_by_employee_id, recorded_at, service_month)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, current_date, $5, $6, 0, $7, $8, $6, 'MATCHED', $9, now(), $10)`,
      [
        h.seed.organizationId,
        commitment.rows[0].id,
        vendorId,
        `RV1-${commitment.rows[0].id}`,
        h.reporting,
        net,
        tax,
        net + tax,
        h.finance.employeeId,
        serviceMonth,
      ],
    );
  }

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    a = await h.departmentWithHead('P-RV1A');
    b = await h.departmentWithHead('P-RV1B');
    const budgetA = await h.budgetFor(a, { total: 300 * M, reserve: 30 * M });
    await h.budgetFor(b, { total: 100 * M });
    await expense(a, budgetA.id, 160 * M, 8 * M, `${h.year}-03-01`);
    await h.commit(a, budgetA.id, h.year, 135 * M, 'HELD');
    // The day is after the year: the months of the year have all ended, and the heads of the departments (named today) are heads on it.
    pretendBusinessToday(h.ctx.app, `${h.year + 1}-01-10`);
    closed = h.dataOf<PeriodWire>(await closing({ year: h.year, month: 6 }).expect(201));
  }, 300000);

  afterAll(async () => {
    jest.restoreAllMocks();
    await h.stop();
  });

  it('T-RV1: base 300 tr, reserve 30 tr, spent 168 tr (160 + 8 tax), held 135 tr, June ⟹ k = 0,05, forecast 309,75 tr, pace 112 %, Vàng, 27 tr left', async () => {
    const line = lineOf(await detail(closed.id), a);

    expect(closed).toMatchObject({ year: h.year, month: 6, kind: 'QUARTER', state: 'AWAITING_EXPLANATIONS' });
    expect(line).toMatchObject({
      base: { amount: String(300 * M) },
      spent: { amount: String(168 * M) },
      committed: { amount: String(135 * M) },
      pendingSpend: { amount: '0' },
      remaining: { amount: String(27 * M) },
      variancePpm: 50_000,
      priceIncrease: { amount: '0' },
      forecast: { amount: '309750000' },
      paceBasisPoints: 11_200,
      light: 'YELLOW',
    });
  });

  it('gives a Cost Center that spent and holds nothing a line too: k = 0, forecast 0, and in June a forecast under 70 % of its base is Dưới mức', async () => {
    const line = lineOf(await detail(closed.id), b);

    expect(line).toMatchObject({
      spent: { amount: '0' },
      committed: { amount: '0' },
      variancePpm: 0,
      forecast: { amount: '0' },
      light: 'UNDER',
    });
  });

  it('keeps the own figures of the company for Finance: the invoices of the year, the pool in them', async () => {
    const view = await detail(closed.id);

    expect(BigInt(view.period.company?.spent.amount ?? '0')).toBeGreaterThanOrEqual(BigInt(168 * M));
  });

  it('refuses a month that has not ended, and closes a month once: the second answer is a 409 and the picture is the first', async () => {
    const early = await closing({ year: h.year + 1, month: 1 }).expect(422);
    const again = await closing({ year: h.year, month: 6 }).expect(409);

    expect((early.body as { error: { code: string } }).error.code).toBe('BUDGET_REVIEW.MONTH_NOT_ENDED');
    expect((again.body as { error: { code: string } }).error.code).toBe('BUDGET_REVIEW.PERIOD_EXISTS');
  });

  it('R-2: an invoice that comes after the close is a change after the picture, the picture does not move and the next month shows it', async () => {
    const before = lineOf(await detail(closed.id), a);
    const version = await h.ctx.sql.query<{ id: string }>(
      `SELECT id FROM budget_versions WHERE cost_center_id = $1 AND year = $2 AND state = 'APPROVED'`,
      [a.department.unitId, h.year],
    );
    await expense(a, version.rows[0].id, 10 * M, 0, `${h.year}-05-01`);
    const next = h.dataOf<PeriodWire>(await closing({ year: h.year, month: 7 }).expect(201));

    // The picture keeps every figure it was written with; the only thing that moved is what the line says changed after it (`RV1-06`).
    expect(lineOf(await detail(closed.id), a)).toEqual({
      ...before,
      changedAfterSnapshot: { ...before?.changedAfterSnapshot, amount: String(10 * M) },
    });
    expect(next).toMatchObject({ month: 7, kind: 'MONTH' });
    expect(lineOf(await detail(next.id), a)).toMatchObject({ spent: { amount: String(178 * M) } });
  });

  it('a manager reads the Cost Center of their own department only: their counts, their line, and no figure of the company; another period id is not theirs to know', async () => {
    const list = h.dataOf<{ items: PeriodWire[] }>(
      await request(h.server())
        .get('/api/v1/budget-review-periods')
        .query({ year: h.year })
        .set(h.as(b.head.account))
        .expect(200),
    );
    const mine = await detail(closed.id, b.head.account);

    expect(list.items.map((one) => one.id)).toContain(closed.id);
    expect(list.items.find((one) => one.id === closed.id)?.lightCounts).toEqual({
      GREEN: 0,
      YELLOW: 0,
      RED: 0,
      UNDER: 1,
    });
    expect(list.items.every((one) => one.company === null)).toBe(true);
    expect(mine.items.map((line) => line.costCenter?.id)).toEqual([b.department.unitId]);
    expect(mine.period.company).toBeNull();
    await request(h.server())
      .get('/api/v1/budget-review-periods/00000000-0000-4000-8000-000000000000')
      .set(h.as(b.head.account))
      .expect(404);
  });

  it('the spending approver reads every line, and a person who is none of Finance, the spending approver or a manager is refused', async () => {
    const view = await detail(closed.id, h.deciderOf());

    expect(view.items.length).toBeGreaterThanOrEqual(2);
    await request(h.server()).get('/api/v1/budget-review-periods').set(h.as(a.member.account)).expect(403);
    await request(h.server())
      .post('/api/v1/budget-review-periods')
      .set(h.as(a.head.account))
      .send({ year: h.year, month: 5 })
      .expect(403);
  });
});
