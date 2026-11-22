import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { ApiAccount } from '../../support/api-accounts';
import { GhostSeatWorld } from '../../support/ghost-seat-world';
import { itAdminSeat } from '../../support/machine-account-seat';

const w = new GhostSeatWorld();

interface ItemWire {
  recommendationId: string;
  outcome: 'ESCALATED' | 'SKIPPED';
  reason: string | null;
  state: string | null;
  departmentId: string | null;
}
interface BatchWire {
  id: string;
  escalated: number;
  skipped: number;
  replayed: boolean;
  results: ItemWire[];
}

const key = (): string => `escalation-${randomUUID()}`;
const post = (body: object, idempotencyKey: string | null = key(), account: ApiAccount = w.it1) => {
  const call = request(w.server()).post('/api/v1/ghost-seat-recommendations/escalations').set(w.as(account));

  return (idempotencyKey === null ? call : call.set('Idempotency-Key', idempotencyKey)).send(
    w.checklists.withYes('5.3', body),
  );
};
const batchOf = (response: request.Response): BatchWire => w.dataOf<BatchWire>(response);

/**
 * `QĐ-111ay`: the IT Admin pushes recommendations of the watch tier to the head of the department before the weekly pass does. A `G4` of the
 * watch tier is seeded the way an earlier build left it (the weekly pass of today makes none, `M5-18`), so the push is judged on rows that exist.
 */
describe('the early push of a watch to the head of the department (integration, real PostgreSQL)', () => {
  beforeAll(async () => {
    await w.startWorld();
  }, 240000);

  afterAll(async () => {
    await w.stop();
  });

  /** A department with a head, a holder in it and a `G4` of the watch tier on the holder's seat. */
  async function watchOf(code: string, over: { group?: 'G4'; tier?: 'MONITOR' | 'REVIEW' } = {}) {
    const dept = await w.headedDepartment(code);
    const holder = await w.seatIn(`${code}-H`, dept.departmentId);
    const id = await w.seedRecommendation({
      group: over.group ?? 'G4',
      state: 'OPEN',
      tier: over.tier ?? 'MONITOR',
      assignmentId: holder.assignmentId,
    });

    return { dept, holder, id };
  }

  it('pushes a watch: the tier rises to review, the head of the holder’s department is asked at once and told, the evidence stays as it was', async () => {
    const { dept, id } = await watchOf('P-ES1');
    const [before] = await w.ghostRows('id = $1', [id]);

    const batch = batchOf(await post({ recommendationIds: [id], note: 'Not used since the summer.' }).expect(201));

    expect(batch).toMatchObject({ escalated: 1, skipped: 0, replayed: false });
    expect(batch.results).toEqual([
      {
        recommendationId: id,
        outcome: 'ESCALATED',
        reason: null,
        state: 'AWAITING_DECISION',
        departmentId: dept.departmentId,
      },
    ]);
    const [after] = await w.ghostRows('id = $1', [id]);
    expect(after).toMatchObject({
      group: 'G4',
      tier: 'REVIEW',
      state: 'AWAITING_DECISION',
      decider_department_id: dept.departmentId,
    });
    expect(after.routed_at).not.toBeNull();
    expect(after.decision_due_on).not.toBeNull();
    expect(after.evidence).toEqual(before.evidence);
    expect(await w.noticesOf('GHOST_SEAT_NEW', dept.headEmployeeId)).toHaveLength(1);
    const queue = w.dataOf<{ items: { id?: string; recommendationId?: string }[] }>(
      await request(w.server()).get('/api/v1/ghost-seat-queue').set(w.as(dept.head)).expect(200),
    );
    expect(JSON.stringify(queue.items)).toContain(id);
  });

  it('audits the push by the IT Admin, with the batch and whether they are the one in charge, and the routing by the system; the note is kept with the batch only', async () => {
    const inChargeCase = await watchOf('P-ES2');
    const otherCase = await watchOf('P-ES3');

    const byInCharge = batchOf(
      await post({ recommendationIds: [inChargeCase.id], note: 'Please look.' }, key(), w.worldItAdmin.account).expect(
        201,
      ),
    );
    const byOther = batchOf(await post({ recommendationIds: [otherCase.id] }).expect(201));

    const events = async (id: string) =>
      (await w.auditOf('GHOST_SEAT_RECOMMENDATION', id)).map((event) => event.action);
    expect(await events(inChargeCase.id)).toEqual(
      expect.arrayContaining(['GHOST_SEAT.ESCALATED', 'GHOST_SEAT.ROUTED']),
    );
    const escalated = (await w.auditOf('GHOST_SEAT_RECOMMENDATION', inChargeCase.id)).find(
      (event) => event.action === 'GHOST_SEAT.ESCALATED',
    );
    expect(escalated?.before).toMatchObject({ tier: 'MONITOR' });
    expect(escalated?.after).toMatchObject({
      tier: 'REVIEW',
      escalationId: byInCharge.id,
      hasNote: true,
      byInCharge: true,
    });
    expect(JSON.stringify(escalated)).not.toContain('Please look.');
    const other = (await w.auditOf('GHOST_SEAT_RECOMMENDATION', otherCase.id)).find(
      (event) => event.action === 'GHOST_SEAT.ESCALATED',
    );
    expect(other?.after).toMatchObject({ escalationId: byOther.id, hasNote: false, byInCharge: false });
    const note = await w.ctx.sql.query<{ note: string | null }>(
      `SELECT note FROM ghost_seat_escalations WHERE id = $1`,
      [byInCharge.id],
    );
    expect(note.rows[0].note).toBe('Please look.');
  });

  it('a department with no head takes the recommendation into its waiting queue, and the result says so', async () => {
    const dept = await w.department('P-ES4', w.worldItAdmin.employeeId);
    const holder = await w.seatIn('P-ES4-H', dept.id);
    const id = await w.seedRecommendation({
      group: 'G4',
      state: 'OPEN',
      tier: 'MONITOR',
      assignmentId: holder.assignmentId,
    });

    const batch = batchOf(await post({ recommendationIds: [id] }).expect(201));

    expect(batch.results[0]).toMatchObject({ outcome: 'ESCALATED', state: 'WAITING_FOR_HEAD', departmentId: dept.id });
    expect((await w.ghostRows('id = $1', [id]))[0]).toMatchObject({ tier: 'REVIEW', state: 'WAITING_FOR_HEAD' });
  });

  it('leaves a watch as it was when its holder began a long leave after the pass made it: LEAVE_OR_HANDOVER, the head is not told (B3A-02, FR-4.12, FR-4.9 gate 3)', async () => {
    const { dept, holder, id } = await watchOf('P-ESL');
    await w.ctx.sql.query(
      `INSERT INTO employee_leaves (id, organization_id, employee_id, started_on, approved_return_on, status, grounds_type,
                                    grounds_reference, grounds_issuer, grounds_issued_on, started_by_app_user_id)
       VALUES (gen_random_uuid(), $1, $2, (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - 1, (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date + 60,
               'ACTIVE', 'T', 'B3A-02', 'I', (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - 1, gen_random_uuid())`,
      [w.seed.organizationId, holder.employeeId],
    );

    const batch = batchOf(await post({ recommendationIds: [id] }).expect(201));

    expect(batch).toMatchObject({ escalated: 0, skipped: 1 });
    expect(batch.results[0]).toMatchObject({ recommendationId: id, outcome: 'SKIPPED', reason: 'LEAVE_OR_HANDOVER' });
    const [row] = await w.ghostRows('id = $1', [id]);
    expect(row).toMatchObject({ tier: 'MONITOR', state: 'OPEN' });
    expect(await w.noticesOf('GHOST_SEAT_NEW', dept.headEmployeeId)).toHaveLength(0);
  });

  it('answers each recommendation in the order named: what is not a watch, a machine account, a holder in a transfer, a paused or closed one and an unknown id is left as it was, with its reason', async () => {
    const good = await watchOf('P-ES5');
    const review = await watchOf('P-ES6', { tier: 'REVIEW' });
    const closedSeat = await w.seatIn('P-ES5-C', good.dept.departmentId);
    const closed = await w.seedRecommendation({
      group: 'G4',
      state: 'CLOSED',
      tier: 'MONITOR',
      closeReason: 'OUT_OF_SCOPE',
      assignmentId: closedSeat.assignmentId,
    });
    const g2Seat = await w.seatIn('P-ES5-G2', good.dept.departmentId);
    const g2 = await w.seedRecommendation({
      group: 'G2',
      state: 'OPEN',
      tier: 'ACTION',
      assignmentId: g2Seat.assignmentId,
    });
    const machineDept = await w.headedDepartment('P-ES7');
    const bot = await itAdminSeat(w, { subscriptionId: await w.worldSubscription(30, 'K2') }, 'ci-bot-es7', {
      flagged: true,
      validFrom: '2026-01-05',
    });
    const machine = await w.seedRecommendation({ group: 'G4', state: 'OPEN', tier: 'MONITOR', assignmentId: bot });
    const moving = await watchOf('P-ES8');
    await w.transferOf(moving.holder.employeeId, moving.dept.departmentId, machineDept.departmentId, '2026-11-01');
    const pausedSeat = await w.seatIn('P-ES5-P', good.dept.departmentId);
    const paused = await w.seedRecommendation({
      group: 'G4',
      state: 'PAUSED',
      tier: 'MONITOR',
      assignmentId: pausedSeat.assignmentId,
    });
    const unknown = randomUUID();
    const named = [unknown, machine, good.id, review.id, paused, moving.id, closed, g2];

    const batch = batchOf(await post({ recommendationIds: named }).expect(201));

    expect(batch.results.map((item) => [item.recommendationId, item.outcome, item.reason])).toEqual([
      [unknown, 'SKIPPED', 'NOT_FOUND'],
      [machine, 'SKIPPED', 'MACHINE_ACCOUNT'],
      [good.id, 'ESCALATED', null],
      [review.id, 'SKIPPED', 'NOT_WATCH'],
      [paused, 'SKIPPED', 'TRANSFER_GRACE'],
      [moving.id, 'SKIPPED', 'TRANSFER_GRACE'],
      [closed, 'SKIPPED', 'NOT_WATCH'],
      [g2, 'SKIPPED', 'NOT_WATCH'],
    ]);
    expect(batch).toMatchObject({ escalated: 1, skipped: 7 });
    const rows = new Map((await w.ghostRows('id = ANY($1::uuid[])', [named])).map((row) => [row.id, row]));
    expect(rows.get(good.id)).toMatchObject({ tier: 'REVIEW', state: 'AWAITING_DECISION' });
    expect(rows.get(machine)).toMatchObject({ tier: 'MONITOR', state: 'OPEN', routed_at: null });
    expect(rows.get(moving.id)).toMatchObject({ tier: 'MONITOR', state: 'OPEN', routed_at: null });
    expect(rows.get(paused)).toMatchObject({ tier: 'MONITOR', state: 'PAUSED' });
    expect(rows.get(review.id)).toMatchObject({ tier: 'REVIEW', state: 'OPEN', routed_at: null });
    expect(rows.get(closed)).toMatchObject({ state: 'CLOSED' });
    expect((await w.auditOf('GHOST_SEAT_RECOMMENDATION', machine)).map((event) => event.action)).not.toContain(
      'GHOST_SEAT.ESCALATED',
    );
  });

  it('a seat that no longer holds a seat is left as it was (SEAT_ENDED): the next run closes the recommendation', async () => {
    const { holder, id } = await watchOf('P-ES9');
    await w.ctx.sql.query(`UPDATE license_assignments SET valid_until = '2026-01-06' WHERE id = $1`, [
      holder.assignmentId,
    ]);

    const batch = batchOf(await post({ recommendationIds: [id] }).expect(201));

    expect(batch.results[0]).toMatchObject({ outcome: 'SKIPPED', reason: 'SEAT_ENDED' });
    expect((await w.ghostRows('id = $1', [id]))[0]).toMatchObject({ tier: 'MONITOR', state: 'OPEN' });
  });

  it('one named twice counts once', async () => {
    const { id } = await watchOf('P-ES10');

    const batch = batchOf(await post({ recommendationIds: [id, id] }).expect(201));

    expect(batch.results).toHaveLength(1);
    expect(batch).toMatchObject({ escalated: 1, skipped: 0 });
  });

  describe('the Idempotency-Key', () => {
    it('answers the same result again and does nothing a second time, even after the recommendation has moved on', async () => {
      const { dept, id } = await watchOf('P-ES11');
      const same = key();
      const first = batchOf(await post({ recommendationIds: [id] }, same).expect(201));
      await w.ctx.sql.query(
        `UPDATE ghost_seat_recommendations SET state = 'CLOSED', close_reason = 'KEPT', closed_at = now() WHERE id = $1`,
        [id],
      );

      const again = batchOf(await post({ recommendationIds: [id] }, same).expect(201));

      expect(again).toMatchObject({ id: first.id, replayed: true, escalated: 1, skipped: 0 });
      expect(again.results).toEqual(first.results);
      const escalations = (await w.auditOf('GHOST_SEAT_RECOMMENDATION', id)).filter(
        (event) => event.action === 'GHOST_SEAT.ESCALATED',
      );
      expect(escalations).toHaveLength(1);
      expect(await w.noticesOf('GHOST_SEAT_NEW', dept.headEmployeeId)).toHaveLength(1);
    });

    it('refuses the same key for another list or another note with 409 GHOST_SEAT.ESCALATION_KEY_REUSED, and changes nothing', async () => {
      const a = await watchOf('P-ES12');
      const b = await watchOf('P-ES13');
      const same = key();
      await post({ recommendationIds: [a.id] }, same).expect(201);

      expect(w.codeOf(await post({ recommendationIds: [a.id, b.id] }, same).expect(409))).toBe(
        'GHOST_SEAT.ESCALATION_KEY_REUSED',
      );
      expect(w.codeOf(await post({ recommendationIds: [a.id], note: 'another' }, same).expect(409))).toBe(
        'GHOST_SEAT.ESCALATION_KEY_REUSED',
      );
      expect((await w.ghostRows('id = $1', [b.id]))[0]).toMatchObject({ tier: 'MONITOR', state: 'OPEN' });
    });

    it('names a key for one person: another IT Admin with the same key makes a batch of their own', async () => {
      const { id } = await watchOf('P-ES14');
      const shared = key();
      const first = batchOf(await post({ recommendationIds: [id] }, shared).expect(201));

      const other = batchOf(await post({ recommendationIds: [id] }, shared, w.worldItAdmin.account).expect(201));

      expect(other.id).not.toBe(first.id);
      expect(other).toMatchObject({ replayed: false, escalated: 0, skipped: 1 });
      expect(other.results[0].reason).toBe('NOT_WATCH');
    });

    it('two calls with one key at once push once: one acts, the other answers what was done', async () => {
      const { id } = await watchOf('P-ES15');
      const same = key();

      const [first, second] = await Promise.all([
        post({ recommendationIds: [id] }, same),
        post({ recommendationIds: [id] }, same),
      ]);

      expect([first.status, second.status]).toEqual([201, 201]);
      const [a, b] = [batchOf(first), batchOf(second)];
      expect(a.id).toBe(b.id);
      expect([a.replayed, b.replayed].sort()).toEqual([false, true]);
      expect(a.results).toEqual(b.results);
      expect(
        (await w.auditOf('GHOST_SEAT_RECOMMENDATION', id)).filter((event) => event.action === 'GHOST_SEAT.ESCALATED'),
      ).toHaveLength(1);
    });
  });

  describe('what the route refuses', () => {
    it('asks for the key and for a body of one to a hundred ids and a note of at most 500 characters', async () => {
      const id = randomUUID();
      const ids = (count: number) => Array.from({ length: count }, () => randomUUID());
      const refusals: [string, () => request.Test][] = [
        ['no key', () => post({ recommendationIds: [id] }, null)],
        ['a short key', () => post({ recommendationIds: [id] }, 'short')],
        ['no ids', () => post({ recommendationIds: [] })],
        ['101 ids', () => post({ recommendationIds: ids(101) })],
        ['an id that is not a UUID', () => post({ recommendationIds: ['nope'] })],
        ['a note of 501 characters', () => post({ recommendationIds: [id], note: 'n'.repeat(501) })],
        ['a blank note', () => post({ recommendationIds: [id], note: '   ' })],
        ['a field it never takes', () => post({ recommendationIds: [id], departmentId: id })],
      ];

      for (const [name, call] of refusals) {
        const response = await call();
        expect([name, response.status, w.codeOf(response)]).toEqual([name, 422, 'VALIDATION_ERROR']);
      }
      expect(batchOf(await post({ recommendationIds: ids(100) }).expect(201)).skipped).toBe(100);
    });

    it('is for the IT Admin alone: 403 for everyone else, 401 with no token', async () => {
      const body = { recommendationIds: [randomUUID()] };
      for (const account of [w.employee, w.finance]) await post(body, key(), account).expect(403);
      await request(w.server())
        .post('/api/v1/ghost-seat-recommendations/escalations')
        .set('Idempotency-Key', key())
        .send(body)
        .expect(401);
    });
  });

  describe('IT Admin in-charge gate', () => {
    it('skips with NOT_IN_CHARGE for another active IT Admin, allows active in-charge IT Admin, and allows substitute when locked', async () => {
      const activeEmp = await w.person('E-ES-OWN');
      const activeIt = await w.account('E-ES-OWN', activeEmp, 'IT_ADMIN');
      const dept = await w.headedDepartment('P-ES-OWN', activeEmp);
      const holder = await w.seatIn('P-ES-OWN-H', dept.departmentId);
      const id = await w.seedRecommendation({
        group: 'G4',
        state: 'OPEN',
        tier: 'MONITOR',
        assignmentId: holder.assignmentId,
      });

      const refused = batchOf(await post({ recommendationIds: [id] }, key(), w.it1).expect(201));
      expect(refused).toMatchObject({ escalated: 0, skipped: 1 });
      expect(refused.results[0]).toEqual({ recommendationId: id, outcome: 'SKIPPED', reason: 'NOT_IN_CHARGE' });

      const byOwner = batchOf(await post({ recommendationIds: [id] }, key(), activeIt).expect(201));
      expect(byOwner).toMatchObject({ escalated: 1, skipped: 0 });
      expect(byOwner.results[0]).toMatchObject({ recommendationId: id, outcome: 'ESCALATED' });

      const lockedEmp = await w.person('E-ES-LCK');
      await w.account('E-ES-LCK', lockedEmp, 'IT_ADMIN');
      const lockedDept = await w.headedDepartment('P-ES-LCK', lockedEmp);
      const lockedHolder = await w.seatIn('P-ES-LCK-H', lockedDept.departmentId);
      const lockedId = await w.seedRecommendation({
        group: 'G4',
        state: 'OPEN',
        tier: 'MONITOR',
        assignmentId: lockedHolder.assignmentId,
      });
      await w.ctx.sql.query(`UPDATE app_users SET status = 'LOCKED' WHERE employee_id = $1`, [lockedEmp]);
      const allowed = batchOf(await post({ recommendationIds: [lockedId] }, key(), w.it1).expect(201));
      expect(allowed).toMatchObject({ escalated: 1, skipped: 0 });
      expect(allowed.results[0]).toMatchObject({ recommendationId: lockedId, outcome: 'ESCALATED' });
    });
  });
});
