import request from 'supertest';
import { declareSubscription } from '../../support/builders/catalog.builder';
import type { TaskWire } from '../../support/provisioning-harness';
import { RevocationHarness } from '../../support/revocation-harness';

const h = new RevocationHarness();

/**
 * `BR-MF1-09`, `QĐ-103d`, `QĐ-106d`, real PostgreSQL (spec `qd103-k4-key-pool` §1–§3): a K4 request is granted from the key pool of its
 * plan, to a person of any department. The grant takes a free key of the store (in the store, not withdrawn, not promised to another open
 * grant); with none free the IT Admin buys one (`KEY_PURCHASE`), imports it and gives it. The completion names the key, which becomes
 * ASSIGNED to the seat; two IT Admins who give the same last key are served one after the other.
 */
describe('BR-MF1-09: the grant of a K4 key from the pool (integration, real PostgreSQL)', () => {
  let counter = 0;
  let batch = 0;
  const person = () => h.person(`E-K4G-${(counter += 1)}`);

  /** A K4 purchase of a new plan with `quantity` licenses bought, and `keys` keys imported into its store. */
  const pool = async (quantity: number, keys: number) => {
    const subscriptionId = await h.subscription(quantity, 'K4');
    if (keys > 0) await importKeys(subscriptionId, keys);

    return { subscriptionId, planId: await h.planOf(subscriptionId) };
  };
  const importKeys = async (subscriptionId: string, count: number): Promise<void> => {
    batch += 1;
    const keys = Array.from({ length: count }, (_, i) => `K4G-${batch}-${String(i + 1).padStart(3, '0')}-ABCDE-12345`);
    await request(h.server())
      .post('/api/v1/license-keys/imports')
      .set(h.as(h.it1))
      .send({ subscriptionId, keys })
      .expect(201);
  };
  const keysOf = async (subscriptionId: string) =>
    (
      await h.ctx.sql.query<{ id: string; status: string; assignment_id: string | null; withdrawn_at: Date | null }>(
        `SELECT id, status::text, assignment_id, withdrawn_at FROM license_keys
          WHERE subscription_id = $1 ORDER BY imported_at, id`,
        [subscriptionId],
      )
    ).rows;
  const quantityOf = async (subscriptionId: string): Promise<number> =>
    (
      await h.ctx.sql.query<{ q: number }>(`SELECT purchased_quantity AS q FROM subscriptions WHERE id = $1`, [
        subscriptionId,
      ])
    ).rows[0].q;
  const claimed = async (task: TaskWire): Promise<TaskWire> => {
    await h.claim(task.id).expect(200);

    return task;
  };
  const withdrawKey = (id: string, reason = 'Broken') =>
    request(h.server()).post(`/api/v1/license-keys/${id}/withdrawal`).set(h.as(h.it1)).send({ reason });

  beforeAll(async () => {
    await h.start();
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  it('BR-MF1-09: grants K4 from a free key of the store and gives the key to the seat when the task is completed', async () => {
    const { subscriptionId, planId } = await pool(3, 2);
    const [key] = await keysOf(subscriptionId);
    const task = await claimed(await h.granted(await person(), planId));

    expect(task).toMatchObject({ subscriptionId, purchase: null });
    const done = await h.complete(task.id, { evidence: 'Key activated', licenseKeyId: key.id }).expect(200);

    expect(h.dataOf<{ task: TaskWire }>(done).task).toMatchObject({ status: 'COMPLETED' });
    expect((await keysOf(subscriptionId)).find((row) => row.id === key.id)).toMatchObject({
      status: 'ASSIGNED',
      assignment_id: task.assignmentId,
      withdrawn_at: null,
    });
    expect(await h.auditEvents('LicenseKey', key.id)).toMatchObject([
      {
        action: 'LICENSE_KEY.ASSIGNED',
        actor_app_user_id: h.it1.appUserId,
        after: { licenseKeyId: key.id, subscriptionId, assignmentId: task.assignmentId },
      },
    ]);
    expect(h.gate.outcomes).toContainEqual({ requestId: task.requestId, outcome: 'COMPLETED' });
  });

  it('BR-MF1-09: a K4 completion names its key; a K2 completion names none; nothing is written on a refusal', async () => {
    const k4 = await pool(2, 1);
    const k4Task = await claimed(await h.granted(await person(), k4.planId));
    const k2 = await h.subscription(2, 'K2');
    const k2Task = await claimed(await h.granted(await person(), await h.planOf(k2)));
    const [key] = await keysOf(k4.subscriptionId);

    const missing = await h.complete(k4Task.id, { evidence: 'done' }).expect(422);
    const misplaced = await h.complete(k2Task.id, { evidence: 'done', licenseKeyId: key.id }).expect(422);
    const unknown = await h
      .complete(k4Task.id, { evidence: 'done', licenseKeyId: '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11' })
      .expect(404);

    expect(h.codeOf(missing)).toBe('PROVISIONING.KEY_REQUIRED');
    expect(h.codeOf(misplaced)).toBe('PROVISIONING.KEY_NOT_APPLICABLE');
    expect(h.codeOf(unknown)).toBe('LICENSE_KEY.NOT_FOUND');
    expect(await h.revocationOf(k4Task.id)).toMatchObject({ status: 'IN_PROGRESS' });
    expect(await h.revocationOf(k2Task.id)).toMatchObject({ status: 'IN_PROGRESS' });
    expect((await keysOf(k4.subscriptionId))[0]).toMatchObject({ status: 'IN_STORE', assignment_id: null });
  });

  it('BR-MF1-09: refuses a key of another purchase, a key already given and a withdrawn key, with 409', async () => {
    const own = await pool(3, 3);
    const other = await pool(1, 1);
    const [given, withdrawn, free] = await keysOf(own.subscriptionId);
    const first = await claimed(await h.granted(await person(), own.planId));
    await h.complete(first.id, { evidence: 'done', licenseKeyId: given.id }).expect(200);
    await withdrawKey(withdrawn.id).expect(200);
    const task = await claimed(await h.granted(await person(), own.planId));

    const foreign = await h
      .complete(task.id, { evidence: 'done', licenseKeyId: (await keysOf(other.subscriptionId))[0].id })
      .expect(409);
    const taken = await h.complete(task.id, { evidence: 'done', licenseKeyId: given.id }).expect(409);
    const out = await h.complete(task.id, { evidence: 'done', licenseKeyId: withdrawn.id }).expect(409);

    expect([foreign, taken, out].map((response) => h.codeOf(response))).toEqual([
      'LICENSE_KEY.SUBSCRIPTION_MISMATCH',
      'LICENSE_KEY.NOT_IN_STORE',
      'LICENSE_KEY.WITHDRAWN',
    ]);
    await h.complete(task.id, { evidence: 'done', licenseKeyId: free.id }).expect(200);
  });

  it('BR-MF1-09 (US-07-01 AC-2): two IT Admins who give the same last key: one is served, the other is refused', async () => {
    const { subscriptionId, planId } = await pool(2, 2);
    const [key] = await keysOf(subscriptionId);
    const one = await claimed(await h.granted(await person(), planId));
    const two = await claimed(await h.granted(await person(), planId));

    const answers = await Promise.all([
      h.complete(one.id, { evidence: 'done', licenseKeyId: key.id }),
      h.complete(two.id, { evidence: 'done', licenseKeyId: key.id }),
    ]);

    expect(answers.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(h.codeOf(answers.find((response) => response.status === 409) as request.Response)).toBe(
      'LICENSE_KEY.NOT_IN_STORE',
    );
    expect((await keysOf(subscriptionId)).filter((row) => row.status === 'ASSIGNED')).toHaveLength(1);
  });

  it('BR-MF1-09: a key promised to an open grant is not free: with none left the grant is refused and a purchase is allowed', async () => {
    const { subscriptionId, planId } = await pool(3, 1);
    await h.granted(await person(), planId);

    const refused = await h.grant({ requestId: h.gate.grantable(await person(), planId) }).expect(409);

    expect(h.codeOf(refused)).toBe('LICENSE_ASSIGNMENT.SEAT_CAPACITY');
    const bought = h.dataOf<{ task: TaskWire & { purchase: { kind: string } | null } }>(
      await h.grant({ requestId: h.gate.grantable(await person(), planId), purchase: {} }).expect(201),
    ).task;
    expect(bought.purchase).toMatchObject({ kind: 'KEY_PURCHASE' });
    expect(await quantityOf(subscriptionId)).toBe(4);
  });

  it('BR-MF1-09 (R-E05): a purchase is refused while the pool still has a free key; a withdrawn key is not free', async () => {
    const free = await pool(3, 1);
    const refused = await h
      .grant({ requestId: h.gate.grantable(await person(), free.planId), purchase: {} })
      .expect(409);
    expect(h.codeOf(refused)).toBe('PROVISIONING.PURCHASE_NOT_ALLOWED');
    expect(h.detailsOf(refused)).toMatchObject({ freeSeats: 1, subscriptionIds: [free.subscriptionId] });

    const out = await pool(3, 1);
    await withdrawKey((await keysOf(out.subscriptionId))[0].id).expect(200);
    const bought = await h
      .grant({ requestId: h.gate.grantable(await person(), out.planId), purchase: { reason: 'Last key broken' } })
      .expect(201);

    expect(h.dataOf<{ task: { purchase: { kind: string } } }>(bought).task.purchase).toMatchObject({
      kind: 'KEY_PURCHASE',
    });
  });

  it('BR-MF1-09: with the pool empty the IT Admin buys a key, imports it and gives it to the seat', async () => {
    const { subscriptionId, planId } = await pool(1, 0);
    const task = await claimed(
      h.dataOf<{ task: TaskWire }>(
        await h.grant({ requestId: h.gate.grantable(await person(), planId), purchase: {} }).expect(201),
      ).task,
    );
    await importKeys(subscriptionId, 1);
    const [key] = await keysOf(subscriptionId);

    await h.complete(task.id, { evidence: 'Bought and activated', licenseKeyId: key.id }).expect(200);

    expect((await keysOf(subscriptionId))[0]).toMatchObject({ status: 'ASSIGNED', assignment_id: task.assignmentId });
  });

  it('BR-MF1-09c: a K4 key given from the pool records its purchase price as the cost avoided; a bought key records none', async () => {
    const planId = await h.plan('K4');
    const subscriptionId = await declareSubscription(h.ctx, h.it1.accessToken, {
      ownerDepartmentId: h.seed.departmentId,
      planId,
      kind: 'PERPETUAL',
      purchasedQuantity: 2,
      unitPrice: { amount: '5000000', currency: 'VND' },
      startDate: '2026-01-05',
    });
    await importKeys(subscriptionId, 1);
    const [key] = await keysOf(subscriptionId);
    const task = await claimed(await h.granted(await person(), planId));

    await h.complete(task.id, { evidence: 'done', licenseKeyId: key.id }).expect(200);

    const avoided = (
      await h.ctx.sql.query<{ provisioning_type: string; months: number | null; amount_minor: string }>(
        `SELECT provisioning_type, months, amount_minor::text FROM pool_grant_avoided_costs WHERE provisioning_task_id = $1`,
        [task.id],
      )
    ).rows;
    expect(avoided).toEqual([{ provisioning_type: 'K4', months: null, amount_minor: '5000000' }]);
  });

  it('BR-MF1-09: K3 stays refused', async () => {
    const planId = await h.plan('K2');
    await h.ctx.sql.query(`UPDATE plans SET provisioning_type = 'K3', pricing_model = NULL WHERE id = $1`, [planId]);

    const refused = await h.grant({ requestId: h.gate.grantable(await person(), planId) }).expect(409);

    expect(h.codeOf(refused)).toBe('PROVISIONING.TYPE_NOT_SUPPORTED');
  });
});
