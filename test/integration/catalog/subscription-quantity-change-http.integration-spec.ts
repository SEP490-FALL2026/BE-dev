import request from 'supertest';
import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import { CatalogApi } from '../../../src/modules/catalog/public/catalog.api';
import { principal } from '../../support/ai-assist-fakes';
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

  it('refuses a PATCH with stale expectedUpdatedAt after addPoolSeat: 409 SUBSCRIPTION.STALE', async () => {
    const id = await h.subscription(6, 'K2');
    const seen = await read(id);

    const catalog = h.ctx.app.get(CatalogApi, { strict: false });
    await h.ctx.app.get(TransactionRunner).run(async (tx) => {
      await catalog.lockSeatTarget(tx, { subscriptionId: id });
      await catalog.addPoolSeat(tx, principal(h.it1.employeeId), id, null);
    });

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
      await h.ctx.sql.query<{ after_state: Record<string, unknown> }>(
        `SELECT after_state FROM audit_events
          WHERE action = 'SUBSCRIPTION.UPDATED' AND target_id = $1
          ORDER BY created_at DESC LIMIT 1`,
        [id],
      )
    ).rows;
    expect(audits).toHaveLength(1);
    expect(audits[0].after_state).toMatchObject({
      quantity: 13,
      quantityChangeReason: 'New onboarding cohort',
    });
  });
});
