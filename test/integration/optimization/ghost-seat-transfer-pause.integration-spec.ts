import { decisionDueOn } from '../../../src/modules/optimization/decision/decision-routing.policy';
import { OrganizationReadApi } from '../../../src/modules/organization/public/organization-read.api';
import { GhostSeatWorld } from '../../support/ghost-seat-world';

const w = new GhostSeatWorld();

const todayOf = (day: Date) => w.ctx.app.get(OrganizationReadApi).businessToday(day);

describe('a transfer pauses and resumes the recommendation of its holder (integration, real PostgreSQL)', () => {
  let h1: { departmentId: string; headEmployeeId: string };
  let h2: { departmentId: string; headEmployeeId: string };

  beforeAll(async () => {
    await w.startWorld();
    h1 = await w.headedDepartment('P-TP-OLD');
    h2 = await w.headedDepartment('P-TP-NEW');
  }, 240000);

  afterAll(async () => {
    await w.stop();
  });

  it('US-10-06 AC-15, QĐ-90c: a holder in a transfer that has taken effect pauses what is awaiting the old head and what is open; nothing goes to the new head', async () => {
    const e1 = await w.seatIn('E-TP-1', h2.departmentId);
    const e2 = await w.seatIn('E-TP-2', h2.departmentId);
    const awaiting = await w.seedRecommendation({
      group: 'G4',
      state: 'AWAITING_DECISION',
      tier: 'REVIEW',
      assignmentId: e1.assignmentId,
      deciderDepartmentId: h1.departmentId,
      decisionDueOn: '2030-01-01',
    });
    const open = await w.seedRecommendation({
      group: 'G3',
      state: 'OPEN',
      tier: 'ACTION',
      assignmentId: e2.assignmentId,
    });
    const transfer1 = await w.transferOf(e1.employeeId, h1.departmentId, h2.departmentId, '2026-10-12');
    const transfer2 = await w.transferOf(e2.employeeId, h1.departmentId, h2.departmentId, '2026-10-12');

    const tally = await w.followUp();

    expect(tally).toMatchObject({ paused: 2, routed: 0 });
    expect((await w.ghostRows('id = $1', [awaiting]))[0]).toMatchObject({
      state: 'PAUSED',
      pause_transfer_id: transfer1,
    });
    expect((await w.ghostRows('id = $1', [open]))[0]).toMatchObject({ state: 'PAUSED', pause_transfer_id: transfer2 });
    expect((await w.ghostRows('id = $1', [awaiting]))[0].paused_at).not.toBeNull();
    expect(await w.noticesOf('GHOST_SEAT_NEW', h2.headEmployeeId)).toHaveLength(0);
    expect(await w.auditOf('GHOST_SEAT_RECOMMENDATION', awaiting)).toEqual(
      expect.arrayContaining([expect.objectContaining({ action: 'GHOST_SEAT.PAUSED' })]),
    );
  });

  it('Q-89: a reclaim the head already decided is not paused by a transfer: the task goes on', async () => {
    const e1 = await w.seatIn('E-TP-Q89', h2.departmentId);
    const decided = await w.seedRecommendation({
      group: 'G4',
      state: 'RECLAIM_DECIDED',
      tier: 'ACTION',
      assignmentId: e1.assignmentId,
      deciderDepartmentId: h1.departmentId,
    });
    await w.transferOf(e1.employeeId, h1.departmentId, h2.departmentId, '2026-10-12');

    await w.followUp();

    expect((await w.ghostRows('id = $1', [decided]))[0]).toMatchObject({ state: 'RECLAIM_DECIDED', paused_at: null });
  });

  it('US-10-06 AC-16, Q-87: the transfer over and the seat still open: the review tier goes to the head of the department the holder is in now with a due day counted from the day it enters the queue; audit H1 to H2', async () => {
    const e1 = await w.seatIn('E-TP-3', h2.departmentId);
    const transfer = await w.transferOf(e1.employeeId, h1.departmentId, h2.departmentId, '2026-10-12');
    const paused = await w.seedRecommendation({
      group: 'G4',
      state: 'PAUSED',
      tier: 'REVIEW',
      assignmentId: e1.assignmentId,
      deciderDepartmentId: h1.departmentId,
      pausedAt: new Date(),
      pauseTransferId: transfer,
    });
    await w.followUp();
    expect((await w.ghostRows('id = $1', [paused]))[0].state).toBe('PAUSED');
    await w.closeTransfer(transfer);
    const day = w.nextDay();

    await w.followUp(day);

    const [row] = await w.ghostRows('id = $1', [paused]);
    expect(row).toMatchObject({
      state: 'AWAITING_DECISION',
      decider_department_id: h2.departmentId,
      paused_at: null,
      pause_transfer_id: null,
      decision_due_on: decisionDueOn(await todayOf(day), 5, new Set()),
    });
    const resumed = (await w.auditOf('GHOST_SEAT_RECOMMENDATION', paused)).find(
      (event) => event.action === 'GHOST_SEAT.RESUMED',
    );
    expect(resumed?.after).toMatchObject({ fromDepartmentId: h1.departmentId, toDepartmentId: h2.departmentId });
    expect(await w.noticesOf('GHOST_SEAT_NEW', h2.headEmployeeId)).toHaveLength(1);
  });

  it('M5-09, FR-3.10, US-10-06 AC-14: a recommendation already told overdue before its pause is new to the queue it enters again: the overdue mark is cleared', async () => {
    const e1 = await w.seatIn('E-TP-M509', h2.departmentId);
    const transfer = await w.transferOf(e1.employeeId, h1.departmentId, h2.departmentId, '2026-10-12');
    const paused = await w.seedRecommendation({
      group: 'G4',
      state: 'PAUSED',
      tier: 'REVIEW',
      assignmentId: e1.assignmentId,
      deciderDepartmentId: h1.departmentId,
      decisionDueOn: '2026-01-01',
      pausedAt: new Date(),
      pauseTransferId: transfer,
    });
    await w.ctx.sql.query(`UPDATE ghost_seat_recommendations SET overdue_noticed_at = now() WHERE id = $1`, [paused]);
    await w.closeTransfer(transfer);

    await w.followUp(w.nextDay());

    const [row] = await w.ghostRows('id = $1', [paused]);
    expect(row).toMatchObject({ state: 'AWAITING_DECISION', decider_department_id: h2.departmentId });
    expect(row.overdue_noticed_at).toBeNull();
  });

  it('DA6-20: a MONITOR recommendation whose transfer ended goes back to open, never to a head', async () => {
    const e1 = await w.seatIn('E-TP-4', h2.departmentId);
    const transfer = await w.transferOf(e1.employeeId, h1.departmentId, h2.departmentId, '2026-10-12');
    const monitor = await w.seedRecommendation({
      group: 'G4',
      state: 'PAUSED',
      tier: 'MONITOR',
      assignmentId: e1.assignmentId,
      pausedAt: new Date(),
      pauseTransferId: transfer,
    });
    await w.closeTransfer(transfer);

    await w.followUp();

    expect((await w.ghostRows('id = $1', [monitor]))[0]).toMatchObject({
      state: 'OPEN',
      routed_at: null,
      paused_at: null,
      pause_transfer_id: null,
    });
  });

  it('US-10-06 AC-15 (end): the old right was revoked ⟹ TRANSFER_SEAT_REVOKED; the transfer cancelled ⟹ back to the queue of the old head with a new due day', async () => {
    const gone = await w.seatIn('E-TP-5', h2.departmentId);
    const goneTransfer = await w.transferOf(gone.employeeId, h1.departmentId, h2.departmentId, '2026-10-12');
    const revoked = await w.seedRecommendation({
      group: 'G4',
      state: 'PAUSED',
      tier: 'ACTION',
      assignmentId: gone.assignmentId,
      pausedAt: new Date(),
      pauseTransferId: goneTransfer,
    });
    await w.ctx.sql.query(`UPDATE license_assignments SET valid_until = '2026-06-01' WHERE id = $1`, [
      gone.assignmentId,
    ]);
    await w.closeTransfer(goneTransfer);

    const stays = await w.seatIn('E-TP-6', h1.departmentId);
    const cancelled = await w.transferOf(stays.employeeId, h1.departmentId, h2.departmentId, '2026-10-12', 'CANCELLED');
    const back = await w.seedRecommendation({
      group: 'G3',
      state: 'PAUSED',
      tier: 'ACTION',
      assignmentId: stays.assignmentId,
      deciderDepartmentId: h1.departmentId,
      pausedAt: new Date(),
      pauseTransferId: cancelled,
    });
    const day = w.nextDay();

    await w.followUp(day);

    expect((await w.ghostRows('id = $1', [revoked]))[0]).toMatchObject({
      state: 'CLOSED',
      close_reason: 'TRANSFER_SEAT_REVOKED',
    });
    expect((await w.ghostRows('id = $1', [back]))[0]).toMatchObject({
      state: 'AWAITING_DECISION',
      decider_department_id: h1.departmentId,
      decision_due_on: decisionDueOn(await todayOf(day), 5, new Set()),
    });
  });
});
