import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { ApiAccount } from '../../support/api-accounts';
import { GhostSeatWorld } from '../../support/ghost-seat-world';

const w = new GhostSeatWorld();

interface Wire {
  data: Record<string, unknown> & { recommendation?: Record<string, unknown>; taskId?: string };
}

const post = (path: string, account: ApiAccount | string = w.it1) =>
  request(w.server())
    .post(path)
    .set({ Authorization: `Bearer ${typeof account === 'string' ? account : account.accessToken}` });
const get = (path: string, account: ApiAccount | string = w.it1, query: Record<string, string | number> = {}) =>
  request(w.server())
    .get(path)
    .query(query)
    .set({ Authorization: `Bearer ${typeof account === 'string' ? account : account.accessToken}` });
const dataOf = (response: request.Response) => (response.body as Wire).data;

/** A leaver on a K2 subscription of the world, with the open G2 the run made for the seat. */
const openG2 = async (code: string, type: 'K2' | 'K1' = 'K2') => {
  const subscription = await w.worldSubscription(50, type);
  const seat = await w.leaverSeat(subscription, code);
  await w.leave(seat.employeeId);
  await w.runRules();
  const [g2] = await w.g2Of(seat.employeeId);

  return { ...seat, subscription, g2 };
};

describe('the board of wasted seats and the reclaim of a G2 (integration, real PostgreSQL)', () => {
  let it2: ApiAccount;

  beforeAll(async () => {
    await w.startWorld();
    const second = await w.person('E-RECLAIM-IT2');
    it2 = await w.account('E-RECLAIM-IT2', second, 'IT_ADMIN');
  }, 240000);

  afterAll(async () => {
    await w.stop();
  });

  it('US-10-05 AC-5, AC-8: an IT Admin not in charge reclaims an open G2; the task is ABRUPT_DEPARTURE, in the queue at once, audited byInCharge false', async () => {
    const { g2, assignmentId } = await openG2('E-RC-1');

    const response = await post(`/api/v1/ghost-seat-recommendations/${g2.id}/reclaim`, it2).expect(200);

    const { recommendation, taskId } = dataOf(response);
    expect(recommendation).toMatchObject({
      id: g2.id,
      state: 'RECLAIM_DECIDED',
      canReclaim: false,
      revocationTaskId: taskId,
      labels: { revocationUnderWay: true },
    });
    const task = await w.revocationOf(taskId ?? '');
    expect(task).toMatchObject({
      status: 'QUEUED',
      assignmentId,
      revocation: {
        source: 'ABRUPT_DEPARTURE',
        firstReason: { decidedRole: 'IT_ADMIN_G2', referenceKind: 'GHOST_SEAT_RECOMMENDATION', referenceId: g2.id },
      },
    });
    const events = await w.auditOf('GHOST_SEAT_RECOMMENDATION', g2.id);
    expect(events.find((event) => event.action === 'GHOST_SEAT.RECLAIM_OPENED')?.after).toMatchObject({
      state: 'RECLAIM_DECIDED',
      byInCharge: false,
    });
  });

  it('US-10-07 AC-18 (G2): there is no grace; the task opened by the reclaim is claimed at once, and its completion ends the G2 ACCEPTED', async () => {
    const { g2, assignmentId } = await openG2('E-RC-2');
    const { taskId } = dataOf(
      await post(`/api/v1/ghost-seat-recommendations/${g2.id}/reclaim`, w.worldItAdmin.account).expect(200),
    );
    expect((await w.auditOf('GHOST_SEAT_RECOMMENDATION', g2.id)).at(-1)?.after).toMatchObject({ byInCharge: true });

    await w.claim(taskId ?? '', w.worldItAdmin.account).expect(200);
    expect((await w.ghostRows('id = $1', [g2.id]))[0]).toMatchObject({ state: 'RECLAIM_DECIDED' });
    await w
      .revoked(taskId ?? '', { completion: 'ACCOUNT_REMOVED', evidence: 'đã gỡ' }, w.worldItAdmin.account)
      .expect(200);

    expect((await w.ghostRows('id = $1', [g2.id]))[0]).toMatchObject({ state: 'CLOSED', close_reason: 'ACCEPTED' });
    expect(await w.revocationTasksOf(assignmentId)).toEqual([{ id: taskId, status: 'COMPLETED' }]);
  });

  it('US-07-05 AC-15: a reclaim closed as failed puts the G2 back to open, and it can be reclaimed again', async () => {
    const { g2 } = await openG2('E-RC-3');
    const { taskId } = dataOf(await post(`/api/v1/ghost-seat-recommendations/${g2.id}/reclaim`).expect(200));
    await w.claim(taskId ?? '').expect(200);
    await w.fail(taskId ?? '', { reason: 'không gỡ được' }).expect(200);
    await w.closeFailed(taskId ?? '', { reason: 'để sau' }).expect(200);
    expect((await w.ghostRows('id = $1', [g2.id]))[0]).toMatchObject({ state: 'OPEN', revocation_task_id: null });

    await post(`/api/v1/ghost-seat-recommendations/${g2.id}/reclaim`).expect(200);
  });

  it('answers 409 NOT_RECLAIMABLE for a G1, for a G2 already decided and for a closed one; 409 SEAT_NOT_REVOCABLE for a service account; 404 for an id that is none', async () => {
    const subscription = await w.worldSubscription(30, 'K2');
    await w.runRules();
    const [g1] = await w.g1Of(subscription);
    const decided = await openG2('E-RC-4');
    await post(`/api/v1/ghost-seat-recommendations/${decided.g2.id}/reclaim`).expect(200);

    expect(w.codeOf(await post(`/api/v1/ghost-seat-recommendations/${g1.id}/reclaim`).expect(409))).toBe(
      'GHOST_SEAT.NOT_RECLAIMABLE',
    );
    expect(w.codeOf(await post(`/api/v1/ghost-seat-recommendations/${decided.g2.id}/reclaim`).expect(409))).toBe(
      'GHOST_SEAT.NOT_RECLAIMABLE',
    );
    expect(w.codeOf(await post(`/api/v1/ghost-seat-recommendations/${randomUUID()}/reclaim`).expect(404))).toBe(
      'GHOST_SEAT.NOT_FOUND',
    );

    // A service account is answered for by a person and is not taken away by a departure: the gate of licensing refuses it.
    const serviceSubscription = await w.worldSubscription(1, 'K2');
    const answeringFor = await w.person('E-RC-5');
    const { rows } = await w.ctx.sql.query<{ id: string }>(
      `INSERT INTO license_assignments (id, organization_id, kind, source, plan_id, subscription_id, employee_id, account_identifier,
         normalized_account_identifier, reason, cost_center_id, owning_department_id, valid_from, valid_from_basis, created_by_app_user_id)
       SELECT gen_random_uuid(), s.organization_id, 'SERVICE', 'REQUEST', s.plan_id, s.id, $2, 'bot@acme.vn', 'bot@acme.vn', 'bot',
              (SELECT id FROM cost_centers WHERE department_id = s.owner_department_id LIMIT 1), s.owner_department_id,
              '2026-01-05', 'RECORDED', gen_random_uuid()
         FROM subscriptions s WHERE s.id = $1 RETURNING id`,
      [serviceSubscription, answeringFor],
    );
    const service = {
      assignmentId: rows[0].id,
      g2: { id: await w.seedRecommendation({ group: 'G2', state: 'OPEN', tier: 'ACTION', assignmentId: rows[0].id }) },
    };
    const refused = await post(`/api/v1/ghost-seat-recommendations/${service.g2.id}/reclaim`).expect(409);
    expect(w.codeOf(refused)).toBe('GHOST_SEAT.SEAT_NOT_REVOCABLE');
    expect((await w.ghostRows('id = $1', [service.g2.id]))[0]).toMatchObject({
      state: 'OPEN',
      revocation_task_id: null,
    });
    expect(await w.revocationTasksOf(service.assignmentId)).toEqual([]);
  });

  it('opens nothing for a Finance, an employee or the Super Admin: 403, and the G2 stays open', async () => {
    const { g2, assignmentId } = await openG2('E-RC-6');

    for (const account of [w.finance, w.employee, w.admin]) {
      const response = await post(`/api/v1/ghost-seat-recommendations/${g2.id}/reclaim`, account).expect(403);
      expect(w.codeOf(response)).toBe('AUTHORIZATION.FORBIDDEN');
    }

    expect((await w.ghostRows('id = $1', [g2.id]))[0]).toMatchObject({ state: 'OPEN' });
    expect(await w.revocationTasksOf(assignmentId)).toEqual([]);
  });

  it('US-10-05 AC-1, AC-7: the table shows each group apart with no level and no percentage; Finance and an employee are refused', async () => {
    const subscription = await w.worldSubscription(30, 'K2');
    const { g2 } = await openG2('E-RC-7');
    await w.runRules();
    const [g1] = await w.g1Of(subscription);

    const listed = dataOf(await get('/api/v1/ghost-seat-recommendations', w.it1, { pageSize: 100 }).expect(200)) as {
      items: Record<string, unknown>[];
      pagination: { totalItems: number };
    };

    expect(listed.items.find((item) => item.id === g1.id)).toMatchObject({
      group: 'G1',
      tier: null,
      confidenceLabel: 'INTERNAL_DATA',
      canReclaim: false,
      freeSeats: 30,
      holder: null,
    });
    expect(listed.items.find((item) => item.id === g2.id)).toMatchObject({
      group: 'G2',
      confidenceLabel: 'INTERNAL_DATA',
      canReclaim: true,
      holder: { employeeCode: 'E-RC-7' },
    });
    expect(JSON.stringify(listed)).not.toMatch(/percent|confidence":\d/i);
    const filtered = dataOf(await get('/api/v1/ghost-seat-recommendations', w.it1, { group: 'G1' }).expect(200)) as {
      items: { group: string }[];
    };
    expect(filtered.items.every((item) => item.group === 'G1')).toBe(true);
    const mine = dataOf(
      await get('/api/v1/ghost-seat-recommendations', w.worldItAdmin.account, {
        departmentScope: 'MINE',
        pageSize: 100,
      }).expect(200),
    ) as { items: { id: string }[] };
    expect(mine.items.map((item) => item.id)).toEqual(expect.arrayContaining([g1.id, g2.id]));
    const none = dataOf(
      await get('/api/v1/ghost-seat-recommendations', it2, { departmentScope: 'MINE', pageSize: 100 }).expect(200),
    ) as { items: { id: string }[] };
    expect(none.items.map((item) => item.id)).toContain(g1.id);
    expect(none.items.map((item) => item.id)).not.toContain(g2.id);
    for (const account of [w.finance, w.employee]) {
      await get('/api/v1/ghost-seat-recommendations', account).expect(403);
      await get('/api/v1/ghost-seat-optimization-summary', account).expect(403);
    }
    expect(
      await get(`/api/v1/ghost-seat-recommendations/${g2.id}`)
        .expect(200)
        .then((r) => dataOf(r).recommendation),
    ).toMatchObject({
      id: g2.id,
      evidence: { group: 'G2', employeeId: expect.any(String) as string },
    });
    expect(w.codeOf(await get(`/api/v1/ghost-seat-recommendations/${randomUUID()}`).expect(404))).toBe(
      'GHOST_SEAT.NOT_FOUND',
    );
  });

  it('US-10-05 AC-7, DA6-40: the summary keeps the four groups apart and says what internal software lacks', async () => {
    const summary = dataOf(await get('/api/v1/ghost-seat-optimization-summary').expect(200)) as {
      groups: Record<string, { unclosedCount: number; reclaimUnderWayCount: number; confidenceLabel: string }>;
      counted: number;
      limitation: string;
    };

    expect(Object.keys(summary.groups)).toEqual(['G1', 'G2', 'G3', 'G4']);
    expect(summary.groups.G3).toMatchObject({ unclosedCount: 0 });
    expect(summary.counted).toBe(summary.groups.G2.unclosedCount + summary.groups.G1.unclosedCount);
    expect(summary.groups.G2.reclaimUnderWayCount).toBeGreaterThanOrEqual(1);
    expect(summary.limitation).toMatch(/chưa có nguồn usage/);
  });

  it('KPI-5 (DA6-39): 10 made (2 of the watch tier), 2 KEPT, 1 NEGATED of the watch tier, 1 SUPERSEDED gives 3 of 8, 37.5 %; the IT Admin is refused', async () => {
    const subscription = await w.worldSubscription(10, 'K2');
    const seats: { assignmentId: string }[] = [];
    for (let index = 0; index < 10; index += 1) seats.push(await w.leaverSeat(subscription, `E-KPI-${index}`));
    // A recommendation of its own for each seat, in a period no other test wrote to: the day after the last one.
    const future = new Date(Date.now() + 100 * 24 * 3600 * 1000);
    const rows: { group: 'G3' | 'G4'; tier: 'MONITOR' | 'REVIEW' | 'ACTION'; reason?: string }[] = [
      { group: 'G3', tier: 'REVIEW', reason: 'KEPT' },
      { group: 'G3', tier: 'ACTION', reason: 'KEPT' },
      { group: 'G4', tier: 'MONITOR', reason: 'NEGATED' },
      { group: 'G4', tier: 'ACTION', reason: 'SUPERSEDED' },
      { group: 'G3', tier: 'REVIEW' },
      { group: 'G3', tier: 'ACTION' },
      { group: 'G4', tier: 'REVIEW' },
      { group: 'G4', tier: 'ACTION' },
      { group: 'G4', tier: 'REVIEW' },
      { group: 'G3', tier: 'MONITOR' },
    ];
    const replacement = await w.seedRecommendation({
      group: 'G3',
      state: 'OPEN',
      tier: 'MONITOR',
      assignmentId: seats[9].assignmentId,
      createdAt: future,
    });
    for (const [index, row] of rows.entries()) {
      if (index === 9) continue;
      await w.seedRecommendation({
        group: row.group,
        state: row.reason ? 'CLOSED' : 'OPEN',
        tier: row.tier,
        assignmentId: seats[index].assignmentId,
        createdAt: future,
        ...(row.reason ? { closeReason: row.reason } : {}),
        ...(row.reason === 'SUPERSEDED' ? { supersededById: replacement } : {}),
      });
    }
    const from = future.toISOString().slice(0, 10);
    const to = new Date(future.getTime() + 24 * 3600 * 1000).toISOString().slice(0, 10);

    const kpi = dataOf(await get('/api/v1/ghost-seat-kpi5', w.admin, { from, to }).expect(200)) as {
      denominator: number;
      numerator: number;
      ratePercent: number;
      byGroup: Record<string, { denominator: number; numerator: number; confidenceLabel: string }>;
    };

    expect(kpi).toMatchObject({ denominator: 8, numerator: 3, ratePercent: 37.5 });
    expect(kpi.byGroup.G3).toMatchObject({ denominator: 4, numerator: 2, confidenceLabel: 'INTERNAL_DATA' });
    expect(w.codeOf(await get('/api/v1/ghost-seat-kpi5', w.it1, { from, to }).expect(403))).toBe(
      'AUTHORIZATION.FORBIDDEN',
    );
    expect(w.codeOf(await get('/api/v1/ghost-seat-kpi5', w.admin, { from: to, to: from }).expect(422))).toBe(
      'GHOST_SEAT.PERIOD_INVALID',
    );
  });

  it('FR-4.12b: lists the runs of the rules and, apart, why a run left subjects out; a Finance user is refused', async () => {
    const run = await w.runRules();

    const runs = dataOf(await get('/api/v1/ghost-seat-rule-runs', w.admin).expect(200)) as {
      items: { id: string; skippedCount: number }[];
    };
    expect(runs.items.some((item) => item.id === run?.id)).toBe(true);
    const skips = dataOf(await get(`/api/v1/ghost-seat-rule-runs/${run?.id}/skips`, w.it1).expect(200)) as {
      items: { gate: string }[];
      pagination: { totalItems: number };
    };
    expect(skips.pagination.totalItems).toBe(run?.skippedCount);
    expect(
      skips.items.every((item) => ['PER_SEAT', 'INTERNAL_SOFTWARE', 'OPEN_RECOMMENDATION'].includes(item.gate)),
    ).toBe(true);
    await get('/api/v1/ghost-seat-rule-runs', w.finance).expect(403);
    expect(w.codeOf(await get(`/api/v1/ghost-seat-rule-runs/${randomUUID()}/skips`).expect(404))).toBe(
      'GHOST_SEAT.NOT_FOUND',
    );
  });
});
