import { GhostSeatRepo } from '../../../src/modules/optimization/ghost-seat/ghost-seat.repo';
import { withAssignmentsUnlocked } from '../../support/fixture-sql';
import { GhostSeatWorld } from '../../support/ghost-seat-world';

const w = new GhostSeatWorld();

/** The seat of a person on a PER_SEAT K2 subscription of the world's department, a person who has already left. */
const leaverOn = async (subscription: string, code: string, grantedOn?: string) => {
  const assignmentId = await w.seat({ subscriptionId: subscription }, code, grantedOn);
  const { rows } = await w.ctx.sql.query<{ employee_id: string }>(
    `SELECT employee_id FROM license_assignments WHERE id = $1`,
    [assignmentId],
  );
  await withAssignmentsUnlocked(w.ctx.sql, `UPDATE license_assignments SET owning_department_id = $2 WHERE id = $1`, [
    assignmentId,
    w.worldDepartment,
  ]);
  await w.leave(rows[0].employee_id);

  return { employeeId: rows[0].employee_id, assignmentId };
};

/** M5-04: a G2 answers to the department its holder last worked in (the owning department only when the holder has no placement). */
const lastDepartmentOf = async (employeeId: string): Promise<string> =>
  (
    await w.ctx.sql.query<{ department_id: string }>(
      `SELECT department_id FROM employee_placements WHERE employee_id = $1 ORDER BY valid_from DESC LIMIT 1`,
      [employeeId],
    )
  ).rows[0].department_id;

describe('G2: the seat of a person who left (integration, real PostgreSQL)', () => {
  let k2: string;

  beforeAll(async () => {
    await w.startWorld();
    k2 = await w.worldSubscription(200, 'K2');
  }, 240000);

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await w.stop();
  });

  it('US-10-01 AC-2, US-12-15 line 28: a person who left yesterday and still holds Jira gets an open ACTION G2, told to the IT Admin in charge', async () => {
    const { employeeId, assignmentId } = await leaverOn(k2, 'E-G2-A1');

    const run = await w.runRules();

    expect(run).toMatchObject({ status: 'COMPLETED', failedCount: 0 });
    const [g2, ...others] = await w.g2Of(employeeId);
    expect(others).toEqual([]);
    expect(g2).toMatchObject({
      group: 'G2',
      state: 'OPEN',
      tier: 'ACTION',
      assignment_id: assignmentId,
      seat_chain_id: assignmentId,
      department_id: await lastDepartmentOf(employeeId),
      revocation_task_id: null,
      evidence: { group: 'G2', employeeId, provisioningType: 'K2' },
    });
    const notices = await w.noticesOf('GHOST_SEAT_G2_DETECTED', w.worldItAdmin.employeeId);
    expect(notices.filter((notice) => notice.event_key === `GHOST_SEAT_G2:${g2.id}`)).toHaveLength(1);
    expect(notices.find((notice) => notice.event_key === `GHOST_SEAT_G2:${g2.id}`)?.params).toMatchObject({
      recommendationId: g2.id,
      employeeId,
    });
  });

  it('M5-04, BRD MF-5, US-10-01 AC-2: a seat of the shared pool (no owning department) answers to where its holder last worked, and its IT Admin is told', async () => {
    const assignmentId = await w.seat({ subscriptionId: k2 }, 'E-G2-M504');
    const { rows } = (await withAssignmentsUnlocked(
      w.ctx.sql,
      `UPDATE license_assignments SET owning_department_id = NULL WHERE id = $1 RETURNING employee_id`,
      [assignmentId],
    )) as { rows: { employee_id: string }[] };
    await w.leave(rows[0].employee_id);

    const run = await w.runRules();

    expect(run).toMatchObject({ status: 'COMPLETED', failedCount: 0 });
    const [g2] = await w.g2Of(rows[0].employee_id);
    expect(g2).toMatchObject({
      group: 'G2',
      state: 'OPEN',
      department_id: await lastDepartmentOf(rows[0].employee_id),
    });
    // M5-04: the IT Admin told is the one in charge of the department the holder last worked in, once.
    const notices = await w.noticesOf('GHOST_SEAT_G2_DETECTED');
    const told = notices.filter((notice) => notice.event_key === `GHOST_SEAT_G2:${g2.id}`);
    expect(told).toHaveLength(1);
    expect(told[0].recipient_employee_id).not.toBe(rows[0].employee_id);
  });

  it('M5-05, QĐ-108i, DA6-04: a G4 a head decided to reclaim after the pass read it as undecided is marked, never superseded', async () => {
    const { employeeId, assignmentId } = await leaverOn(k2, 'E-G2-M505');
    const g4 = await w.seedRecommendation({
      group: 'G4',
      state: 'AWAITING_DECISION',
      tier: 'REVIEW',
      assignmentId,
      deciderDepartmentId: w.worldDepartment,
      routedAt: new Date(),
      decisionDueOn: '2030-01-01',
    });
    const repo = w.ctx.app.get(GhostSeatRepo);
    const lock = repo.lock.bind(repo);
    // The head decides between the read of the pass and its lock of the recommendation.
    jest.spyOn(repo, 'lock').mockImplementation(async (tx, id) => {
      if (id === g4) {
        await w.ctx.sql.query(
          `UPDATE ghost_seat_recommendations SET state = 'RECLAIM_DECIDED' WHERE id = $1 AND state = 'AWAITING_DECISION'`,
          [g4],
        );
      }

      return lock(tx, id);
    });

    const run = await w.runRules();

    expect(run?.failedCount).toBe(0);
    expect(await w.g2Of(employeeId)).toEqual([]);
    const [row] = await w.ghostRows('id = $1', [g4]);
    expect(row).toMatchObject({ state: 'RECLAIM_DECIDED', superseded_by_id: null });
    expect(row.holder_left_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('US-10-01 AC-6, US-10-02 AC-11: a seat made 5 days ago and the seat of a head who left both get a G2 (gate 4 does not apply)', async () => {
    const recent = await leaverOn(k2, 'E-G2-A3', w.inDays(-5));
    const head = await leaverOn(k2, 'E-G2-H1');

    await w.runRules();

    expect(await w.g2Of(recent.employeeId)).toHaveLength(1);
    expect(await w.g2Of(head.employeeId)).toHaveLength(1);
  });

  it('US-10-01 AC-4, gate 8: the same period is not run twice; the next day the open G2 is left out and no second one is made', async () => {
    const { employeeId } = await leaverOn(k2, 'E-G2-A4');
    const day = w.nextDay();
    const first = await w.runRules(day);
    expect(first?.createdCount).toBeGreaterThanOrEqual(1);
    expect(await w.runRules(day)).toBeNull();

    const next = await w.runRules();

    expect(await w.g2Of(employeeId)).toHaveLength(1);
    const [g2] = await w.g2Of(employeeId);
    expect(await w.skipsOf(next?.id ?? '')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ gate: 'OPEN_RECOMMENDATION', detail: { recommendationId: g2.id } }),
      ]),
    );
  });

  it('US-10-01 AC-10, SoD-6: a G2 open for days opens no revocation by itself', async () => {
    const { employeeId, assignmentId } = await leaverOn(k2, 'E-G2-A5');

    await w.runRules();
    await w.runRules();
    await w.runRules();

    expect((await w.g2Of(employeeId))[0]).toMatchObject({ state: 'OPEN' });
    expect(await w.revocationTasksOf(assignmentId)).toEqual([]);
  });

  it('QĐ-108i, Q-82: an undecided G4 and a paused recommendation on the seat of a person who left are closed SUPERSEDED by the G2', async () => {
    const withG4 = await leaverOn(k2, 'E-G2-S1');
    const withPaused = await leaverOn(k2, 'E-G2-S2');
    const g4 = await w.seedRecommendation({
      group: 'G4',
      state: 'OPEN',
      tier: 'ACTION',
      assignmentId: withG4.assignmentId,
    });
    const paused = await w.seedRecommendation({
      group: 'G3',
      state: 'PAUSED',
      tier: 'REVIEW',
      assignmentId: withPaused.assignmentId,
    });

    const run = await w.runRules();

    expect(run?.failedCount).toBe(0);
    for (const [old, holder] of [
      [g4, withG4],
      [paused, withPaused],
    ] as const) {
      const [g2] = await w.g2Of(holder.employeeId);
      expect(g2).toMatchObject({ state: 'OPEN', tier: 'ACTION' });
      const [closed] = await w.ghostRows('id = $1', [old]);
      expect(closed).toMatchObject({ state: 'CLOSED', close_reason: 'SUPERSEDED', superseded_by_id: g2.id });
      expect((await w.auditOf('GHOST_SEAT_RECOMMENDATION', old)).map((event) => event.action)).toContain(
        'GHOST_SEAT.SUPERSEDED',
      );
    }
  });

  it('DA6-04: a G4 whose reclaim a head decided makes no G2 and no 23505; the day the holder left is marked once', async () => {
    const { employeeId, assignmentId } = await leaverOn(k2, 'E-G2-D1');
    const g4 = await w.seedRecommendation({ group: 'G4', state: 'RECLAIM_DECIDED', tier: 'ACTION', assignmentId });

    const first = await w.runRules();
    const [marked] = await w.ghostRows('id = $1', [g4]);
    const second = await w.runRules();
    const [again] = await w.ghostRows('id = $1', [g4]);

    expect(first?.failedCount).toBe(0);
    expect(second?.failedCount).toBe(0);
    expect(await w.g2Of(employeeId)).toEqual([]);
    expect(marked.holder_left_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(again.holder_left_on).toBe(marked.holder_left_on);
    expect(
      (await w.auditOf('GHOST_SEAT_RECOMMENDATION', g4)).filter(
        (event) => event.action === 'GHOST_SEAT.HOLDER_LEFT_MARKED',
      ),
    ).toHaveLength(1);
  });

  it('US-07-05 AC-12 (DA6-03): a person who left with a DEPARTURE task under way has a G2 that is decided and holds it, told to nobody', async () => {
    const { employeeId, assignmentId } = await leaverOn(k2, 'E-G2-T1');
    const { taskId } = await w.open(assignmentId, 'DEPARTURE');

    await w.runRules();

    const [g2] = await w.g2Of(employeeId);
    expect(g2).toMatchObject({ state: 'RECLAIM_DECIDED', revocation_task_id: taskId });
    expect(
      (await w.noticesOf('GHOST_SEAT_G2_DETECTED')).filter((notice) => notice.event_key === `GHOST_SEAT_G2:${g2.id}`),
    ).toEqual([]);
  });

  it('US-07-05 AC-12: an open G2 learns of a task opened after it; the completed task ends it SEAT_ENDED (it carries another reason than this recommendation)', async () => {
    const { employeeId, assignmentId } = await leaverOn(k2, 'E-G2-T3');
    await w.runRules();
    const [g2] = await w.g2Of(employeeId);
    expect(g2).toMatchObject({ state: 'OPEN', revocation_task_id: null });
    const { taskId } = await w.open(assignmentId, 'ABRUPT_DEPARTURE');

    await w.runRules();
    expect((await w.ghostRows('id = $1', [g2.id]))[0]).toMatchObject({
      state: 'RECLAIM_DECIDED',
      revocation_task_id: taskId,
    });

    await w.claim(taskId).expect(200);
    expect((await w.ghostRows('id = $1', [g2.id]))[0]).toMatchObject({ state: 'RECLAIM_DECIDED' });
    await w.revoked(taskId, { completion: 'ACCOUNT_REMOVED', evidence: 'đã gỡ' }).expect(200);

    expect((await w.ghostRows('id = $1', [g2.id]))[0]).toMatchObject({ state: 'CLOSED', close_reason: 'SEAT_ENDED' });
  });

  it('US-07-05 AC-15, DA6-02: a claim of the task changes nothing; a task closed as failed puts the G2 back to open', async () => {
    const { employeeId, assignmentId } = await leaverOn(k2, 'E-G2-T2');
    const { taskId } = await w.open(assignmentId, 'ABRUPT_DEPARTURE');
    await w.runRules();
    const [g2] = await w.g2Of(employeeId);

    await w.claim(taskId).expect(200);
    expect((await w.ghostRows('id = $1', [g2.id]))[0]).toMatchObject({
      state: 'RECLAIM_DECIDED',
      revocation_task_id: taskId,
    });

    await w.fail(taskId, { reason: 'không gỡ được' }).expect(200);
    await w.closeFailed(taskId, { reason: 'để xử lý sau' }).expect(200);

    expect((await w.ghostRows('id = $1', [g2.id]))[0]).toMatchObject({ state: 'OPEN', revocation_task_id: null });
  });

  it('US-10-01 AC-20, DA6-27: a K1 seat whose renewal was cancelled and whose access runs on to a day makes one decided G2 with that day, none twice, and closes after it', async () => {
    const k1 = await w.worldSubscription(5, 'K1');
    const { employeeId, assignmentId } = await leaverOn(k1, 'E-G2-K1');
    const { taskId } = await w.open(assignmentId, 'ABRUPT_DEPARTURE');
    await w.claim(taskId).expect(200);
    const until = w.inDays(36);
    await w
      .revoked(taskId, {
        completion: 'RENEWAL_CANCELLED',
        evidence: 'đã hủy gia hạn',
        paidThroughOn: until,
        accessState: 'UNTIL_PAID_END',
      })
      .expect(200);

    await w.runRules();
    await w.runRules();

    const rows = await w.g2Of(employeeId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      state: 'RECLAIM_DECIDED',
      revocation_task_id: null,
      evidence: { group: 'G2', terminatingAccess: { until } },
    });
    expect(await w.revocationTasksOf(assignmentId)).toEqual([{ id: taskId, status: 'COMPLETED' }]);

    await w.runRules(w.dayOf(40));

    expect((await w.g2Of(employeeId))[0]).toMatchObject({ state: 'CLOSED', close_reason: 'SEAT_ENDED' });
  });

  it('AC-8 (internal software): the seat of a person who left on a K5 plan makes no G2 and is left out as INTERNAL_SOFTWARE', async () => {
    const { employeeId, assignmentId } = await w.internalSeat('E-G2-K5');
    await w.leave(employeeId);

    const run = await w.runRules();

    expect(await w.g2Of(employeeId)).toEqual([]);
    expect(await w.skipsOf(run?.id ?? '', assignmentId)).toEqual([
      {
        subject_type: 'ASSIGNMENT',
        subject_id: assignmentId,
        gate: 'INTERNAL_SOFTWARE',
        detail: { provisioningType: 'K5' },
      },
    ]);
  });

  it('DA6-38: a paused recommendation whose seat chain holds no seat any more is left to its own item; an open one is closed SEAT_ENDED', async () => {
    const paused = await leaverOn(k2, 'E-G2-P1');
    const open = await leaverOn(k2, 'E-G2-P2');
    const pausedRecommendation = await w.seedRecommendation({
      group: 'G3',
      state: 'PAUSED',
      tier: 'REVIEW',
      assignmentId: paused.assignmentId,
    });
    const openRecommendation = await w.seedRecommendation({
      group: 'G3',
      state: 'OPEN',
      tier: 'REVIEW',
      assignmentId: open.assignmentId,
    });
    for (const seat of [paused, open]) {
      const { taskId } = await w.open(seat.assignmentId, 'ABRUPT_DEPARTURE');
      await w.claim(taskId).expect(200);
      await w.revoked(taskId, { completion: 'ACCOUNT_REMOVED', evidence: 'x' }).expect(200);
    }

    await w.runRules();

    expect((await w.ghostRows('id = $1', [pausedRecommendation]))[0]).toMatchObject({ state: 'PAUSED' });
    expect((await w.ghostRows('id = $1', [openRecommendation]))[0]).toMatchObject({
      state: 'CLOSED',
      close_reason: 'SEAT_ENDED',
    });
  });

  it('DA6-23: a listener that finds the recommendation locked does not wait; the next run settles it from the status of the task (ACCEPTED when the task carries its reason)', async () => {
    const { employeeId, assignmentId } = await leaverOn(k2, 'E-G2-L1');
    await w.runRules();
    const [g2] = await w.g2Of(employeeId);
    const { taskId } = await w.open(assignmentId, 'ABRUPT_DEPARTURE', {
      decision: { decidedRole: 'IT_ADMIN_G2', referenceKind: 'GHOST_SEAT_RECOMMENDATION', referenceId: g2.id },
    });
    await w.ctx.sql.query(
      `UPDATE ghost_seat_recommendations SET state = 'RECLAIM_DECIDED', revocation_task_id = $2 WHERE id = $1`,
      [g2.id, taskId],
    );
    await w.claim(taskId).expect(200);

    await w.ctx.sql.query('BEGIN');
    try {
      await w.ctx.sql.query(`SELECT id FROM ghost_seat_recommendations WHERE id = $1 FOR UPDATE`, [g2.id]);
      // A listener that waited for the lock the test holds would never return: the call itself is the proof that it did not wait.
      await w.revoked(taskId, { completion: 'ACCOUNT_REMOVED', evidence: 'x' }).expect(200);
      await w.ctx.sql.query('COMMIT');
    } catch (error) {
      await w.ctx.sql.query('ROLLBACK');
      throw error;
    }
    expect((await w.ghostRows('id = $1', [g2.id]))[0]).toMatchObject({ state: 'RECLAIM_DECIDED' });

    await w.runRules();

    expect((await w.ghostRows('id = $1', [g2.id]))[0]).toMatchObject({ state: 'CLOSED', close_reason: 'ACCEPTED' });
  });
});
