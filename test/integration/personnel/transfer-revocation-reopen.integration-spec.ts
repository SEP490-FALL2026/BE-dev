import request from 'supertest';
import { addDays } from '../../../src/core/business-date';
import { TransferRevocationService } from '../../../src/modules/personnel/transfer-grace/transfer-revocation.service';
import type { ApiAccount } from '../../support/api-accounts';
import { OffboardingHarness } from '../../support/offboarding-harness';

const h = new OffboardingHarness();

describe('POST /api/v1/department-transfers/:id/revocations acting IT Admin enforcement (integration, real PostgreSQL)', () => {
  let seq = 0;
  let subscriptionId: string;

  const nextCode = (prefix: string) => `${prefix}-${(seq += 1)}`;

  const reopen = (transferId: string, account: ApiAccount) =>
    request(h.server()).post(`/api/v1/department-transfers/${transferId}/revocations`).set(h.as(account));

  const appointSubstitute = (departmentId: string, substituteEmployeeId: string, reason = 'Cover') =>
    request(h.server())
      .post(`/api/v1/departments/${departmentId}/it-substitutes`)
      .set({ Authorization: `Bearer ${h.admin}` })
      .send({ substituteEmployeeId, reason });

  const endSubstitute = (substituteId: string) =>
    request(h.server())
      .post(`/api/v1/department-it-substitutes/${substituteId}/end`)
      .set({ Authorization: `Bearer ${h.admin}` })
      .send();

  const graceOverNow = async (transferId: string): Promise<void> => {
    await h.ctx.sql.query('BEGIN');
    try {
      await h.ctx.sql.query('ALTER TABLE department_transfers DISABLE TRIGGER USER');
      await h.ctx.sql.query(
        `UPDATE department_transfers SET effective_on = $2, grace_ends_on = $3, grace_reminder_on = $4 WHERE id = $1`,
        [transferId, addDays(h.today(), -10), addDays(h.today(), -1), addDays(h.today(), -3)],
      );
      await h.ctx.sql.query('ALTER TABLE department_transfers ENABLE TRIGGER USER');
      await h.ctx.sql.query('COMMIT');
    } catch (error) {
      await h.ctx.sql.query('ROLLBACK');
      throw error;
    }
  };

  const createClosedFailedTransfer = async (
    fromDept: Awaited<ReturnType<typeof h.departmentWithUnit>>,
    toDept: Awaited<ReturnType<typeof h.departmentWithUnit>>,
    taskActor: ApiAccount,
  ): Promise<{ id: string; employeeId: string }> => {
    const empCode = nextCode('TR-EMP');
    const mover = await h.worker(fromDept, empCode);
    const seatId = await h.seatOf(mover, { subscriptionId }, empCode);
    const transfer = await h.moveToday(mover, toDept);
    await graceOverNow(transfer.id);

    await h.ctx.app.get(TransferRevocationService, { strict: false }).sweep(new Date());

    const { rows } = await h.ctx.sql.query<{ id: string }>(
      `SELECT id FROM provisioning_tasks WHERE assignment_id = $1 AND kind = 'REVOKE'`,
      [seatId],
    );
    const taskId = rows[0].id;
    await h.claim(taskId, taskActor).expect(200);
    await h.fail(taskId, { reason: 'Vendor unreachable' }, taskActor).expect(200);
    await h.closeFailed(taskId, { reason: 'Vendor unreachable' }, taskActor).expect(200);

    return { id: transfer.id, employeeId: mover.employeeId };
  };

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    subscriptionId = await h.subscription(20, 'K2');
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  it('enforces read scope (404), destination acting IT Admin (403 NOT_IN_CHARGE), and substitute audit marker', async () => {
    const des = await h.departmentWithUnit(nextCode('TR-DES'));
    const fin = await h.departmentWithUnit(nextCode('TR-FIN'));
    const hr = await h.departmentWithUnit(nextCode('TR-HR'));

    const itDes = await h.worker(des, nextCode('IT-DES'), ['IT_ADMIN']);
    const itFin = await h.worker(fin, nextCode('IT-FIN'), ['IT_ADMIN']);
    const itHr = await h.worker(hr, nextCode('IT-HR'), ['IT_ADMIN']);
    const itSub = await h.worker(fin, nextCode('IT-SUB'), ['IT_ADMIN']);

    await h.setItAdminInCharge(des, itDes);
    await h.setItAdminInCharge(fin, itFin);
    await h.setItAdminInCharge(hr, itHr);

    // Transfer 1: Chi moves DES -> FIN with a closed-failed revocation after grace ends.
    const transfer1 = await createClosedFailedTransfer(des, fin, itFin.account);

    // Unrelated HR IT Admin (outside read scope for both DES and FIN) -> 404 NOT_FOUND.
    expect(h.codeOf(await reopen(transfer1.id, itHr.account).expect(404))).toBe('DEPARTMENT_TRANSFER.NOT_FOUND');

    // Source department IT Admin (in read scope via fromDepartmentId, not acting for FIN) -> 403 NOT_IN_CHARGE.
    expect(h.codeOf(await reopen(transfer1.id, itDes.account).expect(403))).toBe('DEPARTMENT_TRANSFER.NOT_IN_CHARGE');

    // Destination department in-charge IT Admin succeeds without bySubstitute in audit.
    const reopened1 = await reopen(transfer1.id, itFin.account).expect(200);
    expect(h.dataOf<{ created: number; reasonAdded: number }>(reopened1)).toEqual({ created: 1, reasonAdded: 0 });
    const events1 = await h.auditEventsOf('DEPARTMENT_TRANSFER.REVOCATION_OPENED', transfer1.id);
    const userAudit1 = events1.find((e) => e.actor_kind === 'USER');
    expect(userAudit1?.after).toEqual({ employeeId: transfer1.employeeId, tasksCreated: 1, reasonsAdded: 0 });
    expect(userAudit1?.after).not.toHaveProperty('bySubstitute');

    // Transfer 2: closed-failed revocation while FIN in-charge IT Admin is subsequently locked.
    const transfer2 = await createClosedFailedTransfer(des, fin, itFin.account);

    await h.ctx.sql.query(`UPDATE app_users SET status = 'LOCKED' WHERE id = $1`, [itFin.account.appUserId]);
    let substituteId: string | null = null;
    try {
      // With itFin locked and no substitute, FIN is in common queue -> other IT Admin gets 403 NOT_IN_CHARGE.
      expect(h.codeOf(await reopen(transfer2.id, itHr.account).expect(403))).toBe('DEPARTMENT_TRANSFER.NOT_IN_CHARGE');

      // Appoint Minh as substitute for FIN -> Minh succeeds and audit records bySubstitute: true.
      const subRes = await appointSubstitute(fin.id, itSub.employeeId, 'Cover locked IT Admin').expect(201);
      substituteId = h.dataOf<{ substitute: { id: string } }>(subRes).substitute.id;

      const reopened2 = await reopen(transfer2.id, itSub.account).expect(200);
      expect(h.dataOf<{ created: number; reasonAdded: number }>(reopened2)).toEqual({ created: 1, reasonAdded: 0 });
      const events2 = await h.auditEventsOf('DEPARTMENT_TRANSFER.REVOCATION_OPENED', transfer2.id);
      const userAudit2 = events2.find((e) => e.actor_kind === 'USER');
      expect(userAudit2?.after).toEqual({
        employeeId: transfer2.employeeId,
        tasksCreated: 1,
        reasonsAdded: 0,
        bySubstitute: true,
      });
    } finally {
      if (substituteId) await endSubstitute(substituteId).expect(201);
      await h.ctx.sql.query(`UPDATE app_users SET status = 'ACTIVE' WHERE id = $1`, [itFin.account.appUserId]);
    }
  }, 240_000);
});
