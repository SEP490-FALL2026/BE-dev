import { GhostSeatService } from '../../../src/modules/optimization/ghost-seat/ghost-seat.service';
import { GhostSeatWorld } from '../../support/ghost-seat-world';

const w = new GhostSeatWorld();

describe('G1: the free seats of a subscription (integration, real PostgreSQL)', () => {
  beforeAll(async () => {
    await w.startWorld();
  }, 240000);

  afterAll(async () => {
    await w.stop();
  });

  it('US-10-01 AC-1, R-E02: Figma K2 PER_SEAT 100 seats with 88 taken gives one G1 of 12 free, no department, no notice, internal data', async () => {
    const subscription = await w.worldSubscription(100, 'K2');
    await w.fillSeats(subscription, 88);

    const run = await w.runRules();

    expect(run).toMatchObject({ status: 'COMPLETED', ruleSet: 'G1_G2', failedCount: 0 });
    const [g1, ...others] = await w.g1Of(subscription);
    expect(others).toEqual([]);
    expect(g1).toMatchObject({
      group: 'G1',
      state: 'OPEN',
      tier: null,
      free_seats: 12,
      counts_toward_vacant_cost: true,
      assignment_id: null,
      employee_id: null,
      department_id: null,
      evidence: { group: 'G1', purchased: 100, occupied: 88, free: 12, action: 'REGRANT_OR_REDUCE' },
    });
    expect(await w.noticesOf('GHOST_SEAT_G2_DETECTED')).toEqual([]);
    expect((await w.auditOf('GHOST_SEAT_RECOMMENDATION', g1.id)).map((event) => event.action)).toEqual([
      'GHOST_SEAT.CREATED',
    ]);
    expect((await w.auditOf('GHOST_SEAT_RECOMMENDATION', g1.id))[0].actor_roles).toEqual([]);
  });

  it('TẠM CHỌN (Q-12, K4): a K4 key pool is not supported yet, so it gets no G1', async () => {
    const subscription = await w.worldSubscription(5, 'K4');
    await w.fillSeats(subscription, 3);

    await w.runRules();

    expect(await w.g1Of(subscription)).toEqual([]);
  });

  it('US-10-01 AC-9, INV-01: 10 seats all taken by assignments (those waiting for their grant included) give no G1; a failed grant frees its seat', async () => {
    const subscription = await w.worldSubscription(10, 'K2');
    const taken = await w.fillSeats(subscription, 10);

    await w.runRules();
    expect(await w.g1Of(subscription)).toEqual([]);

    await w.ctx.sql.query(`UPDATE license_assignments SET failed_at = now(), valid_until = valid_from WHERE id = $1`, [
      taken[0],
    ]);
    await w.runRules();
    expect((await w.g1Of(subscription))[0]).toMatchObject({ state: 'OPEN', free_seats: 1 });
  });

  it('US-10-01 AC-7, gate 1: a plan that is not PER_SEAT (Notion, 40 seats) gets no G1 and is left out with the gate', async () => {
    const subscription = await w.worldSubscription(50, 'K2');
    await w.fillSeats(subscription, 40);
    await w.ctx.sql.query(
      `UPDATE plans SET pricing_model = 'FLAT_RATE' WHERE id = (SELECT plan_id FROM subscriptions WHERE id = $1)`,
      [subscription],
    );

    const run = await w.runRules();

    expect(await w.g1Of(subscription)).toEqual([]);
    expect(await w.skipsOf(run?.id ?? '', subscription)).toEqual([
      {
        subject_type: 'SUBSCRIPTION',
        subject_id: subscription,
        gate: 'PER_SEAT',
        detail: { pricingModel: 'FLAT_RATE', provisioningType: 'K2' },
      },
    ]);
  });

  it('G1 lifecycle: 12 free, then 10 (updated, audited), then none (FREE_SEATS_GONE), and a subscription that ended is OUT_OF_SCOPE', async () => {
    const subscription = await w.worldSubscription(20, 'K2');
    await w.fillSeats(subscription, 8, 'LIFEA');
    await w.runRules();
    const [made] = await w.g1Of(subscription);
    expect(made).toMatchObject({ state: 'OPEN', free_seats: 12 });

    const extra = await w.fillSeats(subscription, 2, 'LIFEB');
    expect(extra).toHaveLength(2);
    await w.runRules();
    const [updated] = await w.g1Of(subscription);
    expect(updated).toMatchObject({ id: made.id, state: 'OPEN', free_seats: 10 });
    expect(updated.evidence).toEqual(made.evidence);
    expect((await w.auditOf('GHOST_SEAT_RECOMMENDATION', made.id)).map((event) => event.action)).toEqual([
      'GHOST_SEAT.CREATED',
      'GHOST_SEAT.G1_UPDATED',
    ]);

    await w.fillSeats(subscription, 10, 'LIFEC');
    await w.runRules();
    expect((await w.g1Of(subscription))[0]).toMatchObject({ state: 'CLOSED', close_reason: 'FREE_SEATS_GONE' });

    const second = await w.worldSubscription(10, 'K2');
    await w.runRules();
    expect(await w.g1Of(second)).toHaveLength(1);
    await w.ctx.sql.query(`UPDATE subscriptions SET end_date = '2026-01-06' WHERE id = $1`, [second]);
    await w.runRules();
    expect((await w.g1Of(second))[0]).toMatchObject({ state: 'CLOSED', close_reason: 'OUT_OF_SCOPE' });

    const [reopened] = await w.g1Of(subscription);
    expect(reopened.state).toBe('CLOSED');
  });

  it('runs one period once: two instances at one tick make one run, asking again for the period does nothing', async () => {
    const day = w.nextDay();

    const answers = await Promise.all([w.runRules(day), w.runRules(day)]);

    expect(answers.filter((run) => run !== null)).toHaveLength(1);
    expect(await w.runRules(day)).toBeNull();
    const { rows } = await w.ctx.sql.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM ghost_seat_rule_runs WHERE rule_set = 'G1_G2'`,
    );
    expect(rows[0].n).toBeGreaterThanOrEqual(1);
  });

  it('takes over a run that has been RUNNING for 3 hours (attempt 2) and not one that is on its last attempt, nor one that is fresh', async () => {
    const day = w.nextDay();
    const first = await w.runRules(day);
    expect(first).toMatchObject({ status: 'COMPLETED', attempt: 1 });

    await w.ctx.sql.query(
      `UPDATE ghost_seat_rule_runs SET status = 'RUNNING', finished_at = NULL, started_at = $2::timestamptz - interval '1 hour' WHERE id = $1`,
      [first?.id, day],
    );
    expect(await w.runRules(day)).toBeNull();

    await w.ctx.sql.query(
      `UPDATE ghost_seat_rule_runs SET started_at = $2::timestamptz - interval '3 hours' WHERE id = $1`,
      [first?.id, day],
    );
    const taken = await w.runRules(day);
    expect(taken).toMatchObject({ id: first?.id, status: 'COMPLETED', attempt: 2 });

    await w.ctx.sql.query(
      `UPDATE ghost_seat_rule_runs SET status = 'RUNNING', finished_at = NULL, attempt = 3, started_at = $2::timestamptz - interval '3 hours' WHERE id = $1`,
      [first?.id, day],
    );
    expect(await w.runRules(day)).toBeNull();
  });

  it('keys the period by the week when the schedule says WEEKLY: a second day of the same week is not run', async () => {
    await w.setSchedule('WEEKLY').expect(200);
    try {
      const monday = w.dayOf(40 - ((w.dayOf(40).getUTCDay() + 6) % 7));
      const tuesday = new Date(monday.getTime() + 24 * 3600 * 1000);

      const run = await w.runRules(monday);
      expect(run?.periodKey).toMatch(/^\d{4}-W\d{2}$/);
      expect(await w.runRules(tuesday)).toBeNull();
    } finally {
      await w.setSchedule('DAILY').expect(200);
    }
  });

  it('counts a subscription that fails and goes on with the others (failed_count = 1)', async () => {
    const broken = await w.worldSubscription(30, 'K2');
    const fine = await w.worldSubscription(30, 'K2');
    const service = w.ctx.app.get(GhostSeatService);
    const create = service.create.bind(service);
    const spy = jest.spyOn(service, 'create').mockImplementation(async (tx, input, actor) => {
      if (input.subscriptionId === broken) throw new Error('boom');

      return create(tx, input, actor);
    });
    try {
      const run = await w.runRules();

      expect(run).toMatchObject({ status: 'COMPLETED', failedCount: 1 });
      expect(await w.g1Of(broken)).toEqual([]);
      expect(await w.g1Of(fine)).toHaveLength(1);
    } finally {
      spy.mockRestore();
    }
  });
});
