import request from 'supertest';
import { addDays } from '../../../src/core/business-date';
import type { ApiAccount } from '../../support/api-accounts';
import { GhostSeatWorld } from '../../support/ghost-seat-world';

const w = new GhostSeatWorld();
/** `w.it1` (the IT Admin of the harness) answers for P1; a second IT Admin answers for P2; P3 names none. */
let other = { employeeId: '', account: undefined as unknown as ApiAccount };

const get = (account: ApiAccount, path: string) => request(w.server()).get(path).set(w.as(account));
const decide = (account: ApiAccount, recommendationId: string) =>
  request(w.server())
    .post('/api/v1/ghost-seat-decisions')
    .set(w.as(account))
    .send(
      w.checklists.withYes('5.4', {
        items: [{ recommendationId }],
        choice: 'EXEMPT',
        reason: 'Hợp đồng dự án',
        exemptUntil: addDays(w.today(), 60),
      }),
    );
const exemptedBy = async (account: ApiAccount): Promise<string[]> =>
  (
    (await get(account, '/api/v1/ghost-seat-exemptions').expect(200)).body as {
      data: { items: { recommendationId: string }[] };
    }
  ).data.items.map((item) => item.recommendationId);

/** A department with a head, a holder and a G4 recommendation waiting for the head, about a seat of that department (or of none). */
const waiting = async (tag: string, itAdminEmployeeId: string | null, departmentOfSeat: 'OWN' | 'NONE' = 'OWN') => {
  const dept = await w.headedDepartment(`P-${tag}`, itAdminEmployeeId);
  const seat = await w.seatIn(`E-${tag}`, dept.departmentId);
  const rec = await w.seedRecommendation({
    group: 'G4',
    state: 'AWAITING_DECISION',
    tier: 'REVIEW',
    assignmentId: seat.assignmentId,
    deciderDepartmentId: dept.departmentId,
    decisionDueOn: addDays(w.today(), 5),
  });
  await w.ctx.sql.query(`UPDATE ghost_seat_recommendations SET department_id = $2 WHERE id = $1`, [
    rec,
    departmentOfSeat === 'OWN' ? dept.departmentId : null,
  ]);

  return { dept, rec };
};

describe('QĐ-111ax: what an IT Admin reads of the wasted seats is the departments in charge (integration, real PostgreSQL)', () => {
  beforeAll(async () => {
    await w.startWorld();
    const employeeId = await w.person('E-SCOPE-IT2');
    other = { employeeId, account: await w.account('E-SCOPE-IT2', employeeId, 'IT_ADMIN') };
  }, 240000);

  afterAll(async () => {
    jest.restoreAllMocks();
    await w.stop();
  });

  it('an IT Admin reads the recommendation of a department they answer for, of one with no IT Admin and one with no department; one of another IT Admin is 404, and a head reads as before', async () => {
    const p1 = await waiting('IS1', w.it1.employeeId);
    const p2 = await waiting('IS2', other.employeeId);
    const p3 = await waiting('IS3', null);
    const none = await waiting('IS0', other.employeeId, 'NONE');
    const path = (id: string) => `/api/v1/ghost-seat-recommendations/${id}`;

    for (const rec of [p1.rec, p3.rec, none.rec]) await get(w.it1, path(rec)).expect(200);
    const refused = await get(w.it1, path(p2.rec)).expect(404);
    expect(w.codeOf(refused)).toBe('GHOST_SEAT.NOT_FOUND');
    for (const rec of [p2.rec, p3.rec, none.rec]) await get(other.account, path(rec)).expect(200);
    expect(w.codeOf(await get(other.account, path(p1.rec)).expect(404))).toBe('GHOST_SEAT.NOT_FOUND');
    await get(p2.dept.head, path(p2.rec)).expect(200);
    expect(w.codeOf(await get(p2.dept.head, path(p1.rec)).expect(403))).toBe('GHOST_SEAT.NOT_DECIDER');
  });

  it('the exemptions an IT Admin reads are the ones of the seats of their departments, of a department with no IT Admin and of no department; a head reads only their department', async () => {
    const p1 = await waiting('IX1', w.it1.employeeId);
    const p2 = await waiting('IX2', other.employeeId);
    const p3 = await waiting('IX3', null);
    const none = await waiting('IX0', other.employeeId, 'NONE');
    for (const one of [p1, p2, p3, none]) await decide(one.dept.head, one.rec).expect(201);

    const seenByIt1 = await exemptedBy(w.it1);
    expect(seenByIt1).toEqual(expect.arrayContaining([p1.rec, p3.rec, none.rec]));
    expect(seenByIt1).not.toContain(p2.rec);
    const seenByIt2 = await exemptedBy(other.account);
    expect(seenByIt2).toEqual(expect.arrayContaining([p2.rec, p3.rec, none.rec]));
    expect(seenByIt2).not.toContain(p1.rec);
    expect(await exemptedBy(p1.dept.head)).toEqual([p1.rec]);
    expect(await exemptedBy(p2.dept.head)).toEqual([p2.rec]);
  });
});
