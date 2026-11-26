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

  it('refuses changing purchasedQuantity without expectedUpdatedAt: 422 SUBSCRIPTION.VERSION_REQUIRED', async () => {
    const id = await h.subscription(10, 'K2');

    const res = await patch(id, { purchasedQuantity: 12, quantityChangeReason: 'Expansion' }).expect(422);

    expect(h.codeOf(res)).toBe('SUBSCRIPTION.VERSION_REQUIRED');
  });

  it('refuses a PATCH with stale expectedUpdatedAt after an earlier PATCH: 409 SUBSCRIPTION.STALE', async () => {
    const id = await h.subscription(6, 'K2');
    const seen = await read(id);

    await patch(id, {
      purchasedQuantity: 7,
      quantityChangeReason: 'Team growth',
      expectedUpdatedAt: seen,
    }).expect(200);

    const res = await patch(id, {
      purchasedQuantity: 10,
      quantityChangeReason: 'Team growth',
      expectedUpdatedAt: seen,
    }).expect(409);

    expect(h.codeOf(res)).toBe('SUBSCRIPTION.STALE');
  });

  it('blocks reducing a 12-month active K2 subscription without mid-term reduction: 409 SUBSCRIPTION.MID_TERM_REDUCTION_NOT_ALLOWED', async () => {
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

    expect(h.codeOf(res)).toBe('SUBSCRIPTION.MID_TERM_REDUCTION_NOT_ALLOWED');
  });

  it('allows reducing a 12-month active K2 subscription when allowsMidTermReduction is true', async () => {
    const id = await h.subscription(10, 'K2');
    await h.ctx.sql.query(
      `UPDATE subscriptions SET commitment_term_months = 12, allows_mid_term_reduction = true WHERE id = $1`,
      [id],
    );
    const seen = await read(id);

    const res = await patch(id, { purchasedQuantity: 8, expectedUpdatedAt: seen }).expect(200);

    expect(h.dataOf<{ purchasedQuantity: number }>(res).purchasedQuantity).toBe(8);
  });

  it('requires quantityChangeReason when increasing an active K2 subscription: 422 SUBSCRIPTION.QUANTITY_REASON_REQUIRED', async () => {
    const id = await h.subscription(10, 'K2');
    const seen = await read(id);

    const res = await patch(id, { purchasedQuantity: 12, expectedUpdatedAt: seen }).expect(422);

    expect(h.codeOf(res)).toBe('SUBSCRIPTION.QUANTITY_REASON_REQUIRED');
  });

  it('records quantityChangeReason in the SUBSCRIPTION.UPDATED audit after snapshot when increasing an active K2 subscription', async () => {
    const id = await h.subscription(10, 'K2');
    const seen = await read(id);

    await patch(id, {
      purchasedQuantity: 13,
      quantityChangeReason: 'New onboarding cohort',
      expectedUpdatedAt: seen,
    }).expect(200);

    const audits = (
      await h.ctx.sql.query<{ after: Record<string, unknown> }>(
        `SELECT after FROM audit_events
          WHERE action = 'SUBSCRIPTION.UPDATED' AND resource_id = $1
          ORDER BY occurred_at DESC LIMIT 1`,
        [id],
      )
    ).rows;
    expect(audits).toHaveLength(1);
    expect(audits[0].after).toMatchObject({
      quantity: 13,
      quantityChangeReason: 'New onboarding cohort',
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
});
