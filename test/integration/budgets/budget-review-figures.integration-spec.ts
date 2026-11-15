import request from 'supertest';
import { pretendBusinessToday } from '../../support/pretend-today';
import { SeatMonthService } from '../../../src/modules/budgets/seat-month/seat-month.service';
import { InvoiceHarness } from '../../support/invoice-harness';
import type { Unit } from '../../support/spend-harness';

const h = new InvoiceHarness();
const M = 1_000_000;

interface LineWire {
  costCenter: { id: string } | null;
  spent: { amount: string };
  spentAfterMonth: { amount: string };
  changedAfterSnapshot: { amount: string };
  committed: { amount: string };
  remaining: { amount: string };
  variancePpm: number;
  priceIncrease: { amount: string };
  forecast: { amount: string };
  paceBasisPoints: number | null;
  light: string;
}
interface PeriodWire {
  id: string;
  month: number;
}
interface DetailWire {
  period: PeriodWire;
  items: LineWire[];
}

/**
 * The figures of the close of a month that the first test of the close (`budget-review.integration-spec.ts`) could not tell apart (`FIX-RV1`): what k is measured
 * against, which invoices are in it, and which months of the year the spent figure and the pace count.
 */
describe('The figures of the close of a month are worked out as the documents define them (integration; FIX-RV1)', () => {
  const closing = (body: Record<string, unknown>) =>
    request(h.server()).post('/api/v1/budget-review-periods').set(h.as(h.finance)).send(body);
  const detail = async (id: string): Promise<DetailWire> =>
    h.dataOf<DetailWire>(
      await request(h.server())
        .get(`/api/v1/budget-review-periods/${id}`)
        .query({ pageSize: 100 })
        .set(h.as(h.finance))
        .expect(200),
    );
  const close = async (month: number): Promise<PeriodWire> =>
    h.dataOf<PeriodWire>(await closing({ year: h.year, month }).expect(201));
  const lineOf = (view: DetailWire, unit: Unit) =>
    view.items.find((line) => line.costCenter?.id === unit.department.unitId);

  async function vendorId(): Promise<string> {
    const sql = h.ctx.sql;
    const found = await sql.query<{ id: string }>(
      `SELECT id FROM vendors WHERE organization_id = $1 ORDER BY id LIMIT 1`,
      [h.seed.organizationId],
    );

    return (
      found.rows[0]?.id ??
      (
        await sql.query<{ id: string }>(
          `INSERT INTO vendors (id, organization_id, name, normalized_name)
           VALUES (gen_random_uuid(), $1, 'Review vendor', 'review vendor') RETURNING id`,
          [h.seed.organizationId],
        )
      ).rows[0].id
    );
  }

  /**
   * An invoice of a commitment, as the application would have written it: the commitment of `committed` is expensed by `applied` of the price, the invoice
   * costs `net` and the tax that cannot be deducted. `serviceMonth` is the month it pays for.
   */
  async function expense(
    unit: Unit,
    versionId: string,
    spec: { committed: number; net: number; tax: number; serviceMonth: string; applied?: number },
  ): Promise<void> {
    const applied = spec.applied ?? Math.min(spec.net, spec.committed);
    const commitment = await h.ctx.sql.query<{ id: string }>(
      `INSERT INTO budget_commitments
         (id, organization_id, request_id, cost_center_id, year, amount_minor, currency, state, attached_version_id, attached_at, applied_minor)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, 'EXPENSED'::"CommitmentState", $7, now(), $8) RETURNING id`,
      [
        h.seed.organizationId,
        await h.fixtureRequestId(),
        unit.department.unitId,
        h.year,
        spec.committed,
        h.reporting,
        versionId,
        applied,
      ],
    );
    await h.ctx.sql.query(
      `INSERT INTO invoices (id, organization_id, commitment_id, vendor_id, number, issued_on, currency, net_minor, deductible_tax_minor,
          non_deductible_tax_minor, actual_cost_minor, applied_minor, match_result, recorded_by_employee_id, recorded_at, service_month)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, current_date, $5, $6, 0, $7, $8, $9, 'MATCHED', $10, now(), $11)`,
      [
        h.seed.organizationId,
        commitment.rows[0].id,
        await vendorId(),
        `K-${commitment.rows[0].id}`,
        h.reporting,
        spec.net,
        spec.tax,
        spec.net + spec.tax,
        applied,
        h.finance.employeeId,
        spec.serviceMonth,
      ],
    );
  }

  /** An expense booked to a Cost Center with no commitment (`PI-1`, `R-51`): what an invoice outside the process leaves, whole to the budget, nothing taken from a commitment. */
  async function outsideTheProcess(unit: Unit, amount: number, serviceMonth: string): Promise<void> {
    await h.ctx.sql.query(
      `INSERT INTO invoices (id, organization_id, cost_center_id, vendor_id, number, issued_on, currency, net_minor, deductible_tax_minor,
          non_deductible_tax_minor, actual_cost_minor, applied_minor, match_result, recorded_by_employee_id, recorded_at, service_month)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, current_date, $5, $6, 0, 0, $6, 0, 'MATCHED', $7, now(), $8)`,
      [
        h.seed.organizationId,
        unit.department.unitId,
        await vendorId(),
        `OUT-${unit.department.unitId}-${serviceMonth}`,
        h.reporting,
        amount,
        h.finance.employeeId,
        serviceMonth,
      ],
    );
  }

  /** One department for each case: a month is closed once and the figures of a Cost Center are read by its own line. */
  const units: Record<'outside' | 'basis' | 'pace' | 'late' | 'jan' | 'dec', Unit> = {} as Record<
    'outside' | 'basis' | 'pace' | 'late' | 'jan' | 'dec',
    Unit
  >;
  const versions: Record<string, string> = {};

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    for (const [key, code] of [
      ['outside', 'P-K2'],
      ['basis', 'P-K1'],
      ['pace', 'P-K3'],
      ['late', 'P-K4'],
      ['jan', 'P-K5'],
      ['dec', 'P-K6'],
    ] as const) {
      units[key] = await h.departmentWithHead(code);
      versions[key] = (await h.budgetFor(units[key], { total: 300 * M, reserve: 30 * M })).id;
    }
    // The request that commitments are held for is made from a template the first time: before the day moves, while a head can still be named.
    await h.fixtureRequestId();
    // The day is after the year: every month of the year has ended, and the heads of the departments (named today) are heads on it.
    pretendBusinessToday(h.ctx.app, `${h.year + 1}-01-10`);
  }, 300000);

  afterAll(async () => {
    jest.restoreAllMocks();
    await h.stop();
  });

  it('RV1-02: the invoices outside the process are spent but are not in the basis of k: 160 tr + 8 tr tax and 40 tr outside the process give k = 0,05 (not 0,04) and 349,75 tr', async () => {
    const unit = units.outside;
    await expense(unit, versions.outside, {
      committed: 160 * M,
      net: 160 * M,
      tax: 8 * M,
      serviceMonth: `${h.year}-03-01`,
    });
    await outsideTheProcess(unit, 40 * M, `${h.year}-04-01`);
    await h.commit(unit, versions.outside, h.year, 135 * M, 'HELD');

    const line = lineOf(await detail((await close(4)).id), unit);

    expect(line).toMatchObject({
      spent: { amount: String(208 * M) },
      variancePpm: 50_000,
      forecast: { amount: '349750000' },
      light: 'RED',
    });
  });

  it('RV1-01: k is what the invoices cost over the price in the commitment, not over the price on the invoice: a commitment of 180 tr paid 200 tr, 100 tr held, September ⟹ k = 0,1111, forecast 311,1 tr, Vàng', async () => {
    const unit = units.basis;
    // The exchange rate and the card fee are in the price on the invoice (200 tr, no tax); the commitment took 180 tr down, its own price.
    await expense(unit, versions.basis, { committed: 180 * M, net: 200 * M, tax: 0, serviceMonth: `${h.year}-02-01` });
    await h.commit(unit, versions.basis, h.year, 100 * M, 'HELD');

    const line = lineOf(await detail((await close(9)).id), unit);

    expect(line).toMatchObject({
      spent: { amount: String(200 * M) },
      committed: { amount: String(100 * M) },
      variancePpm: 111_111,
      forecast: { amount: '311111111' },
      paceBasisPoints: 8_889,
      light: 'YELLOW',
    });
  });

  it('RV1-03: the pace is the spent through the end of the month by the month the invoices pay for, not by the day of the close: June closed on 07/07 with an invoice of July of 25 tr is 100 % and Xanh', async () => {
    const unit = units.pace;
    await expense(unit, versions.pace, { committed: 150 * M, net: 150 * M, tax: 0, serviceMonth: `${h.year}-03-01` });
    // An invoice of July, recorded before June is closed: it took the commitment down, so it is spent for the forecast and not yet for the pace.
    await expense(unit, versions.pace, { committed: 25 * M, net: 25 * M, tax: 0, serviceMonth: `${h.year}-07-01` });
    await h.commit(unit, versions.pace, h.year, 100 * M, 'HELD');

    const line = lineOf(await detail((await close(6)).id), unit);

    expect(line).toMatchObject({
      spent: { amount: String(150 * M) },
      spentAfterMonth: { amount: String(25 * M) },
      committed: { amount: String(100 * M) },
      remaining: { amount: String(55 * M) },
      forecast: { amount: String(275 * M) },
      paceBasisPoints: 10_000,
      light: 'GREEN',
    });
  });

  it('RV1-06: an invoice that comes late for a month already closed is a change after the picture: the picture keeps its figure, the line says how much changed since', async () => {
    const unit = units.late;
    await expense(unit, versions.late, {
      committed: 160 * M,
      net: 160 * M,
      tax: 8 * M,
      serviceMonth: `${h.year}-03-01`,
    });
    const closed = await close(8);
    const before = lineOf(await detail(closed.id), unit);

    await expense(unit, versions.late, { committed: 10 * M, net: 10 * M, tax: 0, serviceMonth: `${h.year}-05-01` });
    // An invoice of a month after the one closed is no change of that month: it is spent after it, and the picture of a later month will read it.
    await expense(unit, versions.late, { committed: 5 * M, net: 5 * M, tax: 0, serviceMonth: `${h.year}-10-01` });
    const after = lineOf(await detail(closed.id), unit);

    expect(before).toMatchObject({ spent: { amount: String(168 * M) }, changedAfterSnapshot: { amount: '0' } });
    expect(after).toMatchObject({
      spent: { amount: String(168 * M) },
      changedAfterSnapshot: { amount: String(10 * M) },
    });
  });

  it('RV1-09: a month of a year with no effective budget is not closed: 422 and nothing is written, so there is no empty period that cannot be removed', async () => {
    const refused = await closing({ year: 2020, month: 12 }).expect(422);
    const list = h.dataOf<{ items: PeriodWire[] }>(
      await request(h.server())
        .get('/api/v1/budget-review-periods')
        .query({ year: 2020 })
        .set(h.as(h.finance))
        .expect(200),
    );

    expect((refused.body as { error: { code: string } }).error.code).toBe('BUDGET_REVIEW.NO_BUDGET_FOR_YEAR');
    expect(list.items).toEqual([]);
  });

  it('RV1-11: January is the first month of the schedule: 30 tr spent over a twelfth of 300 tr is 120 %, Vàng, and the forecast is what was spent', async () => {
    const unit = units.jan;
    await expense(unit, versions.jan, { committed: 30 * M, net: 30 * M, tax: 0, serviceMonth: `${h.year}-01-01` });

    const line = lineOf(await detail((await close(1)).id), unit);

    expect(line).toMatchObject({
      spent: { amount: String(30 * M) },
      forecast: { amount: String(30 * M) },
      paceBasisPoints: 12_000,
      light: 'YELLOW',
    });
  });

  it('RV1-11: December has no month left: no price increase, the pace is over the whole base, and 60 tr of 300 tr is 20 % and Dưới mức', async () => {
    const unit = units.dec;
    await expense(unit, versions.dec, { committed: 60 * M, net: 60 * M, tax: 0, serviceMonth: `${h.year}-12-01` });

    const line = lineOf(await detail((await close(12)).id), unit);

    expect(line).toMatchObject({
      spent: { amount: String(60 * M) },
      spentAfterMonth: { amount: '0' },
      priceIncrease: { amount: '0' },
      forecast: { amount: String(60 * M) },
      paceBasisPoints: 2_000,
      light: 'UNDER',
    });
  });

  it('RV1-11: when the seat-months of the month cannot all be worked out nothing is closed: 409 and no period, and the month can be closed once they can', async () => {
    const seatMonths = h.ctx.app.get(SeatMonthService, { strict: false });
    const failing = jest
      .spyOn(seatMonths, 'chargeMonth')
      .mockRejectedValueOnce(new Error('a subscription has no price'));

    const refused = await closing({ year: h.year, month: 2 }).expect(409);
    const listed = h.dataOf<{ items: PeriodWire[] }>(
      await request(h.server())
        .get('/api/v1/budget-review-periods')
        .query({ year: h.year })
        .set(h.as(h.finance))
        .expect(200),
    );
    failing.mockRestore();

    expect((refused.body as { error: { code: string } }).error.code).toBe('BUDGET_REVIEW.SEAT_MONTHS_NOT_READY');
    expect(listed.items.map((one) => one.month)).not.toContain(2);
    await closing({ year: h.year, month: 2 }).expect(201);
  });
});
