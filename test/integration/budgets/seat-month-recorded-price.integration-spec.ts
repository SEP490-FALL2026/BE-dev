import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { SeatMonthService } from '../../../src/modules/budgets/seat-month/seat-month.service';
import { InvoiceHarness } from '../../support/invoice-harness';
import type { Unit } from '../../support/spend-harness';

const h = new InvoiceHarness();
const M = 1_000_000;

/**
 * A month that was charged and is charged again (the creation of a review of the month recharges it) keeps the days and the commitments up to date, but a seat
 * that already has its row keeps the price that row recorded; a seat with no row yet takes the price of today (`Q-1`, the case D2 of the settlement of a month).
 */
describe('a month charged again keeps the recorded price of the seats that have a row (integration; Q-1, case D2)', () => {
  const month = () => `${h.year}-10-01`;
  const service = () => h.ctx.app.get(SeatMonthService, { strict: false });
  let unit: Unit;
  let subscriptionId: string;
  let planId: string;

  const setPrice = async (priceMinor: number): Promise<void> => {
    await h.ctx.sql.query(
      `UPDATE subscriptions SET unit_price_minor = $2, monthly_unit_price_minor = $2, price_reporting_minor = $2 WHERE id = $1`,
      [subscriptionId, priceMinor],
    );
    await h.ctx.sql.query(`UPDATE subscription_lines SET monthly_unit_price_minor = $2 WHERE subscription_id = $1`, [
      subscriptionId,
      priceMinor,
    ]);
  };
  const holder = async (code: string): Promise<string> => {
    const employeeId = await h.person(code);
    const open = `${h.year}-01-01`;
    await h.ctx.sql.query(
      `UPDATE employee_placements SET valid_from = '2020-01-01', valid_to = '${open}' WHERE employee_id = $1`,
      [employeeId],
    );
    await h.ctx.sql.query(
      `INSERT INTO employee_placements (id, organization_id, employee_id, department_id, valid_from, valid_to)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, NULL)`,
      [h.seed.organizationId, employeeId, unit.department.id, open],
    );

    return employeeId;
  };
  const seat = async (employeeId: string): Promise<string> => {
    const id = randomUUID();
    const validFrom = `${h.year}-03-01`;
    await h.ctx.sql.query(
      `INSERT INTO license_assignments (id, organization_id, kind, source, plan_id, subscription_id, employee_id,
         account_identifier, normalized_account_identifier, valid_from, valid_until, valid_from_basis, created_by_app_user_id, granted_on)
       VALUES ($1, $2, 'PERSONAL', 'REQUEST'::"AssignmentSource", $3, $4, $5, $6, $6, $7, NULL, 'ACTUAL', $8, $7)`,
      [
        id,
        h.seed.organizationId,
        planId,
        subscriptionId,
        employeeId,
        `${id.slice(0, 8)}@acme.vn`,
        validFrom,
        randomUUID(),
      ],
    );

    return id;
  };
  const rowsOf = async () =>
    (
      await h.ctx.sql.query<{ assignment_id: string; days: number; monthly_price_minor: string; amount_minor: string }>(
        `SELECT assignment_id, days, monthly_price_minor::text, amount_minor::text
           FROM seat_month_charges WHERE subscription_id = $1 AND month = $2 ORDER BY assignment_id`,
        [subscriptionId, month()],
      )
    ).rows;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    unit = await h.departmentWithHead('P-RP1');
    await h.budgetFor(unit, { total: 100 * M });
    subscriptionId = await h.subscription(10, 'K2');
    planId = await h.planOf(subscriptionId);
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  it('keeps 500.000 for the seat that has its row after the price fell to 450.000 and the review recharges the month, and gives the seat with no row 450.000', async () => {
    await setPrice(500_000);
    const oldSeat = await seat(await holder('E-RP-OLD'));
    await service().chargeMonth(month());
    expect(await rowsOf()).toEqual([
      { assignment_id: oldSeat, days: 31, monthly_price_minor: '500000', amount_minor: '500000' },
    ]);

    await setPrice(450_000);
    const newSeat = await seat(await holder('E-RP-NEW'));
    await request(h.server())
      .post('/api/v1/budget-review-periods')
      .set(h.as(h.finance))
      .send({ year: h.year, month: 10 })
      .expect(201);

    const rows = await rowsOf();
    expect(rows.find((row) => row.assignment_id === oldSeat)).toEqual({
      assignment_id: oldSeat,
      days: 31,
      monthly_price_minor: '500000',
      amount_minor: '500000',
    });
    expect(rows.find((row) => row.assignment_id === newSeat)).toEqual({
      assignment_id: newSeat,
      days: 31,
      monthly_price_minor: '450000',
      amount_minor: '450000',
    });
    expect(rows).toHaveLength(2);
  });
});
