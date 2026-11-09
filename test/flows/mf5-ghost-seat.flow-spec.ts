import { randomUUID } from 'node:crypto';
import { FlowWorld } from '../support/flows/flow-world';

/**
 * MF-5, the core of the ghost seat (qd103-ghost-seat-manager-decision): a recommendation of the review tier goes to the head of the
 * department of the holder, the head chooses to reclaim it, the holder is told, the IT Admin cannot take the task before the grace
 * ends (409 NOT_BEFORE) and can after it, and completing it ends the recommendation ACCEPTED. A second recommendation is kept, a third
 * is exempted. Real sign-in, the seeded dataset, the clock of the flows.
 *
 * NOT RUN YET (09/11/2026): the seed of this runner calls `POST /budget-proposals`, which answers 500 on the base of this branch
 * (`priorityRank`, `budgets/**`, outside this item). The recommendations of `G3`/`G4` are written straight into the table because the
 * rules that make them (`qd103-ghost-seat-g3-g4`) and the import of vendor usage (`qd103-vendor-usage-import`) are not delivered
 * yet; when they are, replace `recommend` by the import and the weekly pass. The same path is proved without the seed by
 * `test/integration/optimization/ghost-seat-decision.integration-spec.ts`.
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
    await sql().query(
      `INSERT INTO ghost_seat_recommendations (id, organization_id, "group", state, tier, application_id, plan_id, assignment_id,
         seat_chain_id, employee_id, evidence, created_run_id)
       SELECT $1, organization_id, 'G4', 'OPEN', 'REVIEW', $3, $4, $2, $2, $5, '{"group":"G4"}'::jsonb, $6 FROM employees WHERE id = $5`,
      [id, seat.id, seat.application_id, seat.plan_id, employeeId, runId],
    );

    return { id, employeeId };
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
    const rec = await recommend('NV-DEV1', 'Jira Standard');

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
    const kept = await recommend('NV-DEV2', 'Jira Standard');
    const exempt = await recommend('NV-DEV4', 'Jira Standard');
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
