import request from 'supertest';
import type { ApiAccount } from '../../support/api-accounts';
import { DevicesHarness, type NoticeWire, type StopRequestWire } from '../../support/devices-harness';

const h = new DevicesHarness();

describe('stop request completion acting IT Admin enforcement (H13) (integration, real PostgreSQL)', () => {
  let seq = 0;
  let notice: NoticeWire;
  let title: string;

  const nextCode = (prefix: string) => `${prefix}-${(seq += 1)}`;
  const stopOf = (response: { body: unknown }): StopRequestWire =>
    (response.body as { data: { stopRequest: StopRequestWire } }).data.stopRequest;

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

  const createItAdmin = async (
    deptCode: string,
    prefix: string,
  ): Promise<{ employeeId: string; account: ApiAccount }> => {
    const code = nextCode(prefix);
    const employeeId = await h.member(deptCode, code, title);
    const account = await h.account(code, employeeId, 'IT_ADMIN');
    return { employeeId, account };
  };

  const registerAndActivate = async (holder: ApiAccount, itAccount: ApiAccount = h.it1): Promise<string> => {
    const device = await h.registered(holder.employeeId, {}, itAccount);
    await h
      .recordSignature(
        device.registrationId as string,
        { documentId: await h.scan(itAccount), noticeVersionId: notice.id },
        itAccount,
      )
      .expect(201);
    await h.acknowledge(holder, device.registrationId as string, notice.id).expect(201);
    return device.registrationId as string;
  };

  const createHolderWithStopRequest = async (
    deptCode: string | null,
    prefix: string,
    itAccount: ApiAccount = h.it1,
  ): Promise<{ holder: ApiAccount; stopRequestId: string }> => {
    const code = nextCode(prefix);
    const employeeId = deptCode ? await h.member(deptCode, code, title) : await h.person(code);
    const holder = await h.account(code, employeeId, 'EMPLOYEE');
    const registrationId = await registerAndActivate(holder, itAccount);
    const created = stopOf(await h.requestStop(holder, registrationId).expect(201));
    return { holder, stopRequestId: created.id };
  };

  beforeAll(async () => {
    await h.start();
    notice = await h.published();
    await h.allowlisted();
    title = await h.jobTitle('Engineer');
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  it('rejects unplaced holder stop request, rejects non-acting IT Admin, and allows usable in-charge IT Admin without bySubstitute', async () => {
    const deptA = await h.department(nextCode('H13A'));
    const deptB = await h.department(nextCode('H13B'));
    const itA = await createItAdmin(deptA.code, 'ITA');
    const itB = await createItAdmin(deptB.code, 'ITB');
    await h.ctx.sql.query(`UPDATE departments SET it_admin_employee_id = $2 WHERE id = $1`, [deptA.id, itA.employeeId]);
    await h.ctx.sql.query(`UPDATE departments SET it_admin_employee_id = $2 WHERE id = $1`, [deptB.id, itB.employeeId]);

    const { stopRequestId: unplacedStopId } = await createHolderWithStopRequest(null, 'UNPL');
    expect(h.codeOf(await h.completeStop(unplacedStopId, itA.account).expect(403))).toBe(
      'DEVICE_STOP_REQUEST.NOT_IN_CHARGE',
    );

    const { stopRequestId: stopA } = await createHolderWithStopRequest(deptA.code, 'HLDA', itA.account);
    // itB is not in charge of deptA -> 403 DEVICE_STOP_REQUEST.NOT_IN_CHARGE
    expect(h.codeOf(await h.completeStop(stopA, itB.account).expect(403))).toBe('DEVICE_STOP_REQUEST.NOT_IN_CHARGE');

    // Lock itA -> still refuses itB when no acting IT Admin exists
    await h.ctx.sql.query(`UPDATE app_users SET status = 'LOCKED' WHERE id = $1`, [itA.account.appUserId]);
    try {
      expect(h.codeOf(await h.completeStop(stopA, itB.account).expect(403))).toBe('DEVICE_STOP_REQUEST.NOT_IN_CHARGE');
    } finally {
      await h.ctx.sql.query(`UPDATE app_users SET status = 'ACTIVE' WHERE id = $1`, [itA.account.appUserId]);
    }

    // Usable in-charge itA completes stop request without bySubstitute
    const done = stopOf(await h.completeStop(stopA, itA.account).expect(200));
    expect(done.state).toBe('COMPLETED');
    const events = await h.auditEvents('DeviceStopRequest', stopA);
    const completedAudit = events.find((e) => e.action === 'DEVICE_STOP_REQUEST.COMPLETED');
    expect(completedAudit?.after).toMatchObject({ state: 'COMPLETED', selfHandled: false });
    expect(completedAudit?.after).not.toHaveProperty('bySubstitute');
  });

  it('allows appointed substitute IT Admin to complete stop request and records bySubstitute: true in audit', async () => {
    const dept = await h.department(nextCode('H13S'));
    const itInCharge = await createItAdmin(dept.code, 'ITIC');
    const itSub = await createItAdmin(dept.code, 'ITSUB');
    await h.ctx.sql.query(`UPDATE departments SET it_admin_employee_id = $2 WHERE id = $1`, [
      dept.id,
      itInCharge.employeeId,
    ]);

    const { stopRequestId } = await createHolderWithStopRequest(dept.code, 'HLDS', itInCharge.account);

    const subRes = await appointSubstitute(dept.id, itSub.employeeId, 'Substitute cover').expect(201);
    const subId = h.dataOf<{ substitute: { id: string } }>(subRes).substitute.id;
    try {
      const done = stopOf(await h.completeStop(stopRequestId, itSub.account).expect(200));
      expect(done.state).toBe('COMPLETED');
      const events = await h.auditEvents('DeviceStopRequest', stopRequestId);
      const completedAudit = events.find((e) => e.action === 'DEVICE_STOP_REQUEST.COMPLETED');
      expect(completedAudit?.after).toMatchObject({ state: 'COMPLETED', selfHandled: false, bySubstitute: true });
    } finally {
      await endSubstitute(subId).expect(201);
    }
  });

  it('notifies only Super Admin and no other IT Admin when in-charge IT Admin is locked and no substitute exists', async () => {
    const deptA = await h.department(nextCode('M13A'));
    const deptB = await h.department(nextCode('M13B'));
    const itA = await createItAdmin(deptA.code, 'MITA');
    await createItAdmin(deptB.code, 'MITB');
    await h.ctx.sql.query(`UPDATE departments SET it_admin_employee_id = $2 WHERE id = $1`, [deptA.id, itA.employeeId]);

    const holderCode = nextCode('MHLD');
    const holderEmployeeId = await h.member(deptA.code, holderCode, title);
    const holder = await h.account(holderCode, holderEmployeeId, 'EMPLOYEE');
    const registrationId = await registerAndActivate(holder, itA.account);

    await h.ctx.sql.query(`UPDATE app_users SET status = 'LOCKED' WHERE id = $1`, [itA.account.appUserId]);
    try {
      const stopRequestId = stopOf(await h.requestStop(holder, registrationId).expect(201)).id;
      const { rows } = await h.ctx.sql.query<{ recipient_employee_id: string }>(
        `SELECT recipient_employee_id FROM in_app_notifications
          WHERE code = 'DEVICE_STOP_REQUESTED' AND event_key = $1
          ORDER BY recipient_employee_id`,
        [`DEVICE_STOP_REQUESTED:${stopRequestId}`],
      );
      expect(rows.map((row) => row.recipient_employee_id)).toEqual([h.seed.superAdmin.employeeId]);
    } finally {
      await h.ctx.sql.query(`UPDATE app_users SET status = 'ACTIVE' WHERE id = $1`, [itA.account.appUserId]);
    }
  });
});
