import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { ApiAccount } from '../../support/api-accounts';
import { RevocationHarness } from '../../support/revocation-harness';

const h = new RevocationHarness();

interface Row {
  id: string;
  subscriptionId: string | null;
  employeeId: string;
  validUntil: string | null;
  employee: { employeeId: string; employeeCode: string; fullName: string };
  plan: { planId: string; planName: string; applicationName: string; logoUrl: string | null };
  revocation: { taskId: string; status: string; claimableNow: boolean } | null;
}
interface Page {
  items: Row[];
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
}

/**
 * Who holds what, and whether it is being taken back (`licenseAssignmentList`, `QĐ-111n`, `QĐ-111p`), on real PostgreSQL: the list of a
 * subscription narrowed to the rights in force (`activeOnly`), and on each row the revocation task that is open for it, which is when the IT Admin
 * may press "Revoke": a seat with no task from a valid source has none, and a task still in its grace is not claimable yet.
 */
describe('the holders of a subscription and their revocation, over HTTP (integration, real PostgreSQL)', () => {
  let counter = 0;
  const code = () => `E-REV-${(counter += 1)}`;
  const ids = {
    k2: '',
    k1: '',
    k4: '',
    waiting: '',
    grace: '',
    plain: '',
    ended: '',
    withdrawn: '',
    future: '',
    expired: '',
    keyHolderRevoked: '',
    keyHolder: '',
    k1Revoked: '',
    k1Plain: '',
    k1Ended: '',
  };
  const tasks: Record<'waiting' | 'grace' | 'keyHolderRevoked' | 'k1Revoked', string> = {
    waiting: '',
    grace: '',
    keyHolderRevoked: '',
    k1Revoked: '',
  };

  const get = (query: Record<string, string | number>, account: ApiAccount = h.it1) =>
    request(h.server()).get('/api/v1/license-assignments').query(query).set(h.as(account));
  const pageOf = async (query: Record<string, string | number>) => h.dataOf<Page>(await get(query).expect(200));
  const rowOf = async (subscriptionId: string, assignmentId: string, extra: Record<string, string | number> = {}) =>
    (await pageOf({ subscriptionId, pageSize: 100, ...extra })).items.find((row) => row.id === assignmentId);

  const insertAssignment = async (
    subscriptionId: string,
    validFrom: string,
    validUntil: string | null,
  ): Promise<string> => {
    const id = randomUUID();
    await h.ctx.sql.query(
      `INSERT INTO license_assignments (id, organization_id, kind, source, plan_id, subscription_id, employee_id,
         account_identifier, normalized_account_identifier, valid_from, valid_until, valid_from_basis, created_by_app_user_id)
       VALUES ($1, $2, 'PERSONAL', 'REQUEST', $3, $4, $5, $6, $6, $7, $8, 'ACTUAL', $9)`,
      [
        id,
        h.seed.organizationId,
        await h.planOf(subscriptionId),
        subscriptionId,
        await h.person(code()),
        `${id.slice(0, 8)}@acme.vn`,
        validFrom,
        validUntil,
        randomUUID(),
      ],
    );

    return id;
  };

  beforeAll(async () => {
    await h.start();

    ids.k2 = await h.subscription(10, 'K2');
    ids.waiting = await h.seat({ subscriptionId: ids.k2 }, code());
    ids.grace = await h.seat({ subscriptionId: ids.k2 }, code());
    ids.plain = await h.seat({ subscriptionId: ids.k2 }, code());
    ids.ended = await h.seat({ subscriptionId: ids.k2 }, code());
    ids.withdrawn = await h.seat({ subscriptionId: ids.k2 }, code());
    tasks.waiting = (await h.open(ids.waiting, 'RETURN')).taskId;
    const ghost = randomUUID();
    tasks.grace = (
      await h.open(ids.grace, 'GHOST_SEAT', {
        decision: { referenceKind: 'REVIEW', referenceId: ghost },
        timing: { notBefore: h.inDays(5) },
      })
    ).taskId;
    // A revocation that was completed ends the seat; one whose only reason was taken back is cancelled and leaves the seat as it was.
    const endedTask = (await h.open(ids.ended, 'RETURN')).taskId;
    await h.claim(endedTask).expect(200);
    await h.revoked(endedTask, { completion: 'ACCOUNT_REMOVED', evidence: 'Removed' }).expect(200);
    const reason = randomUUID();
    await h.open(ids.withdrawn, 'GHOST_SEAT', { decision: { referenceKind: 'REVIEW', referenceId: reason } });
    await h.withdraw(ids.withdrawn, 'GHOST_SEAT', reason);
    ids.future = await insertAssignment(ids.k2, h.inDays(1), null);
    ids.expired = await insertAssignment(ids.k2, '2026-02-01', '2026-03-01');

    ids.k1 = await h.subscription(10, 'K1');
    ids.k1Revoked = await h.seat({ subscriptionId: ids.k1 }, code());
    ids.k1Plain = await h.seat({ subscriptionId: ids.k1 }, code());
    ids.k1Ended = await insertAssignment(ids.k1, '2026-02-01', '2026-03-01');
    tasks.k1Revoked = (await h.open(ids.k1Revoked, 'DEPARTURE')).taskId;

    // K4: a key is a seat with the person who holds it; two keys are given out and the revocation of one is open.
    ids.k4 = await h.subscription(5, 'K4');
    const planId = await h.planOf(ids.k4);
    await request(h.server())
      .post('/api/v1/license-keys/imports')
      .set(h.as(h.it1))
      .send({ subscriptionId: ids.k4, keys: ['REV-001-ABCDE-12345', 'REV-002-ABCDE-12345', 'REV-003-ABCDE-12345'] })
      .expect(201);
    const keys = (
      await h.ctx.sql.query<{ id: string }>(
        `SELECT id FROM license_keys WHERE subscription_id = $1 ORDER BY imported_at, id`,
        [ids.k4],
      )
    ).rows;
    const given: { assignmentId: string }[] = [];
    for (const key of keys.slice(0, 2)) {
      const task = await h.granted(await h.person(code()), planId, { subscriptionId: ids.k4 });
      await h.claim(task.id).expect(200);
      await h.complete(task.id, { evidence: 'Key activated', licenseKeyId: key.id }).expect(200);
      given.push({ assignmentId: task.assignmentId });
    }
    ids.keyHolderRevoked = given[0].assignmentId;
    ids.keyHolder = given[1].assignmentId;
    tasks.keyHolderRevoked = (await h.open(ids.keyHolderRevoked, 'RETURN')).taskId;
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  describe('revocation on a row', () => {
    it('names the task that is open for a seat, its state, and that it can be taken now', async () => {
      expect((await rowOf(ids.k2, ids.waiting))?.revocation).toEqual({
        taskId: tasks.waiting,
        status: 'QUEUED',
        claimableNow: true,
      });
    });

    it('says a task still in its grace is not claimable yet (the same claimableNow as the task itself)', async () => {
      const row = await rowOf(ids.k2, ids.grace);
      const task = h.dataOf<{ task: { claimableNow: boolean } }>(await h.getTask(tasks.grace).expect(200)).task;

      expect(row?.revocation).toEqual({ taskId: tasks.grace, status: 'QUEUED', claimableNow: false });
      expect(task.claimableNow).toBe(false);
    });

    it('follows the task as it is worked: taken, then in progress', async () => {
      await h.claim(tasks.waiting).expect(200);

      expect((await rowOf(ids.k2, ids.waiting))?.revocation).toMatchObject({
        taskId: tasks.waiting,
        status: 'IN_PROGRESS',
      });
    });

    it('has none for a seat nobody is taking back, for one whose revocation was completed and for one whose only reason was taken back', async () => {
      for (const assignmentId of [ids.plain, ids.ended, ids.withdrawn]) {
        expect((await rowOf(ids.k2, assignmentId))?.revocation).toBeNull();
      }
    });

    it('is the same for a personal account (K1) and for the holder of a key (K4)', async () => {
      expect((await rowOf(ids.k1, ids.k1Revoked))?.revocation).toMatchObject({
        taskId: tasks.k1Revoked,
        status: 'QUEUED',
      });
      expect((await rowOf(ids.k1, ids.k1Plain))?.revocation).toBeNull();
      expect((await rowOf(ids.k4, ids.keyHolderRevoked))?.revocation).toMatchObject({
        taskId: tasks.keyHolderRevoked,
        status: 'QUEUED',
        claimableNow: true,
      });
      expect((await rowOf(ids.k4, ids.keyHolder))?.revocation).toBeNull();
    });

    it('is a revocation task, the one the routes of provisioning work on', async () => {
      const row = await rowOf(ids.k2, ids.waiting);
      const task = h.dataOf<{ task: { id: string; kind: string; assignmentId: string } }>(
        await h.getTask(row?.revocation?.taskId ?? '').expect(200),
      ).task;

      expect(task).toMatchObject({ kind: 'REVOKE', assignmentId: ids.waiting });
    });
  });

  describe('activeOnly', () => {
    it('lists only the rights in force: not one that ended, and one that begins later is a right already', async () => {
      const all = (await pageOf({ subscriptionId: ids.k2, pageSize: 100 })).items.map((row) => row.id);
      const active = (await pageOf({ subscriptionId: ids.k2, activeOnly: 'true', pageSize: 100 })).items.map(
        (row) => row.id,
      );

      expect([...all].sort()).toEqual(
        [ids.waiting, ids.grace, ids.plain, ids.ended, ids.withdrawn, ids.future, ids.expired].sort(),
      );
      expect([...active].sort()).toEqual([ids.waiting, ids.grace, ids.plain, ids.withdrawn, ids.future].sort());
    });

    it('lists all of them for false and without it, and refuses a value that is not a flag with 422', async () => {
      const ofSubscription = { subscriptionId: ids.k2, pageSize: 100 };

      expect((await pageOf({ ...ofSubscription, activeOnly: 'false' })).pagination.totalItems).toBe(7);
      expect((await pageOf(ofSubscription)).pagination.totalItems).toBe(7);
      expect(h.codeOf(await get({ activeOnly: 'yes' }).expect(422))).toBe('VALIDATION_ERROR');
    });

    it('counts and pages the rights in force on the same filter', async () => {
      const first = await pageOf({ subscriptionId: ids.k2, activeOnly: 'true', pageSize: 2, page: 1 });
      const last = await pageOf({ subscriptionId: ids.k2, activeOnly: 'true', pageSize: 2, page: 3 });

      expect(first.pagination).toMatchObject({ totalItems: 5, totalPages: 3 });
      expect(first.items).toHaveLength(2);
      expect(last.items).toHaveLength(1);
    });

    it('lists the holders of the keys of a K4 subscription, one person for each key given out', async () => {
      const rows = (await pageOf({ subscriptionId: ids.k4, activeOnly: 'true', pageSize: 100 })).items;

      expect(rows.map((row) => row.id).sort()).toEqual([ids.keyHolderRevoked, ids.keyHolder].sort());
      for (const row of rows) expect(row.employee.employeeCode).toEqual(expect.any(String));
    });

    it('agrees with the stock summary: the people who hold a K1 plan are the rights in force of its subscription', async () => {
      const planId = await h.planOf(ids.k1);
      const stock = h.dataOf<{ items: { stock: { kind: string; holders?: number } }[] }>(
        await request(h.server()).get('/api/v1/stock-summary').query({ planId }).set(h.as(h.it1)).expect(200),
      ).items[0].stock;
      const active = await pageOf({ subscriptionId: ids.k1, activeOnly: 'true', pageSize: 100 });

      expect(stock).toEqual({ kind: 'HOLDERS', holders: 2 });
      expect(active.pagination.totalItems).toBe(2);
      expect(active.items.map((row) => row.id)).not.toContain(ids.k1Ended);
    });

    it('agrees with the stock summary for a K4 plan: the keys given out are the rights in force of its subscription', async () => {
      const planId = await h.planOf(ids.k4);
      const stock = h.dataOf<{ items: { stock: { kind: string; assigned?: number } }[] }>(
        await request(h.server()).get('/api/v1/stock-summary').query({ planId }).set(h.as(h.it1)).expect(200),
      ).items[0].stock;
      const active = await pageOf({ subscriptionId: ids.k4, activeOnly: 'true', pageSize: 100 });

      expect(stock).toMatchObject({ kind: 'KEYS', assigned: active.pagination.totalItems });
    });
  });

  describe('the plan of a row', () => {
    it('names the plan and its application with the logo of it, null while none was given', async () => {
      const row = await rowOf(ids.k2, ids.plain);

      expect(row?.plan).toEqual({
        planId: await h.planOf(ids.k2),
        planName: expect.any(String) as unknown,
        applicationName: expect.any(String) as unknown,
        logoUrl: null,
      });
    });

    it('gives the logo the IT Admin pasted for the application', async () => {
      const planId = await h.planOf(ids.k2);
      await h.ctx.sql.query(
        `UPDATE applications SET logo_url = 'https://cdn.example.com/logo.png'
          WHERE id = (SELECT application_id FROM plans WHERE id = $1)`,
        [planId],
      );

      expect((await rowOf(ids.k2, ids.plain))?.plan.logoUrl).toBe('https://cdn.example.com/logo.png');
    });
  });
});
