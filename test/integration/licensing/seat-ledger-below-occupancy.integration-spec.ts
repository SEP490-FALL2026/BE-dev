import { Client } from 'pg';
import request from 'supertest';
import { Barrier } from '../../support/concurrency-harness';
import { waitForLockWaiters } from '../../support/lock-wait';
import { pretendBusinessToday } from '../../support/pretend-today';
import { RevocationHarness } from '../../support/revocation-harness';

const h = new RevocationHarness();
const TODAY = '2026-11-21';

interface LineRow {
  id: string;
  updated_at: Date;
}

/**
 * The guard of the ledger of the seats of a line against taking seats away, on real PostgreSQL and through the routes: a correction never
 * leaves fewer seats than the seats taken (`SEAT_LEDGER.BELOW_OCCUPANCY`, 409), also when a grant and a correction race for the last free
 * seat. The refusal is raised by a trigger of the database (`seat_changes_below_occupancy`), so this spec also proves that the application
 * recognises that refusal as it reaches it through the Prisma driver adapter (redesign W3 audit D-1).
 */
describe('the seats of a line never fall below the seats taken (integration, real PostgreSQL)', () => {
  let counter = 0;
  const code = () => `E-SBO-${(counter += 1)}`;

  beforeAll(async () => {
    await h.start();
    pretendBusinessToday(h.ctx.app, TODAY);
    // The IT Admin of the specs is the one in charge of the department of the requests, so the grants of this spec are theirs to make.
    await h.ctx.sql.query('UPDATE departments SET it_admin_employee_id = $2 WHERE id = $1', [
      h.seed.departmentId,
      h.it1.employeeId,
    ]);
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
  const occupiedOf = async (subscriptionId: string): Promise<number> =>
    (
      await h.ctx.sql.query<{ taken: number }>(
        `SELECT count(*)::int AS taken FROM license_assignments
          WHERE subscription_id = $1 AND failed_at IS NULL AND cancelled_at IS NULL AND (valid_until IS NULL OR valid_until > $2::date)`,
        [subscriptionId, TODAY],
      )
    ).rows[0].taken;
  const correct = (line: LineRow, delta: number) =>
    request(h.server()).post(`/api/v1/subscription-lines/${line.id}/seat-corrections`).set(h.as(h.it1)).send({
      delta,
      effectiveOn: TODAY,
      note: 'vendor changed the seats',
      expectedUpdatedAt: line.updated_at.toISOString(),
    });

  it('refuses 409 SEAT_LEDGER.BELOW_OCCUPANCY a correction that leaves fewer seats than the seats taken, and writes nothing', async () => {
    const subscriptionId = await h.subscription(3, 'K2');
    await h.seat({ subscriptionId }, code());
    await h.seat({ subscriptionId }, code());
    const line = await lineOf(subscriptionId);

    const refused = await correct(line, -2);

    expect(refused.status).toBe(409);
    expect(h.codeOf(refused)).toBe('SEAT_LEDGER.BELOW_OCCUPANCY');
    expect(await seatsOf(line.id)).toBe(3);
    const allowed = await correct(line, -1);
    expect(allowed.status).toBe(201);
    expect(await seatsOf(line.id)).toBe(2);
  });

  it('20x barrier: a grant and a correction racing for the last free seat: one of the two wins every round, the other is refused (never a 500), and the seats never fall below the seats taken', async () => {
    const subscriptionId = await h.subscription(3, 'K2');
    const planId = await h.planOf(subscriptionId);
    await h.seat({ subscriptionId }, code());
    await h.seat({ subscriptionId }, code());

    for (let round = 0; round < 20; round += 1) {
      // One seat is free at the start of every round: the one that was just taken or taken away is bought again.
      let line = await lineOf(subscriptionId);
      if ((await seatsOf(line.id)) === (await occupiedOf(subscriptionId))) {
        expect((await correct(line, 1)).status).toBe(201);
        line = await lineOf(subscriptionId);
      }
      const person = await h.person(code());
      const requestId = h.gate.grantable(person, planId);
      const barrier = new Barrier(2);

      const [granted, reduced] = await Promise.all([
        (async () => {
          await barrier.wait();

          return h.grant({ requestId, subscriptionId });
        })(),
        (async () => {
          await barrier.wait();

          return correct(line, -1);
        })(),
      ]);

      expect([granted.status, reduced.status].every((status) => status < 500)).toBe(true);
      expect([granted.status === 201, reduced.status === 201].filter(Boolean)).toHaveLength(1);
      expect(await seatsOf(line.id)).toBeGreaterThanOrEqual(await occupiedOf(subscriptionId));
      if (reduced.status !== 201) {
        expect(reduced.status).toBe(409);
        expect(h.codeOf(reduced)).toBe('SEAT_LEDGER.BELOW_OCCUPANCY');
      }
    }
  }, 600000);

  it('a grant that reaches the line first takes the last free seat, and the correction queued behind it is refused 409 SEAT_LEDGER.BELOW_OCCUPANCY', async () => {
    const subscriptionId = await h.subscription(3, 'K2');
    const planId = await h.planOf(subscriptionId);
    await h.seat({ subscriptionId }, code());
    await h.seat({ subscriptionId }, code());
    const line = await lineOf(subscriptionId);
    const requestId = h.gate.grantable(await h.person(code()), planId);
    const holder = new Client({ connectionString: h.ctx.database.url });
    await holder.connect();
    const asked: Promise<request.Response>[] = [];

    try {
      // A session holds the period of the line (tier 6, taken before the line), so the grant and the correction both queue behind it, in
      // the order they arrive: the grant first, the correction only once the grant is seen waiting.
      await holder.query('BEGIN');
      await holder.query('SELECT 1 FROM subscriptions WHERE id = $1 FOR UPDATE', [subscriptionId]);
      asked.push(h.grant({ requestId, subscriptionId }).then((response) => response));
      await waitForLockWaiters(h.ctx.sql, 1);
      asked.push(correct(line, -1).then((response) => response));
      await waitForLockWaiters(h.ctx.sql, 2);
    } finally {
      await holder.query('COMMIT');
    }
    const [granted, corrected] = await Promise.all(asked);
    await holder.end();

    expect(granted.status).toBe(201);
    expect(corrected.status).toBe(409);
    expect(h.codeOf(corrected)).toBe('SEAT_LEDGER.BELOW_OCCUPANCY');
    expect(await seatsOf(line.id)).toBe(3);
    expect(await occupiedOf(subscriptionId)).toBe(3);
  }, 120000);
});
