import request from 'supertest';
import type { TaskWire } from '../../support/provisioning-harness';
import { RevocationHarness } from '../../support/revocation-harness';

const h = new RevocationHarness();

/**
 * `BR-MF1-09`, `QĐ-103d`, `QĐ-103v`, Q-10 B, real PostgreSQL (spec `qd103-k4-key-pool` §4–§6, `US-07-05` AC-6, AC-7): a K4 seat is revoked
 * like any seat and its key goes back to the store, or back and withdrawn from it at once; the IT Admin withdraws a free key from the store
 * with a reason; a withdrawn key is never counted, given out or revealed again, and the database keeps the withdrawal fixed.
 */
describe('BR-MF1-09: a K4 key back to the store and withdrawn from it (integration, real PostgreSQL)', () => {
  let counter = 0;
  let batch = 0;
  const person = () => h.person(`E-K4R-${(counter += 1)}`);

  const importKeys = async (subscriptionId: string, count: number): Promise<void> => {
    batch += 1;
    const keys = Array.from({ length: count }, (_, i) => `K4R-${batch}-${String(i + 1).padStart(3, '0')}-ABCDE-12345`);
    await request(h.server())
      .post('/api/v1/license-keys/imports')
      .set(h.as(h.it1))
      .send({ subscriptionId, keys })
      .expect(201);
  };
  const keysOf = async (subscriptionId: string) =>
    (
      await h.ctx.sql.query<{
        id: string;
        status: string;
        assignment_id: string | null;
        withdrawn_at: Date | null;
        withdrawal_reason: string | null;
      }>(
        `SELECT id, status::text, assignment_id, withdrawn_at, withdrawal_reason FROM license_keys
          WHERE subscription_id = $1 ORDER BY imported_at, id`,
        [subscriptionId],
      )
    ).rows;
  const withdrawKey = (id: string, body: object = { reason: 'Broken' }, account = h.it1) =>
    request(h.server()).post(`/api/v1/license-keys/${id}/withdrawal`).set(h.as(account)).send(body);
  const reveal = (id: string) => request(h.server()).post(`/api/v1/license-keys/${id}/reveal`).set(h.as(h.it1));
  const listed = async (subscriptionId: string, extra = '') =>
    h.dataOf<{
      items: { id: string; status: string; assignmentId: string | null; withdrawnAt: string | null }[];
      summary: { usableKeys: number };
    }>(
      await request(h.server())
        .get(`/api/v1/license-keys?subscriptionId=${subscriptionId}&pageSize=100${extra}`)
        .set(h.as(h.it1))
        .expect(200),
    );
  /** A K4 seat granted from the pool and completed with the first key of the store; its revocation opened and taken. */
  const heldSeat = async (keys = 2) => {
    const subscriptionId = await h.subscription(3, 'K4');
    await importKeys(subscriptionId, keys);
    const planId = await h.planOf(subscriptionId);
    const [key] = await keysOf(subscriptionId);
    const grant: TaskWire = await h.granted(await person(), planId);
    await h.claim(grant.id).expect(200);
    await h.complete(grant.id, { evidence: 'done', licenseKeyId: key.id }).expect(200);
    const { taskId } = await h.open(grant.assignmentId, 'RETURN');
    await h.claim(taskId).expect(200);

    return { subscriptionId, planId, keyId: key.id, assignmentId: grant.assignmentId, taskId };
  };
  const sqlState = async (text: string, values: unknown[]): Promise<string | null> => {
    try {
      await h.ctx.sql.query(text, values);

      return null;
    } catch (error) {
      return (error as { code?: string }).code ?? 'unknown';
    }
  };

  beforeAll(async () => {
    await h.start();
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  it('BR-MF1-09 (US-07-05 AC-6): revoking a K4 seat ends it and puts its key back in the store, free again', async () => {
    const seat = await heldSeat();
    const usableBefore = (await listed(seat.subscriptionId)).summary.usableKeys;

    const done = await h
      .revoked(seat.taskId, { completion: 'KEY_DEACTIVATED', evidence: 'Deactivated on the laptop' })
      .expect(200);

    expect(h.dataOf<{ task: TaskWire }>(done).task).toMatchObject({ status: 'COMPLETED' });
    expect((await h.assignmentRow(seat.assignmentId)).valid_until).not.toBeNull();
    expect((await keysOf(seat.subscriptionId)).find((key) => key.id === seat.keyId)).toMatchObject({
      status: 'IN_STORE',
      assignment_id: null,
      withdrawn_at: null,
    });
    expect((await listed(seat.subscriptionId)).summary.usableKeys).toBe(usableBefore);
    expect((await h.auditEvents('LicenseKey', seat.keyId)).map((event) => event.action)).toEqual([
      'LICENSE_KEY.ASSIGNED',
      'LICENSE_KEY.RETURNED_TO_STORE',
    ]);
    // The key is free again: the next grant can take it.
    const next = await h.granted(await person(), seat.planId);
    await h.claim(next.id).expect(200);
    await h.complete(next.id, { evidence: 'done', licenseKeyId: seat.keyId }).expect(200);
  });

  it('BR-MF1-09 (US-07-05 AC-7, Q-10 B): a key that may not move is put back and withdrawn at once, with its reason', async () => {
    const seat = await heldSeat();
    const usableBefore = (await listed(seat.subscriptionId)).summary.usableKeys;

    await h
      .revoked(seat.taskId, {
        completion: 'KEY_DEACTIVATED',
        evidence: 'Deactivated',
        keyDisposition: 'WITHDRAW',
        withdrawalReason: 'The license may not move to another device',
      })
      .expect(200);

    expect((await keysOf(seat.subscriptionId)).find((key) => key.id === seat.keyId)).toMatchObject({
      status: 'IN_STORE',
      assignment_id: null,
      withdrawal_reason: 'The license may not move to another device',
    });
    expect((await listed(seat.subscriptionId)).summary.usableKeys).toBe(usableBefore - 1);
    expect((await h.auditEvents('LicenseKey', seat.keyId)).map((event) => event.action)).toEqual([
      'LICENSE_KEY.ASSIGNED',
      'LICENSE_KEY.RETURNED_TO_STORE',
      'LICENSE_KEY.WITHDRAWN',
    ]);
  });

  it('BR-MF1-09: refuses a withdrawal with no reason, another way for K4, and the fields of a key on K2; nothing moves', async () => {
    const seat = await heldSeat();

    const noReason = await h
      .revoked(seat.taskId, { completion: 'KEY_DEACTIVATED', evidence: 'x', keyDisposition: 'WITHDRAW' })
      .expect(422);
    const otherWay = await h.revoked(seat.taskId, { completion: 'ACCOUNT_REMOVED', evidence: 'x' }).expect(422);
    const noEvidence = await h.revoked(seat.taskId, { completion: 'KEY_DEACTIVATED', evidence: ' ' }).expect(422);

    expect([noReason, otherWay, noEvidence].map((response) => h.codeOf(response))).toEqual([
      'REVOCATION.WITHDRAWAL_REASON_REQUIRED',
      'REVOCATION.COMPLETION_NOT_ALLOWED',
      'PROVISIONING_TASK.EVIDENCE_REQUIRED',
    ]);
    expect((await keysOf(seat.subscriptionId)).find((key) => key.id === seat.keyId)).toMatchObject({
      status: 'ASSIGNED',
      assignment_id: seat.assignmentId,
    });

    const k2 = await h.subscription(2, 'K2');
    const k2Seat = await h.seat({ subscriptionId: k2 }, `E-K4R-K2-${(counter += 1)}`);
    const { taskId } = await h.open(k2Seat, 'RETURN');
    await h.claim(taskId).expect(200);
    const misplaced = await h
      .revoked(taskId, { completion: 'ACCOUNT_REMOVED', evidence: 'x', keyDisposition: 'RETURN_TO_STORE' })
      .expect(422);
    expect(h.codeOf(misplaced)).toBe('REVOCATION.COMPLETION_NOT_ALLOWED');
  });

  it('BR-MF1-09: a K4 seat granted before the key pool holds no key: the revocation ends it and moves no key', async () => {
    const subscriptionId = await h.subscription(3, 'K4');
    const assignmentId = await h.seat({ subscriptionId }, `E-K4R-OLD-${(counter += 1)}`);
    const { taskId } = await h.open(assignmentId, 'RETURN');
    await h.claim(taskId).expect(200);

    await h.revoked(taskId, { completion: 'KEY_DEACTIVATED', evidence: 'Deactivated' }).expect(200);

    expect((await h.auditEvents('ProvisioningTask', taskId)).at(-1)).toMatchObject({
      action: 'PROVISIONING_TASK.REVOCATION_COMPLETED',
      after: { completion: 'KEY_DEACTIVATED', licenseKeyId: null, keyDisposition: 'RETURN_TO_STORE' },
    });
  });

  it('BR-MF1-09 (Q-10 B): the IT Admin withdraws a free key with a reason; it is no longer usable, revealed or given out', async () => {
    const subscriptionId = await h.subscription(3, 'K4');
    await importKeys(subscriptionId, 2);
    const [key, other] = await keysOf(subscriptionId);

    const withdrawn = h.dataOf<{
      key: { id: string; status: string; withdrawnAt: string | null; withdrawalReason: string };
    }>(await withdrawKey(key.id, { reason: '  Leaked in a ticket  ' }).expect(200)).key;

    expect(withdrawn).toMatchObject({ id: key.id, status: 'IN_STORE', withdrawalReason: 'Leaked in a ticket' });
    expect(withdrawn.withdrawnAt).not.toBeNull();
    expect(await h.auditEvents('LicenseKey', key.id)).toMatchObject([
      { action: 'LICENSE_KEY.WITHDRAWN', actor_app_user_id: h.it1.appUserId, after: { licenseKeyId: key.id } },
    ]);
    expect(h.codeOf(await withdrawKey(key.id).expect(409))).toBe('LICENSE_KEY.ALREADY_WITHDRAWN');
    expect(h.codeOf(await reveal(key.id).expect(409))).toBe('LICENSE_KEY.WITHDRAWN');
    const page = await listed(subscriptionId);
    expect(page.summary.usableKeys).toBe(1);
    expect((await listed(subscriptionId, '&withdrawn=true')).items.map((item) => item.id)).toEqual([key.id]);
    expect((await listed(subscriptionId, '&withdrawn=false')).items.map((item) => item.id)).toEqual([other.id]);
  });

  it('BR-MF1-09 (Q-10 B): refuses to withdraw a key given to a seat, and a person who is not an IT Admin', async () => {
    const seat = await heldSeat();
    const [, free] = await keysOf(seat.subscriptionId);
    const employee = await h.account(`E-K4R-M-${(counter += 1)}`, await person(), 'EMPLOYEE');

    expect(h.codeOf(await withdrawKey(seat.keyId).expect(409))).toBe('LICENSE_KEY.ASSIGNED');
    await withdrawKey(free.id, { reason: 'x' }, employee).expect(403);
    expect((await keysOf(seat.subscriptionId)).every((key) => key.withdrawn_at === null)).toBe(true);
  });

  it('BR-MF1-09: a withdrawal and the grant that gives the same key are served one after the other: one of them wins', async () => {
    const subscriptionId = await h.subscription(3, 'K4');
    await importKeys(subscriptionId, 1);
    const [key] = await keysOf(subscriptionId);
    const task = await h.granted(await person(), await h.planOf(subscriptionId));
    await h.claim(task.id).expect(200);

    const [given, withdrawn] = await Promise.all([
      h.complete(task.id, { evidence: 'done', licenseKeyId: key.id }),
      withdrawKey(key.id),
    ]);

    expect([given.status, withdrawn.status].sort()).toEqual([200, 409]);
    const [row] = await keysOf(subscriptionId);
    expect(row.status === 'ASSIGNED' ? row.withdrawn_at : row.assignment_id).toBeNull();
  });

  it('BR-MF1-09: the database keeps a key in one of two states and a withdrawal fixed', async () => {
    const seat = await heldSeat(3);
    const [, free, out] = await keysOf(seat.subscriptionId);
    await withdrawKey(out.id).expect(200);

    // ASSIGNED with no assignment, and a withdrawal of an assigned key, break the CHECKs.
    expect(await sqlState(`UPDATE license_keys SET status = 'ASSIGNED' WHERE id = $1`, [free.id])).toBe('23514');
    expect(
      await sqlState(`UPDATE license_keys SET withdrawn_at = now(), withdrawal_reason = 'x' WHERE id = $1`, [
        seat.keyId,
      ]),
    ).toBe('23514');
    // A withdrawn key stays withdrawn and out of use; a key goes back to the store before another seat takes it.
    expect(await sqlState(`UPDATE license_keys SET withdrawal_reason = 'other' WHERE id = $1`, [out.id])).toBe('55000');
    expect(
      await sqlState(`UPDATE license_keys SET withdrawn_at = NULL, withdrawal_reason = NULL WHERE id = $1`, [out.id]),
    ).toBe('55000');
    const another = await h.seat({ subscriptionId: seat.subscriptionId }, `E-K4R-DB-${(counter += 1)}`);
    expect(await sqlState(`UPDATE license_keys SET assignment_id = $2 WHERE id = $1`, [seat.keyId, another])).toBe(
      '55000',
    );
    // RETIRED is gone.
    expect(await sqlState(`UPDATE license_keys SET status = 'RETIRED' WHERE id = $1`, [free.id])).toBe('22P02');
  });
});
