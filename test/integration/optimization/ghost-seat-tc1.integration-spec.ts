import request from 'supertest';
import { GhostSeatWorld } from '../../support/ghost-seat-world';

const w = new GhostSeatWorld();

/** Which plan of a subscription the test changes the pricing of (a state the catalog would refuse to declare, so it is written). */
const reprice = (subscriptionId: string, pricing: 'FLAT_RATE' | 'CONCURRENT') =>
  w.ctx.sql.query(
    `UPDATE plans SET pricing_model = $2::"PricingModel" WHERE id = (SELECT plan_id FROM subscriptions WHERE id = $1)`,
    [subscriptionId, pricing],
  );

describe('TC-1: the rules find every wasted seat of a data set with known answers (integration, real PostgreSQL)', () => {
  beforeAll(async () => {
    await w.startWorld();
  }, 240000);

  afterAll(async () => {
    await w.stop();
  });

  it('TC-1 (AC-5): 6 G1, 9 seats of people who left (one under a G4 whose reclaim a head decided) and 7 records that are neither: found 100 %, nothing else', async () => {
    // 6 G1: six per-seat subscriptions with free seats.
    const withFreeSeats: string[] = [];
    for (let index = 0; index < 6; index += 1) {
      const subscription = await w.worldSubscription(10, 'K2');
      await w.fillSeats(subscription, 4, `TC1F${index}X`);
      withFreeSeats.push(subscription);
    }

    // 9 seats of people who left: 8 get a G2, one is under a G4 a head decided (a holder_left_on, no G2).
    const leaverSubscription = await w.worldSubscription(9, 'K2');
    const leavers: { employeeId: string; assignmentId: string }[] = [];
    for (let index = 0; index < 9; index += 1) {
      const leaver = await w.leaverSeat(leaverSubscription, `E-TC1-L${index}`);
      await w.leave(leaver.employeeId);
      leavers.push(leaver);
    }
    const decided = leavers[8];
    const g4 = await w.seedRecommendation({
      group: 'G4',
      state: 'RECLAIM_DECIDED',
      tier: 'ACTION',
      assignmentId: decided.assignmentId,
    });

    // 7 that are not: two active holders, a leaver on internal software, on a flat-rate plan, on a concurrent plan, a service account of a
    // leaver, and a leaver whose seat has already ended.
    const activeSubscription = await w.worldSubscription(2, 'K2');
    const active = [
      await w.leaverSeat(activeSubscription, 'E-TC1-ACTIVE1'),
      await w.leaverSeat(activeSubscription, 'E-TC1-ACTIVE2'),
    ];
    const internal = await w.internalSeat('E-TC1-INTERNAL');
    await w.leave(internal.employeeId);
    const flatSubscription = await w.worldSubscription(1, 'K2');
    const flat = await w.leaverSeat(flatSubscription, 'E-TC1-FLAT');
    await reprice(flatSubscription, 'FLAT_RATE');
    await w.leave(flat.employeeId);
    const concurrentSubscription = await w.worldSubscription(1, 'K2');
    const concurrent = await w.leaverSeat(concurrentSubscription, 'E-TC1-CONCURRENT');
    await reprice(concurrentSubscription, 'CONCURRENT');
    await w.leave(concurrent.employeeId);
    const serviceSubscription = await w.worldSubscription(1, 'K2');
    const service = { employeeId: await w.person('E-TC1-SERVICE') };
    await w.ctx.sql.query(
      `INSERT INTO license_assignments (id, organization_id, kind, source, plan_id, subscription_id, employee_id, account_identifier,
         normalized_account_identifier, reason, cost_center_id, owning_department_id, valid_from, valid_from_basis, created_by_app_user_id)
       SELECT gen_random_uuid(), s.organization_id, 'SERVICE', 'REQUEST', s.plan_id, s.id, $2, 'bot@acme.vn', 'bot@acme.vn', 'bot',
              (SELECT id FROM cost_centers WHERE department_id = s.owner_department_id LIMIT 1), s.owner_department_id,
              '2026-01-05', 'RECORDED', gen_random_uuid()
         FROM subscriptions s WHERE s.id = $1`,
      [serviceSubscription, service.employeeId],
    );
    await w.leave(service.employeeId);
    const endedSubscription = await w.worldSubscription(1, 'K2');
    const ended = await w.leaverSeat(endedSubscription, 'E-TC1-ENDED');
    await w.ctx.sql.query(`UPDATE license_assignments SET valid_until = valid_from + 1 WHERE id = $1`, [
      ended.assignmentId,
    ]);
    await reprice(endedSubscription, 'FLAT_RATE');
    await w.leave(ended.employeeId);

    const run = await w.runRules();

    expect(run).toMatchObject({ status: 'COMPLETED', failedCount: 0 });
    const g1s = await w.ghostRows(`"group" = 'G1'`);
    expect(g1s.map((row) => row.subscription_id).sort()).toEqual([...withFreeSeats].sort());
    expect(g1s.every((row) => row.state === 'OPEN' && row.free_seats === 6)).toBe(true);

    const g2s = await w.ghostRows(`"group" = 'G2'`);
    expect(g2s.map((row) => row.employee_id).sort()).toEqual(
      leavers
        .slice(0, 8)
        .map((leaver) => leaver.employeeId)
        .sort(),
    );
    const [marked] = await w.ghostRows('id = $1', [g4]);
    expect(marked.holder_left_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(await w.g2Of(decided.employeeId)).toEqual([]);
    for (const other of [...active, internal, flat, concurrent, service, ended]) {
      expect(await w.g2Of(other.employeeId)).toEqual([]);
    }
    expect(await w.ghostRows()).toHaveLength(6 + 8 + 1);

    // Dashboard of the IT Admin: the G2 not closed plus the G1 open (US-12-15 AC-4); the G4 is not counted here.
    const overview = await request(w.server())
      .get('/api/v1/dashboards/it-admin')
      .set({ Authorization: `Bearer ${w.it1.accessToken}` })
      .expect(200);
    expect((overview.body as { data: { sections: { ghostSeats: unknown } } }).data.sections.ghostSeats).toEqual({
      state: 'COUNTED',
      count: 6 + 8,
      sourceOperationId: 'ghostSeatRecommendationList',
      reason: null,
    });
  });
});
