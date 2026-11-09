import request from 'supertest';
import { addDays } from '../../../src/core/business-date';
import { addMonths } from '../../../src/core/fiscal-year';
import { pretendBusinessToday } from '../../support/pretend-today';
import type { ApiAccount } from '../../support/api-accounts';
import { GhostSeatWorld } from '../../support/ghost-seat-world';

const w = new GhostSeatWorld();

interface Wire {
  data: Record<string, unknown> & { items?: Record<string, unknown>[] };
  error?: { details?: { items?: { recommendationId: string; code: string }[] } };
}
const body = (response: request.Response) => response.body as Wire;
const dataOf = <T>(response: request.Response): T => (response.body as { data: T }).data;

const decide = (account: ApiAccount, payload: object) =>
  request(w.server()).post('/api/v1/ghost-seat-decisions').set(w.as(account)).send(payload);
const read = (account: ApiAccount, id: string) =>
  request(w.server()).get(`/api/v1/ghost-seat-recommendations/${id}`).set(w.as(account));
const queue = (account: ApiAccount) => request(w.server()).get('/api/v1/ghost-seat-queue').set(w.as(account));

/** A department with a head, a holder of a seat in it and a G4 recommendation waiting for the head. */
const waiting = async (
  tag: string,
  extra: { tier?: 'REVIEW' | 'ACTION'; group?: 'G3' | 'G4'; dueDays?: number } = {},
) => {
  const dept = await w.headedDepartment(`P-${tag}`);
  const seat = await w.seatIn(`E-${tag}`, dept.departmentId);
  const rec = await w.seedRecommendation({
    group: extra.group ?? 'G4',
    state: 'AWAITING_DECISION',
    tier: extra.tier ?? 'REVIEW',
    assignmentId: seat.assignmentId,
    deciderDepartmentId: dept.departmentId,
    decisionDueOn: addDays(w.today(), extra.dueDays ?? 5),
  });

  return { dept, seat, rec };
};

const decisionRows = async (recommendationId: string) =>
  (
    await w.ctx.sql.query<{
      choice: string;
      reason: string;
      self_decided: boolean;
      batch_id: string | null;
      exempt_until: string | null;
      decided_by_employee_id: string;
    }>(
      `SELECT choice, reason, self_decided, batch_id, to_char(exempt_until, 'YYYY-MM-DD') AS exempt_until, decided_by_employee_id
         FROM ghost_seat_decisions WHERE recommendation_id = $1 ORDER BY decided_at, id`,
      [recommendationId],
    )
  ).rows;

describe('the decision of the head on a recommendation (integration, real PostgreSQL)', () => {
  beforeAll(async () => {
    await w.startWorld();
  }, 240000);

  afterAll(async () => {
    jest.restoreAllMocks();
    await w.stop();
  });

  it('AC-2, AC-16, US-10-07 AC-18: a reclaim opens the SBF-18 task with a grace of 7 days, tells the holder once; the IT Admin is refused (409 NOT_BEFORE) before the day and completes it after, so the recommendation is ACCEPTED', async () => {
    const { dept, seat, rec } = await waiting('DC1');

    const response = await decide(dept.head, {
      items: [{ recommendationId: rec }],
      choice: 'RECLAIM',
      reason: 'Không dùng nữa',
    }).expect(201);

    const [item] = body(response).data.items ?? [];
    const notBefore = addDays(w.today(), 7);
    expect(item).toMatchObject({ recommendationId: rec, outcome: 'RECLAIM_DECIDED', notBefore, selfDecided: false });
    const taskId = String(item.revocationTaskId);
    expect((await w.ghostRows('id = $1', [rec]))[0]).toMatchObject({
      state: 'RECLAIM_DECIDED',
      revocation_task_id: taskId,
      revocation_not_before: notBefore,
    });
    expect((await w.timingOf(taskId)).not_before).toBe(notBefore);
    expect(await w.noticesOf('REVOCATION_UPCOMING', seat.employeeId)).toHaveLength(1);
    expect(await decisionRows(rec)).toEqual([
      expect.objectContaining({ choice: 'RECLAIM', reason: 'Không dùng nữa', self_decided: false, batch_id: null }),
    ]);
    expect(w.codeOf(await w.claim(taskId, w.worldItAdmin.account).expect(409))).toBe('PROVISIONING_TASK.NOT_BEFORE');

    const pretend = pretendBusinessToday(w.ctx.app, notBefore);
    await w.claim(taskId, w.worldItAdmin.account).expect(200);
    await w.revoked(taskId, { completion: 'ACCOUNT_REMOVED', evidence: 'đã gỡ' }, w.worldItAdmin.account).expect(200);
    pretend.mockRestore();

    expect((await w.ghostRows('id = $1', [rec]))[0]).toMatchObject({ state: 'CLOSED', close_reason: 'ACCEPTED' });
    const events = (await w.auditOf('GHOST_SEAT_RECOMMENDATION', rec)).map((event) => event.action);
    expect(events).toEqual(expect.arrayContaining(['GHOST_SEAT.DECIDED', 'GHOST_SEAT.CLOSED']));
  });

  it('AC-3, US-12-15 AC-9: a keep with a reason closes it KEPT and tells the holder nothing', async () => {
    const { dept, seat, rec } = await waiting('DC2');

    await decide(dept.head, {
      items: [{ recommendationId: rec }],
      choice: 'KEEP',
      reason: 'Đang dùng cho dự án',
    }).expect(201);

    expect((await w.ghostRows('id = $1', [rec]))[0]).toMatchObject({ state: 'CLOSED', close_reason: 'KEPT' });
    expect(await w.noticesOf('REVOCATION_UPCOMING', seat.employeeId)).toHaveLength(0);
    expect(await w.noticesOf('REVOCATION_CANCELLED', seat.employeeId)).toHaveLength(0);
    expect(await decisionRows(rec)).toHaveLength(1);
  });

  it('AC-4, INV-09: an exemption needs a day (422), not today, not past 12 calendar months (422); exactly 12 months is saved with the exemption row', async () => {
    const { dept, rec } = await waiting('DC3');
    const today = w.today();
    const send = (exemptUntil?: string) =>
      decide(dept.head, {
        items: [{ recommendationId: rec }],
        choice: 'EXEMPT',
        reason: 'Hợp đồng dự án',
        ...(exemptUntil ? { exemptUntil } : {}),
      });

    expect(w.codeOf(await send().expect(422))).toBe('GHOST_SEAT.EXEMPTION_REQUIRED');
    expect(w.codeOf(await send(addDays(addMonths(today, 12), 1)).expect(422))).toBe('GHOST_SEAT.EXEMPTION_TOO_LONG');
    expect(w.codeOf(await send(today).expect(422))).toBe('GHOST_SEAT.EXEMPTION_TOO_LONG');
    expect((await w.ghostRows('id = $1', [rec]))[0].state).toBe('AWAITING_DECISION');

    await send(addMonths(today, 12)).expect(201);

    expect((await w.ghostRows('id = $1', [rec]))[0]).toMatchObject({ state: 'CLOSED', close_reason: 'EXEMPTED' });
    expect((await decisionRows(rec))[0]).toMatchObject({ choice: 'EXEMPT', exempt_until: addMonths(today, 12) });
    const { rows } = await w.ctx.sql.query(`SELECT 1 FROM ghost_seat_exemptions WHERE recommendation_id = $1`, [rec]);
    expect(rows).toHaveLength(1);
  });

  it('AC-5 (Q-94): three items share a reason and a batch; an empty reason is 422; one paused item refuses all (409, details.items); a repeated id is one item, whatever the order', async () => {
    const dept = await w.headedDepartment('P-DC4');
    const recs: string[] = [];
    for (const code of ['A', 'B', 'C', 'D']) {
      const seat = await w.seatIn(`E-DC4-${code}`, dept.departmentId);
      recs.push(
        await w.seedRecommendation({
          group: 'G4',
          state: 'AWAITING_DECISION',
          tier: 'REVIEW',
          assignmentId: seat.assignmentId,
          deciderDepartmentId: dept.departmentId,
          decisionDueOn: addDays(w.today(), 5),
        }),
      );
    }
    const [a, b, c, d] = recs;
    const items = (ids: string[]) => ids.map((recommendationId) => ({ recommendationId }));

    expect(w.codeOf(await decide(dept.head, { items: items([a]), choice: 'KEEP', reason: '' }).expect(422))).toBe(
      'VALIDATION_ERROR',
    );

    await w.ctx.sql.query(
      `UPDATE ghost_seat_recommendations SET state = 'PAUSED', paused_at = now(), pause_transfer_id = gen_random_uuid() WHERE id = $1`,
      [d],
    );
    const refused = await decide(dept.head, { items: items([a, d]), choice: 'KEEP', reason: 'Vẫn cần' }).expect(409);
    expect(w.codeOf(refused)).toBe('GHOST_SEAT.PAUSED');
    expect(body(refused).error?.details?.items).toEqual([{ recommendationId: d, code: 'PAUSED' }]);
    expect((await w.ghostRows('id = $1', [a]))[0].state).toBe('AWAITING_DECISION');

    await decide(dept.head, { items: items([c, b, c, b]), choice: 'KEEP', reason: 'Vẫn cần' }).expect(201);
    const batches = [await decisionRows(b), await decisionRows(c)].flat();
    expect(batches).toHaveLength(2);
    expect(new Set(batches.map((row) => row.batch_id)).size).toBe(1);
    expect(batches[0].batch_id).not.toBeNull();
  });

  it('AC-8: another head, an IT Admin and the Super Admin cannot decide for the department; the state does not change', async () => {
    const { rec } = await waiting('DC5');
    const other = await w.headedDepartment('P-DC5-OTHER');
    const send = (account: ApiAccount) =>
      decide(account, { items: [{ recommendationId: rec }], choice: 'KEEP', reason: 'Vẫn cần' });

    expect(w.codeOf(await send(other.head).expect(403))).toBe('GHOST_SEAT.NOT_DECIDER');
    await send(w.worldItAdmin.account).expect(403);
    await request(w.server())
      .post('/api/v1/ghost-seat-decisions')
      .set({ Authorization: `Bearer ${w.admin}` })
      .send({ items: [{ recommendationId: rec }], choice: 'KEEP', reason: 'Vẫn cần' })
      .expect(403);

    expect((await w.ghostRows('id = $1', [rec]))[0].state).toBe('AWAITING_DECISION');
    expect(await decisionRows(rec)).toHaveLength(0);
    expect(w.codeOf(await read(other.head, rec).expect(403))).toBe('GHOST_SEAT.NOT_DECIDER');
  });

  it('US-10-03 AC-13: a head decides on their own seat; the reason is required and the act is marked self-decided; a decision past its due day is still saved (AC-14)', async () => {
    const dept = await w.headedDepartment('P-DC6');
    const assignmentId = await w.seatOf(dept.headEmployeeId, await w.worldSubscription(3, 'K2'));
    const rec = await w.seedRecommendation({
      group: 'G4',
      state: 'AWAITING_DECISION',
      tier: 'ACTION',
      assignmentId,
      deciderDepartmentId: dept.departmentId,
      decisionDueOn: addDays(w.today(), -3),
    });

    expect(dataOf<{ items: object[] }>(await queue(dept.head).expect(200)).items[0]).toMatchObject({
      selfSeat: true,
      overdue: true,
    });
    await decide(dept.head, { items: [{ recommendationId: rec }], choice: 'KEEP' }).expect(422);
    await decide(dept.head, {
      items: [{ recommendationId: rec }],
      choice: 'KEEP',
      reason: 'Tôi cần phần mềm này',
    }).expect(201);

    expect(await decisionRows(rec)).toEqual([
      expect.objectContaining({ self_decided: true, decided_by_employee_id: dept.headEmployeeId }),
    ]);
  });

  it('R-J06, AC-17, AC-18: a right ending within a month is left to end (no task, no decision row); one ending later or never is reclaimed; a keep at any time is a keep', async () => {
    const dept = await w.headedDepartment('P-DC7');
    const make = async (code: string, endsInDays: number | null) => {
      const seat = await w.seatIn(`E-DC7-${code}`, dept.departmentId);
      if (endsInDays !== null) {
        await w.ctx.sql.query(`UPDATE license_assignments SET expected_end_date = $2::date WHERE id = $1`, [
          seat.assignmentId,
          addDays(w.today(), endsInDays),
        ]);
      }

      return w.seedRecommendation({
        group: 'G4',
        state: 'AWAITING_DECISION',
        tier: 'REVIEW',
        assignmentId: seat.assignmentId,
        deciderDepartmentId: dept.departmentId,
        decisionDueOn: addDays(w.today(), 5),
      });
    };
    const soon = await make('SOON', 10);
    const later = await make('LATER', 60);
    const never = await make('NEVER', null);
    const kept = await make('KEEP', 10);
    const send = (id: string, choice: string) =>
      decide(dept.head, { items: [{ recommendationId: id }], choice, reason: 'Lý do' }).expect(201);

    expect(body(await send(soon, 'RECLAIM')).data.items?.[0]).toMatchObject({
      outcome: 'LEFT_TO_EXPIRE',
      revocationTaskId: null,
    });
    expect((await w.ghostRows('id = $1', [soon]))[0]).toMatchObject({
      state: 'CLOSED',
      close_reason: 'LEFT_TO_EXPIRE',
    });
    expect(await decisionRows(soon)).toHaveLength(0);
    expect(body(await send(later, 'RECLAIM')).data.items?.[0]).toMatchObject({ outcome: 'RECLAIM_DECIDED' });
    expect(body(await send(never, 'RECLAIM')).data.items?.[0]).toMatchObject({ outcome: 'RECLAIM_DECIDED' });
    await send(kept, 'KEEP');
    expect((await w.ghostRows('id = $1', [kept]))[0]).toMatchObject({ state: 'CLOSED', close_reason: 'KEPT' });
  });

  it('AC-1, AC-6: the queue shows the head only the people of their department, a person’s rows together, with no usage volume; a head reads only their own department’s recommendation', async () => {
    const dept = await w.headedDepartment('P-DC8');
    const other = await w.headedDepartment('P-DC8-OTHER');
    const e1 = await w.personIn('E-DC8-1', dept.departmentId);
    const e2 = await w.personIn('E-DC8-2', dept.departmentId);
    const ids: string[] = [];
    for (const employeeId of [e1, e1, e2, e2, e2]) {
      ids.push(
        await w.seedRecommendation({
          group: 'G4',
          state: 'AWAITING_DECISION',
          tier: 'REVIEW',
          assignmentId: await w.seatOf(employeeId, await w.worldSubscription(3, 'K2')),
          deciderDepartmentId: dept.departmentId,
          decisionDueOn: addDays(w.today(), 5),
        }),
      );
    }

    const page = dataOf<{
      items: { holder: { employeeId: string }; evidence: object }[];
      holderCount: number;
    }>(await queue(dept.head).expect(200));

    expect(page.items).toHaveLength(5);
    expect(page.holderCount).toBe(2);
    const holders = page.items.map((item) => item.holder.employeeId);
    expect(holders).toEqual([...holders].sort());
    expect(JSON.stringify(page.items)).not.toMatch(/volume|sessions|tokens|rawRows/i);
    expect(dataOf<{ items: unknown[] }>(await queue(other.head).expect(200)).items).toHaveLength(0);
    await read(dept.head, ids[0]).expect(200);
    await read(w.worldItAdmin.account, ids[0]).expect(200);
    await read(other.head, ids[0]).expect(403);
    await queue(w.worldItAdmin.account).expect(403);
  });

  it('AC-15: a holder whose transfer took effect since the job last ran is paused when the head decides: 409 PAUSED, the state is PAUSED', async () => {
    const { dept, seat, rec } = await waiting('DC9');
    const target = await w.headedDepartment('P-DC9-NEW');
    await w.transferOf(seat.employeeId, dept.departmentId, target.departmentId, '2026-10-12');

    const response = await decide(dept.head, {
      items: [{ recommendationId: rec }],
      choice: 'KEEP',
      reason: 'Vẫn cần',
    }).expect(409);

    expect(w.codeOf(response)).toBe('GHOST_SEAT.PAUSED');
    expect((await w.ghostRows('id = $1', [rec]))[0]).toMatchObject({ state: 'PAUSED' });
    expect(await decisionRows(rec)).toHaveLength(0);
  });
});
