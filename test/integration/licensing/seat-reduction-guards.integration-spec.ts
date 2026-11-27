import request from 'supertest';
import { pretendBusinessToday } from '../../support/pretend-today';
import { RevocationHarness } from '../../support/revocation-harness';

const h = new RevocationHarness();
const TODAY = '2026-11-21';

interface LineRow {
  id: string;
  updated_at: Date;
}

/**
 * The guards of the ledger of the seats of a line against taking seats away, on real PostgreSQL and through the routes: a mid-term reduction needs the
 * period to allow it (`SEAT_LEDGER.MID_TERM_REDUCTION_NOT_ALLOWED`), and the reductions of one purchase never add up to more than it bought (`SEAT_LEDGER.REDUCTION_EXCEEDS_PURCHASE`).
 */
describe('the guards of a reduction of the seats of a line (integration, real PostgreSQL)', () => {
  beforeAll(async () => {
    await h.start();
    pretendBusinessToday(h.ctx.app, TODAY);
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  const lineOf = async (subscriptionId: string): Promise<LineRow> =>
    (
      await h.ctx.sql.query<LineRow>(
        'SELECT id, updated_at FROM subscription_lines WHERE subscription_id = $1 ORDER BY created_at LIMIT 1',
        [subscriptionId],
      )
    ).rows[0];
  const seatsOf = async (lineId: string): Promise<number> =>
    (
      await h.ctx.sql.query<{ seats: number }>(
        'SELECT COALESCE(sum(delta), 0)::int AS seats FROM seat_changes WHERE subscription_line_id = $1',
        [lineId],
      )
    ).rows[0].seats;
  const reduce = (line: LineRow, refundedSeatChangeId: string, quantity: number) =>
    request(h.server()).post(`/api/v1/subscription-lines/${line.id}/seat-reductions`).set(h.as(h.it1)).send({
      refundedSeatChangeId,
      quantity,
      effectiveOn: TODAY,
      note: 'vendor refunded the seats',
      expectedUpdatedAt: line.updated_at.toISOString(),
    });
  const initialChangeOf = async (lineId: string): Promise<string> =>
    (
      await h.ctx.sql.query<{ id: string }>(
        `SELECT id FROM seat_changes WHERE subscription_line_id = $1 AND reason = 'INITIAL' ORDER BY effective_on LIMIT 1`,
        [lineId],
      )
    ).rows[0].id;

  it('refuses 409 SEAT_LEDGER.MID_TERM_REDUCTION_NOT_ALLOWED a reduction of a period that does not allow it, and writes nothing', async () => {
    const subscriptionId = await h.subscription(10, 'K2');
    const line = await lineOf(subscriptionId);
    const purchase = await initialChangeOf(line.id);

    const refused = await reduce(line, purchase, 1);

    expect(refused.status).toBe(409);
    expect(h.codeOf(refused)).toBe('SEAT_LEDGER.MID_TERM_REDUCTION_NOT_ALLOWED');
    expect(await seatsOf(line.id)).toBe(10);
  });

  it('refuses 409 SEAT_LEDGER.REDUCTION_EXCEEDS_PURCHASE the reductions of one purchase that add up to more than it bought', async () => {
    const subscriptionId = await h.subscription(10, 'K2');
    await h.ctx.sql.query('UPDATE subscriptions SET allows_mid_term_reduction = true WHERE id = $1', [subscriptionId]);
    let line = await lineOf(subscriptionId);
    const purchase = await initialChangeOf(line.id);

    expect((await reduce(line, purchase, 4)).status).toBe(201);
    line = await lineOf(subscriptionId);
    const refused = await reduce(line, purchase, 7);

    expect(refused.status).toBe(409);
    expect(h.codeOf(refused)).toBe('SEAT_LEDGER.REDUCTION_EXCEEDS_PURCHASE');
    expect(h.detailsOf(refused)).toMatchObject({ remaining: 6, requested: 7 });
    expect(await seatsOf(line.id)).toBe(6);
  });
});
