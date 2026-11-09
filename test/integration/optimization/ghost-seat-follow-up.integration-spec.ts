import request from 'supertest';
import { addDays } from '../../../src/core/business-date';
import { isWeekend } from '../../../src/core/working-days';
import { OrganizationReadApi } from '../../../src/modules/organization/public/organization-read.api';
import type { ApiAccount } from '../../support/api-accounts';
import { GhostSeatWorld } from '../../support/ghost-seat-world';

const w = new GhostSeatWorld();

const dataOf = <T>(response: request.Response): T => (response.body as { data: T }).data;

const get = (account: ApiAccount | string, path: string) =>
  request(w.server())
    .get(path)
    .set(typeof account === 'string' ? { Authorization: `Bearer ${account}` } : w.as(account));
const decide = (account: ApiAccount, recommendationId: string, choice: string, extra: object = {}) =>
  request(w.server())
    .post('/api/v1/ghost-seat-decisions')
    .set(w.as(account))
    .send({ items: [{ recommendationId }], choice, reason: 'Lý do', ...extra });

/** An instant `offset` days from today (at noon of the calendar) that is, or is not, on a weekend. */
const dayWhere = async (weekend: boolean, from = 1): Promise<Date> => {
  const reads = w.ctx.app.get(OrganizationReadApi);
  for (let offset = from; offset < from + 14; offset += 1) {
    const instant = w.dayOf(offset);
    if (isWeekend(await reads.businessToday(instant)) === weekend) return instant;
  }
  throw new Error('no such day');
};

const waiting = async (tag: string, dueOn: string) => {
  const dept = await w.headedDepartment(`P-${tag}`);
  const seat = await w.seatIn(`E-${tag}`, dept.departmentId);
  const rec = await w.seedRecommendation({
    group: 'G4',
    state: 'AWAITING_DECISION',
    tier: 'REVIEW',
    assignmentId: seat.assignmentId,
    deciderDepartmentId: dept.departmentId,
    decisionDueOn: dueOn,
  });

  return { dept, seat, rec };
};

describe('the overdue notice, the exemptions running out and the reports of the queue (integration, real PostgreSQL)', () => {
  beforeAll(async () => {
    await w.startWorld();
  }, 240000);

  afterAll(async () => {
    await w.stop();
  });

  it('US-10-06 AC-14, Q-90: past the due day the head and the IT Admin in charge are told once on a working day; nothing is decided for the head; a weekend tells nobody; a decision after the due day is saved', async () => {
    const late = await waiting('FU1', '2026-11-02');
    const weekendRec = await waiting('FU1W', '2026-11-02');

    const sunday = await dayWhere(true);
    expect((await w.followUp(sunday))?.overdueNoticed).toBe(0);
    expect(await w.noticesOf('GHOST_SEAT_DECISION_OVERDUE', weekendRec.dept.headEmployeeId)).toHaveLength(0);

    const weekday = await dayWhere(false, 1);
    const tally = await w.followUp(weekday);

    expect(tally?.overdueNoticed).toBeGreaterThanOrEqual(2);
    expect(await w.noticesOf('GHOST_SEAT_DECISION_OVERDUE', late.dept.headEmployeeId)).toHaveLength(1);
    const itNotices = (await w.noticesOf('GHOST_SEAT_DECISION_OVERDUE', w.worldItAdmin.employeeId)).filter(
      (notice) => notice.params.recommendationId === late.rec,
    );
    expect(itNotices).toHaveLength(1);
    const [row] = await w.ghostRows('id = $1', [late.rec]);
    expect(row.state).toBe('AWAITING_DECISION');
    expect(row.overdue_noticed_at).not.toBeNull();

    await w.followUp(await dayWhere(false, 8));
    expect(await w.noticesOf('GHOST_SEAT_DECISION_OVERDUE', late.dept.headEmployeeId)).toHaveLength(1);
    await decide(late.dept.head, late.rec, 'KEEP').expect(201);
    expect((await w.ghostRows('id = $1', [late.rec]))[0]).toMatchObject({ state: 'CLOSED', close_reason: 'KEPT' });
  });

  it('US-10-08 AC-1, AC-6, AC-7: an exemption ending within a week is told once to the head of the department the holder is in now; an exemption that is over is marked ended and tells nobody', async () => {
    const a = await w.headedDepartment('P-FU2A');
    const b = await w.headedDepartment('P-FU2B');
    // The holder moved from A to B after A's head was asked: the exemption is told to B's head.
    const seat = await w.seatIn('E-FU2', b.departmentId);
    const rec = await w.seedRecommendation({
      group: 'G4',
      state: 'AWAITING_DECISION',
      tier: 'REVIEW',
      assignmentId: seat.assignmentId,
      deciderDepartmentId: a.departmentId,
      decisionDueOn: addDays(w.today(), 5),
    });
    await decide(a.head, rec, 'EXEMPT', { exemptUntil: addDays(w.today(), 3) }).expect(201);

    await w.followUp(w.dayOf(1));
    await w.followUp(w.dayOf(2));

    expect(await w.noticesOf('GHOST_SEAT_EXEMPTION_ENDING', b.headEmployeeId)).toHaveLength(1);
    expect(await w.noticesOf('GHOST_SEAT_EXEMPTION_ENDING', a.headEmployeeId)).toHaveLength(0);
    const { rows } = await w.ctx.sql.query<{ reminded_at: Date | null; ended_at: Date | null }>(
      `SELECT reminded_at, ended_at FROM ghost_seat_exemptions WHERE recommendation_id = $1`,
      [rec],
    );
    expect(rows[0].reminded_at).not.toBeNull();
    expect(rows[0].ended_at).toBeNull();

    await w.followUp(w.dayOf(10));
    const ended = await w.ctx.sql.query<{ ended_at: Date | null }>(
      `SELECT ended_at FROM ghost_seat_exemptions WHERE recommendation_id = $1`,
      [rec],
    );
    expect(ended.rows[0].ended_at).not.toBeNull();
    expect(await w.noticesOf('GHOST_SEAT_EXEMPTION_ENDING', b.headEmployeeId)).toHaveLength(1);
  });

  it('US-10-03 AC-13, US-10-08 AC-1: the Super Admin reads the decisions and the ones a head made on their own seat; a head reads the exemptions of their department, an IT Admin all of them, nobody else', async () => {
    const dept = await w.headedDepartment('P-FU3');
    const other = await w.headedDepartment('P-FU3-OTHER');
    const ownSeat = await w.seatOf(dept.headEmployeeId, await w.worldSubscription(3, 'K2'));
    const own = await w.seedRecommendation({
      group: 'G4',
      state: 'AWAITING_DECISION',
      tier: 'ACTION',
      assignmentId: ownSeat,
      deciderDepartmentId: dept.departmentId,
      decisionDueOn: addDays(w.today(), 5),
    });
    const { rec: theirs } = await waiting('FU3B', addDays(w.today(), 5));
    await decide(dept.head, own, 'EXEMPT', { exemptUntil: addDays(w.today(), 60) }).expect(201);
    const second = await waiting('FU3C', addDays(w.today(), 5));
    await decide(second.dept.head, second.rec, 'KEEP').expect(201);
    expect(theirs).not.toBe(own);

    type Decisions = { items: { selfDecided: boolean; recommendationId: string }[] };
    const all = dataOf<Decisions>(await get(w.admin, '/api/v1/ghost-seat-decisions').expect(200));
    const mine = dataOf<Decisions>(await get(w.admin, '/api/v1/ghost-seat-decisions?selfDecided=true').expect(200));

    expect(all.items.length).toBeGreaterThanOrEqual(2);
    expect(mine.items.map((item) => item.recommendationId)).toEqual([own]);
    expect(mine.items.every((item) => item.selfDecided)).toBe(true);
    await get(dept.head, '/api/v1/ghost-seat-decisions').expect(403);
    await get(w.worldItAdmin.account, '/api/v1/ghost-seat-decisions').expect(403);

    type Exemptions = { items: { recommendationId: string }[] };
    const own1 = dataOf<Exemptions>(await get(dept.head, '/api/v1/ghost-seat-exemptions').expect(200));
    expect(own1.items.map((item) => item.recommendationId)).toEqual([own]);
    expect(dataOf<Exemptions>(await get(other.head, '/api/v1/ghost-seat-exemptions').expect(200)).items).toHaveLength(
      0,
    );
    const itView = dataOf<Exemptions>(await get(w.worldItAdmin.account, '/api/v1/ghost-seat-exemptions').expect(200));
    expect(itView.items.map((item) => item.recommendationId)).toContain(own);
    await get(w.admin, '/api/v1/ghost-seat-exemptions').expect(403);
  });

  it('dashboard: the head sees the ghost seats of their department as counted = awaiting + returned (3 + 1), not the ones paused or waiting for a head', async () => {
    const dept = await w.headedDepartment('P-FU4');
    const make = async (
      code: string,
      state: 'AWAITING_DECISION' | 'RETURNED_TO_HEAD' | 'PAUSED' | 'WAITING_FOR_HEAD',
    ) =>
      w.seedRecommendation({
        group: 'G4',
        state,
        tier: 'REVIEW',
        assignmentId: (await w.seatIn(`E-FU4-${code}`, dept.departmentId)).assignmentId,
        deciderDepartmentId: dept.departmentId,
        decisionDueOn: addDays(w.today(), 5),
        ...(state === 'PAUSED'
          ? { pausedAt: new Date(), pauseTransferId: '00000000-0000-4000-8000-000000000001' }
          : {}),
        ...(state === 'RETURNED_TO_HEAD' ? { returnCount: 1 } : {}),
      });
    await make('A', 'AWAITING_DECISION');
    await make('B', 'AWAITING_DECISION');
    await make('C', 'AWAITING_DECISION');
    await make('D', 'RETURNED_TO_HEAD');
    await make('E', 'PAUSED');
    await make('F', 'WAITING_FOR_HEAD');

    const overview = dataOf<{ sections: { ghostSeats: object } }>(
      await get(dept.head, '/api/v1/dashboards/manager').expect(200),
    );

    expect(overview.sections.ghostSeats).toEqual({
      state: 'COUNTED',
      count: 4,
      sourceOperationId: 'ghostSeatQueueList',
      reason: null,
    });
  });
});
