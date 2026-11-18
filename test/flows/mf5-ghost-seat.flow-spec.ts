import { randomUUID } from 'node:crypto';
import { FlowWorld } from '../support/flows/flow-world';
import { seedUsageEvidence } from '../support/ghost-seat-usage-evidence';

/**
 * MF-5, the core of the ghost seat (qd103-ghost-seat-manager-decision): a recommendation of the review tier goes to the head of the
 * department of the holder, the head chooses to reclaim it, the holder is told, the IT Admin cannot take the task before the grace
 * ends (409 NOT_BEFORE) and can after it, and completing it ends the recommendation ACCEPTED. A second recommendation is kept, a third
 * is exempted. Real sign-in, the seeded dataset, the clock of the flows.
 *
 * Runs on the seeded dataset (`shared-demo-v4`) with seats of its own (see `holdSeat`). The recommendation is written straight into the table
 * rather than waited for from the rules of `G3`/`G4` (`qd103-ghost-seat-g3-g4`, which the seed runs for the dataset's own recommendations),
 * so that the seat, the holder and the head are the ones this scenario names and the weekly pass is not part of what it proves. The same
 * path is proved without the seed by `test/integration/optimization/ghost-seat-decision.integration-spec.ts`.
 */
describe('MF-5 trưởng phòng quyết định ghost seat: Thu hồi có ân hạn, Giữ, Miễn trừ @MF5 @D1', () => {
  let world: FlowWorld;
  let runId: string;

  const call = () => world.calls;
  const sql = () => world.ctx.sql;

  /** A G4 recommendation of the review tier for the seat a person holds on a plan, as the weekly pass of `G3`/`G4` will make it. */
  const recommend = async (employeeCode: string, planName: string): Promise<{ id: string; employeeId: string }> => {
    const employeeId = await world.facts.employeeId(employeeCode);
    const seat = await world.facts.one<{ id: string; plan_id: string; application_id: string }>(
      `SELECT a.id, a.plan_id, p.application_id FROM license_assignments a JOIN plans p ON p.id = a.plan_id
        WHERE a.employee_id = $1 AND a.kind = 'PERSONAL' AND p.name = $2`,
      [employeeId, planName],
    );
    const id = randomUUID();
    // A G4 carries its confidence and its activity status (CHECK `ghost_seat_recommendations_usage`) and the evidence the pass writes.
    await sql().query(
      `INSERT INTO ghost_seat_recommendations (id, organization_id, "group", state, tier, application_id, plan_id, assignment_id,
         seat_chain_id, employee_id, evidence, created_run_id, confidence, activity_status, inactive_days)
       SELECT $1, organization_id, 'G4', 'OPEN', 'REVIEW', $3, $4, $2, $2, $5, $7::jsonb, $6, 'HIGH', 'INACTIVE', 70
         FROM employees WHERE id = $5`,
      [
        id,
        seat.id,
        seat.application_id,
        seat.plan_id,
        employeeId,
        runId,
        JSON.stringify(seedUsageEvidence('G4', employeeId, seat.plan_id)),
      ],
    );

    return { id, employeeId };
  };

  /**
   * A seat of the plan for a person of ENG who holds none of it in the seeded dataset, on the one subscription of the plan, as a finished
   * grant leaves it. The seats the dataset grants to Engineering are granted today (or end within weeks, as R16, R17): a head's reclaim of
   * a seat that ends soon is LEFT_TO_EXPIRE (FR-4.9 gate 7), so the flow uses seats of its own, with no end or one far enough.
   */
  const holdSeat = async (
    employeeCode: string,
    planName: string,
    expectedEndDate: string | null = null,
  ): Promise<void> => {
    const subscriptionId = await call().subscriptionOf(planName);
    await sql().query(
      `INSERT INTO license_assignments (id, organization_id, kind, source, plan_id, subscription_id, employee_id, account_identifier,
         normalized_account_identifier, valid_from, valid_from_basis, owning_department_id, created_by_app_user_id, expected_end_date)
       SELECT gen_random_uuid(), s.organization_id, 'PERSONAL', 'REQUEST', s.plan_id, s.id, e.id, e.work_email, e.normalized_work_email,
              '2026-01-05', 'RECORDED', (SELECT id FROM departments WHERE code = 'ENG'), $3::uuid, $4::date
         FROM subscriptions s JOIN employees e ON e.employee_code = $2 WHERE s.id = $1`,
      [subscriptionId, employeeCode, randomUUID(), expectedEndDate],
    );
  };

  const decide = (choice: string, recommendationId: string, extra: object = {}) =>
    call().post('NV-ENGH', '/ghost-seat-decisions', {
      items: [{ recommendationId }],
      choice,
      reason: 'Lý do của trưởng phòng',
      ...extra,
    });

  beforeAll(async () => {
    world = await FlowWorld.open();
    runId = (
      await world.facts.one<{ id: string }>(
        `INSERT INTO ghost_seat_rule_runs (organization_id, rule_set, period_key, status, finished_at)
         SELECT id, 'G3_G4', 'flow-mf5', 'COMPLETED', now() FROM organizations RETURNING id`,
      )
    ).id;
  }, 300000);

  afterAll(async () => {
    await world?.close();
  });

  it('định tuyến tới trưởng phòng ⟹ Thu hồi ⟹ claim sớm 409 NOT_BEFORE ⟹ sau ân hạn hoàn tất ⟹ ACCEPTED @B5', async () => {
    await holdSeat('NV-DEV2', 'Jira Standard');
    const rec = await recommend('NV-DEV2', 'Jira Standard');

    await world.clock.sweep('ghostSeatQueue');

    const queue = call().data<{ items: { id: string; state: string }[] }>(
      await call().get('NV-ENGH', '/ghost-seat-queue'),
    );
    expect(queue.items.map((item) => item.id)).toContain(rec.id);
    expect((await call().get('NV-ITA1', '/ghost-seat-queue')).status).toBe(403);

    const decided = call().data<{ items: { revocationTaskId: string; notBefore: string; outcome: string }[] }>(
      await decide('RECLAIM', rec.id),
    );
    const [item] = decided.items;
    expect(item).toMatchObject({ outcome: 'RECLAIM_DECIDED', notBefore: call().inDays(7) });
    expect(await world.facts.notices('REVOCATION_UPCOMING', item.revocationTaskId)).toHaveLength(1);

    const early = await call().post('NV-ITA1', `/provisioning-tasks/${item.revocationTaskId}/claim`);
    expect([early.status, call().codeOf(early)]).toEqual([409, 'PROVISIONING_TASK.NOT_BEFORE']);

    world.clock.jumpDays(7);
    // A week later the sessions of the morning have expired: the IT Admin and the head sign in again (as the other flows do after a jump).
    for (const code of ['NV-ITA1', 'NV-ENGH']) await world.actors.signIn(code);
    expect((await call().post('NV-ITA1', `/provisioning-tasks/${item.revocationTaskId}/claim`)).status).toBe(200);
    const done = await call().post('NV-ITA1', `/provisioning-tasks/${item.revocationTaskId}/revocation-completion`, {
      completion: 'ACCOUNT_REMOVED',
      evidence: 'đã gỡ tài khoản',
    });
    expect(done.status).toBe(200);
    expect(
      await world.facts.one<{ state: string; close_reason: string }>(
        `SELECT state::text, close_reason::text FROM ghost_seat_recommendations WHERE id = $1`,
        [rec.id],
      ),
    ).toMatchObject({ state: 'CLOSED', close_reason: 'ACCEPTED' });
  });

  it('Giữ đóng KEPT không báo người giữ; Miễn trừ đóng EXEMPTED và ghi miễn trừ @B5', async () => {
    // NV-DEV4 is not a person of the seeded dataset: the holders are NV-DEV3 and the intern NV-INT1 (whose seat ends in six months).
    await holdSeat('NV-DEV3', 'Jira Standard');
    await holdSeat('NV-INT1', 'Jira Standard', call().inDays(180));
    const kept = await recommend('NV-DEV3', 'Jira Standard');
    const exempt = await recommend('NV-INT1', 'Jira Standard');
    await world.clock.sweep('ghostSeatQueue');

    expect((await decide('KEEP', kept.id)).status).toBe(201);
    expect((await decide('EXEMPT', exempt.id, { exemptUntil: call().inDays(90) })).status).toBe(201);

    expect(await world.facts.count('ghost_seat_recommendations', `id = $1 AND close_reason = 'KEPT'`, [kept.id])).toBe(
      1,
    );
    expect(
      await world.facts.count('ghost_seat_recommendations', `id = $1 AND close_reason = 'EXEMPTED'`, [exempt.id]),
    ).toBe(1);
    expect(await world.facts.count('ghost_seat_exemptions', 'recommendation_id = $1', [exempt.id])).toBe(1);
    expect(
      await world.facts.count('in_app_notifications', `recipient_employee_id = $1 AND code LIKE 'REVOCATION_%'`, [
        kept.employeeId,
      ]),
    ).toBe(0);
  });
});
