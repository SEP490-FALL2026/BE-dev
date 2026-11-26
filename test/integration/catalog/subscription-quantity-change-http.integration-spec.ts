import request from 'supertest';
import { SeatHarness } from '../../support/seat-baseline-harness';

const h = new SeatHarness();

describe('subscription quantity change rules (real PostgreSQL)', () => {
  const patch = (subscriptionId: string, body: object) =>
    request(h.server()).patch(`/api/v1/subscriptions/${subscriptionId}`).set(h.as(h.it1)).send(body);

  const read = async (subscriptionId: string) =>
    h.dataOf<{ updatedAt: string }>(
      await request(h.server()).get(`/api/v1/subscriptions/${subscriptionId}`).set(h.as(h.it1)).expect(200),
    ).updatedAt;

  beforeAll(async () => {
    await h.start();
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  it('W3-27: refuses PATCH /subscriptions/:id changing purchasedQuantity (even without expectedUpdatedAt) with 409 SUBSCRIPTION.SEAT_COUNT_VIA_LEDGER', async () => {
    const id = await h.subscription(10, 'K2');

    const res = await patch(id, { purchasedQuantity: 12, quantityChangeReason: 'Expansion' }).expect(409);

    expect(h.codeOf(res)).toBe('SUBSCRIPTION.SEAT_COUNT_VIA_LEDGER');
  });

  it('refuses a PATCH with stale expectedUpdatedAt after an earlier PATCH: 409 SUBSCRIPTION.STALE', async () => {
    const id = await h.subscription(6, 'K2');
    const seen = await read(id);

    await patch(id, {
      autoRenew: true,
      expectedUpdatedAt: seen,
    }).expect(200);

    const res = await patch(id, {
      autoRenew: false,
      expectedUpdatedAt: seen,
    }).expect(409);

    expect(h.codeOf(res)).toBe('SUBSCRIPTION.STALE');
  });

  it('W3-27: blocks reducing purchasedQuantity on a 12-month active K2 subscription via PATCH -> 409 SUBSCRIPTION.SEAT_COUNT_VIA_LEDGER', async () => {
    const id = await h.subscription(10, 'K2');
    await h.ctx.sql.query(
      `UPDATE subscriptions SET commitment_term_months = 12, allows_mid_term_reduction = false WHERE id = $1`,
      [id],
    );
    const seen = await read(id);

    const res = await patch(id, {
      purchasedQuantity: 8,
      commitmentTermMonths: 1,
      allowsMidTermReduction: true,
      expectedUpdatedAt: seen,
    }).expect(409);

    expect(h.codeOf(res)).toBe('SUBSCRIPTION.SEAT_COUNT_VIA_LEDGER');
  });

  it('W3-27: refuses reducing purchasedQuantity directly via PATCH even when allowsMidTermReduction is true -> 409 SUBSCRIPTION.SEAT_COUNT_VIA_LEDGER', async () => {
    const id = await h.subscription(10, 'K2');
    await h.ctx.sql.query(
      `UPDATE subscriptions SET commitment_term_months = 12, allows_mid_term_reduction = true WHERE id = $1`,
      [id],
    );
    const seen = await read(id);

    const res = await patch(id, { purchasedQuantity: 8, expectedUpdatedAt: seen }).expect(409);

    expect(h.codeOf(res)).toBe('SUBSCRIPTION.SEAT_COUNT_VIA_LEDGER');
  });

  it('W3-27: refuses PATCH purchasedQuantity without reason via 409 SUBSCRIPTION.SEAT_COUNT_VIA_LEDGER (ledger route owns seat changes)', async () => {
    const id = await h.subscription(10, 'K2');
    const seen = await read(id);

    const res = await patch(id, { purchasedQuantity: 12, expectedUpdatedAt: seen }).expect(409);

    expect(h.codeOf(res)).toBe('SUBSCRIPTION.SEAT_COUNT_VIA_LEDGER');
  });

  it('W3-27: records SEAT_LEDGER.VENDOR_RECORDED in audit events when increasing seats via line seat-corrections', async () => {
    const id = await h.subscription(10, 'K2');
    await h.ctx.sql.query(`UPDATE subscriptions SET responsible_it_admin_employee_id = $2 WHERE id = $1`, [
      id,
      h.it1.employeeId,
    ]);
    const lineRow = (
      await h.ctx.sql.query<{ id: string; updated_at: Date; today: string }>(
        `SELECT id, updated_at, (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date::text AS today
           FROM subscription_lines WHERE subscription_id = $1`,
        [id],
      )
    ).rows[0];

    const created = await request(h.server())
      .post(`/api/v1/subscription-lines/${lineRow.id}/seat-corrections`)
      .set(h.as(h.it1))
      .send({
        delta: 3,
        effectiveOn: lineRow.today,
        note: 'New onboarding cohort',
        expectedUpdatedAt: lineRow.updated_at.toISOString(),
      })
      .expect(201);

    const changeId = h.dataOf<{ id: string }>(created).id;
    const audits = (
      await h.ctx.sql.query<{ after: Record<string, unknown> }>(
        `SELECT after FROM audit_events
          WHERE action = 'SEAT_LEDGER.VENDOR_RECORDED' AND resource_id = $1
          ORDER BY occurred_at DESC LIMIT 1`,
        [changeId],
      )
    ).rows;
    expect(audits).toHaveLength(1);
    expect(audits[0].after).toMatchObject({
      subscriptionLineId: lineRow.id,
      delta: 3,
    });
  });

  it('F-12: two seat-corrections with the same expectedUpdatedAt return 201 then 409 SUBSCRIPTION_LINE.STALE', async () => {
    const id = await h.subscription(6, 'K2');
    await h.ctx.sql.query(`UPDATE subscriptions SET responsible_it_admin_employee_id = $2 WHERE id = $1`, [
      id,
      h.it1.employeeId,
    ]);
    const lineRow = (
      await h.ctx.sql.query<{ id: string; updated_at: Date; today: string }>(
        `SELECT id, updated_at, (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date::text AS today
           FROM subscription_lines WHERE subscription_id = $1`,
        [id],
      )
    ).rows[0];
    const seen = lineRow.updated_at.toISOString();

    await request(h.server())
      .post(`/api/v1/subscription-lines/${lineRow.id}/seat-corrections`)
      .set(h.as(h.it1))
      .send({
        delta: 1,
        effectiveOn: lineRow.today,
        note: 'First vendor adjustment',
        expectedUpdatedAt: seen,
      })
      .expect(201);

    const stale = await request(h.server())
      .post(`/api/v1/subscription-lines/${lineRow.id}/seat-corrections`)
      .set(h.as(h.it1))
      .send({
        delta: 1,
        effectiveOn: lineRow.today,
        note: 'Second vendor adjustment with stale version',
        expectedUpdatedAt: seen,
      })
      .expect(409);

    expect(h.codeOf(stale)).toBe('SUBSCRIPTION_LINE.STALE');
  });

  it('F-14: seat-corrections delta -1 sets outOfProcess=true on 12-month without allowsMidTermReduction and false when allowed', async () => {
    const blockedSub = await h.subscription(6, 'K2');
    await h.ctx.sql.query(
      `UPDATE subscriptions
          SET responsible_it_admin_employee_id = $2,
              commitment_term_months = 12,
              allows_mid_term_reduction = false
        WHERE id = $1`,
      [blockedSub, h.it1.employeeId],
    );
    const blockedLine = (
      await h.ctx.sql.query<{ id: string; updated_at: Date; today: string }>(
        `SELECT id, updated_at, (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date::text AS today
           FROM subscription_lines WHERE subscription_id = $1`,
        [blockedSub],
      )
    ).rows[0];
    const res1 = await request(h.server())
      .post(`/api/v1/subscription-lines/${blockedLine.id}/seat-corrections`)
      .set(h.as(h.it1))
      .send({
        delta: -1,
        effectiveOn: blockedLine.today,
        note: 'Vendor reduced without clause',
        expectedUpdatedAt: blockedLine.updated_at.toISOString(),
      })
      .expect(201);
    expect(h.dataOf<{ outOfProcess: boolean }>(res1).outOfProcess).toBe(true);

    const allowedSub = await h.subscription(6, 'K2');
    await h.ctx.sql.query(
      `UPDATE subscriptions
          SET responsible_it_admin_employee_id = $2,
              commitment_term_months = 12,
              allows_mid_term_reduction = true
        WHERE id = $1`,
      [allowedSub, h.it1.employeeId],
    );
    const allowedLine = (
      await h.ctx.sql.query<{ id: string; updated_at: Date; today: string }>(
        `SELECT id, updated_at, (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date::text AS today
           FROM subscription_lines WHERE subscription_id = $1`,
        [allowedSub],
      )
    ).rows[0];
    const res2 = await request(h.server())
      .post(`/api/v1/subscription-lines/${allowedLine.id}/seat-corrections`)
      .set(h.as(h.it1))
      .send({
        delta: -1,
        effectiveOn: allowedLine.today,
        note: 'Allowed mid-term reduction',
        expectedUpdatedAt: allowedLine.updated_at.toISOString(),
      })
      .expect(201);
    expect(h.dataOf<{ outOfProcess: boolean }>(res2).outOfProcess).toBe(false);
  });
});
