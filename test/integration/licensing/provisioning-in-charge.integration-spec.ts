import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import { LicensingApi } from '../../../src/modules/licensing/public/licensing.api';
import { ProvisioningExtensionService } from '../../../src/modules/licensing/provisioning/tasks/provisioning-extension.service';
import type { ApiAccount } from '../../support/api-accounts';
import { ProvisioningHarness, type TaskWire } from '../../support/provisioning-harness';

const h = new ProvisioningHarness();

describe('provisioning in-charge, substitute, self-execution, and scope rules (integration, real PostgreSQL)', () => {
  let title: string;
  let haEmployee: string;
  let ha: ApiAccount;
  let itBEmployee: string;
  let itB: ApiAccount;
  let minhEmployee: string;
  let minh: ApiAccount;
  let desDept: { id: string; code: string };
  let othDept: { id: string; code: string };
  let an: string;
  let leaverAn: string;
  let othMember: string;

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

  const completeRevocation = (taskId: string, body: object, account: ApiAccount) =>
    request(h.server())
      .post(`/api/v1/provisioning-tasks/${taskId}/revocation-completion`)
      .set(h.as(account))
      .send(body);

  const recordAccessCut = (taskId: string, body: object, account: ApiAccount) =>
    request(h.server()).post(`/api/v1/provisioning-tasks/${taskId}/access-cut`).set(h.as(account)).send(body);

  const taskOf = (res: request.Response) => h.dataOf<{ task: TaskWire }>(res).task;
  const listItems = (res: request.Response) => h.dataOf<{ items: TaskWire[] }>(res).items;

  beforeAll(async () => {
    await h.start();
    title = await h.jobTitle('Engineer');
    haEmployee = await h.person('PIC-HA');
    ha = await h.account('PIC-HA', haEmployee, 'IT_ADMIN');
    itBEmployee = await h.person('PIC-ITB');
    itB = await h.account('PIC-ITB', itBEmployee, 'IT_ADMIN');
    minhEmployee = await h.person('PIC-MINH');
    minh = await h.account('PIC-MINH', minhEmployee, 'IT_ADMIN');

    desDept = await h.department('PIC-DES', haEmployee);
    othDept = await h.department('PIC-OTH', itBEmployee);
    an = await h.member(desDept.code, 'PIC-AN', title);
    leaverAn = await h.member(desDept.code, 'PIC-LVR', title);
    othMember = await h.member(othDept.code, 'PIC-OTHM', title);
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  it('rejects ?scope=GENERAL with 422 VALIDATION_ERROR', async () => {
    const res = await h.list({ scope: 'GENERAL' }, ha).expect(422);
    expect(h.codeOf(res)).toBe('VALIDATION_ERROR');
  });

  it('enforces acting IT Admin across write routes, hides tasks outside read scope with 404, and records bySubstitute for appointed substitute (W2-27 (d))', async () => {
    const subscriptionId = await h.subscription(5, 'K2');
    const planId = await h.planOf(subscriptionId);
    const reqId = h.gate.grantable(an, planId, desDept.id);

    // IT B cannot grant for DES (Ha usable)
    expect(h.codeOf(await h.grant({ requestId: reqId, subscriptionId }, itB).expect(403))).toBe(
      'PROVISIONING.NOT_IN_CHARGE',
    );

    // Ha grants for An -> succeeds; IT B cannot read task (404) or act on it (403)
    const created = await h.granted(an, planId, { subscriptionId, account: ha, departmentId: desDept.id });
    expect(created.awaitingItAdmin).toBe(false);
    expect(created.actingItAdmins).toHaveLength(1);
    expect(created.actingItAdmins?.[0]).toMatchObject({ id: haEmployee, bySubstitute: false });
    expect(typeof created.actingItAdmins?.[0].fullName).toBe('string');

    expect(h.codeOf(await h.getTask(created.id, itB).expect(404))).toBe('PROVISIONING_TASK.NOT_FOUND');
    expect(listItems(await h.list({ scope: 'ALL', pageSize: 100 }, itB).expect(200)).map((t) => t.id)).not.toContain(
      created.id,
    );

    expect(h.codeOf(await h.claim(created.id, itB).expect(403))).toBe('PROVISIONING.NOT_IN_CHARGE');
    expect(h.codeOf(await h.complete(created.id, { evidence: 'x' }, itB).expect(403))).toBe(
      'PROVISIONING.NOT_IN_CHARGE',
    );
    expect(h.codeOf(await h.fail(created.id, { reason: 'x' }, itB).expect(403))).toBe('PROVISIONING.NOT_IN_CHARGE');

    // Lock Ha: DES moves into read scope (ALL) for IT B with awaitingItAdmin=true, still excluded from MINE and writes
    await h.ctx.sql.query(`UPDATE app_users SET status = 'LOCKED' WHERE id = $1`, [ha.appUserId]);
    try {
      expect(h.codeOf(await h.claim(created.id, itB).expect(403))).toBe('PROVISIONING.NOT_IN_CHARGE');
      expect(listItems(await h.list({ scope: 'MINE', pageSize: 100 }, itB).expect(200)).map((t) => t.id)).not.toContain(
        created.id,
      );
      const allForB = listItems(await h.list({ scope: 'ALL', pageSize: 100 }, itB).expect(200));
      const row = allForB.find((t) => t.id === created.id);
      expect(row).toMatchObject({ awaitingItAdmin: true, actingItAdmins: [] });
      expect(taskOf(await h.getTask(created.id, itB).expect(200))).toMatchObject({
        awaitingItAdmin: true,
        actingItAdmins: [],
      });

      // Appoint IT B as substitute for DES -> visible in MINE, actingItAdmins shows IT B (bySubstitute=true), completes with audit bySubstitute=true
      const subRes = await appointSubstitute(desDept.id, itBEmployee, 'Ha locked').expect(201);
      const substituteId = h.dataOf<{ substitute: { id: string } }>(subRes).substitute.id;
      try {
        const mineForB = listItems(await h.list({ scope: 'MINE', pageSize: 100 }, itB).expect(200));
        expect(mineForB.find((t) => t.id === created.id)).toMatchObject({
          awaitingItAdmin: false,
          actingItAdmins: [{ id: itBEmployee, bySubstitute: true }],
        });

        await h.claim(created.id, itB).expect(200);
        await h.complete(created.id, { evidence: 'Done by substitute' }, itB).expect(200);
        const events = await h.auditEvents('ProvisioningTask', created.id);
        expect(events.at(-1)?.after).toMatchObject({ status: 'COMPLETED', bySubstitute: true });
      } finally {
        await endSubstitute(substituteId).expect(201);
      }
    } finally {
      await h.ctx.sql.query(`UPDATE app_users SET status = 'ACTIVE' WHERE id = $1`, [ha.appUserId]);
    }
  });

  it('enforces acting IT Admin on failure-decision and revocation-completion routes', async () => {
    const subK2 = await h.subscription(5, 'K2');
    const planK2 = await h.planOf(subK2);
    const failedTask = await h.granted(an, planK2, { subscriptionId: subK2, account: ha, departmentId: desDept.id });
    await h.makeConnector(failedTask.id);
    await h.recordFailure(failedTask.id, 'PERMANENT');

    expect(h.codeOf(await h.retry(failedTask.id, itB).expect(403))).toBe('PROVISIONING.NOT_IN_CHARGE');
    expect(h.codeOf(await h.handOff(failedTask.id, {}, itB).expect(403))).toBe('PROVISIONING.NOT_IN_CHARGE');
    expect(h.codeOf(await h.closeFailed(failedTask.id, { reason: 'x' }, itB).expect(403))).toBe(
      'PROVISIONING.NOT_IN_CHARGE',
    );
    expect(h.codeOf(await h.cancelTask(failedTask.id, itB).expect(403))).toBe('PROVISIONING.NOT_IN_CHARGE');
    await h.closeFailed(failedTask.id, { reason: 'Closed by Ha' }, ha).expect(200);

    // Revocation completion & K1 access cut
    const subK1 = await h.subscription(5, 'K1');
    const planK1 = await h.planOf(subK1);
    const grantedK1 = await h.granted(othMember, planK1, {
      subscriptionId: subK1,
      account: itB,
      departmentId: othDept.id,
    });
    const licensing = h.ctx.app.get(LicensingApi);
    const runner = h.ctx.app.get(TransactionRunner);
    const { taskId: revTaskId } = await runner.run((tx) =>
      licensing.openRevocation(
        tx,
        { kind: 'SYSTEM', correlationId: 'test-rev' },
        {
          assignmentId: grantedK1.assignmentId,
          source: 'RETURN',
          decision: { decidedByEmployeeId: null, decidedRole: 'TEST' },
        },
      ),
    );
    expect(
      h.codeOf(await completeRevocation(revTaskId, { completion: 'RENEWAL_CANCELLED', evidence: 'x' }, ha).expect(403)),
    ).toBe('PROVISIONING.NOT_IN_CHARGE');
    await h.claim(revTaskId, itB).expect(200);
    await completeRevocation(
      revTaskId,
      {
        completion: 'RENEWAL_CANCELLED',
        evidence: 'Cancelled',
        paidThroughOn: '2026-12-31',
        accessState: 'UNTIL_PAID_END',
        k1Checklist: {
          items: [
            { code: 'RENEWAL_DISABLED', done: true, doneAt: '2026-11-23T08:00:00Z' },
            { code: 'EVIDENCE_RECORDED', done: true, doneAt: '2026-11-23T08:01:00Z' },
          ],
          evidence: 'Checklist done',
        },
      },
      itB,
    ).expect(200);

    expect(
      h.codeOf(await recordAccessCut(revTaskId, { accessCutOn: h.today(), evidence: 'Cut' }, ha).expect(403)),
    ).toBe('PROVISIONING.NOT_IN_CHARGE');
  });

  it('allows self-execution by acting IT Admin even when substitute is appointed, records selfExecuted=true and notifies Super Admin (W2-27 (j), Owner Q9)', async () => {
    const selfMember = await h.person('PIC-SELFIT');
    const selfAccount = await h.account('PIC-SELFIT', selfMember, 'IT_ADMIN');
    const selfDept = await h.department('PIC-SD', selfMember);
    await h.ctx.sql.query(
      `UPDATE employee_placements SET department_id = $2 WHERE employee_id = $1 AND valid_to IS NULL`,
      [selfMember, selfDept.id],
    );
    const subRes = await appointSubstitute(selfDept.id, minhEmployee, 'Cover during self grant').expect(201);
    const subId = h.dataOf<{ substitute: { id: string } }>(subRes).substitute.id;
    try {
      const subscriptionId = await h.subscription(5, 'K2');
      const planId = await h.planOf(subscriptionId);
      const task = await h.granted(selfMember, planId, {
        subscriptionId,
        account: selfAccount,
        departmentId: selfDept.id,
      });

      await h.complete(task.id, { evidence: 'Self provisioned' }, selfAccount).expect(200);
      const events = await h.auditEvents('ProvisioningTask', task.id);
      expect(events.at(-1)?.after).toMatchObject({ status: 'COMPLETED', selfExecuted: true });

      const notices = (
        await h.ctx.sql.query<{ code: string }>(
          `SELECT code FROM in_app_notifications WHERE code = 'IT_ADMIN_SELF_EXECUTED' AND subject_id = $1`,
          [task.id],
        )
      ).rows;
      expect(notices).toHaveLength(1);
    } finally {
      await endSubstitute(subId).expect(201);
    }
  });

  it('resolves work department from last placement for leaver (S2-1) and picks substitute ?? inCharge on new tasks (H18)', async () => {
    const subId = h.dataOf<{ substitute: { id: string } }>(
      await appointSubstitute(desDept.id, minhEmployee, 'Cover H18').expect(201),
    ).substitute.id;
    try {
      const subscriptionId = await h.subscription(5, 'K2');
      const planId = await h.planOf(subscriptionId);
      const grantTask = await h.granted(leaverAn, planId, {
        subscriptionId,
        account: ha,
        departmentId: desDept.id,
      });
      // H18: defaultResponsibleEmployeeId prefers substitute over inCharge
      expect(grantTask.defaultResponsibleEmployeeId).toBe(minhEmployee);
      await h.complete(grantTask.id, { evidence: 'Granted before leaving' }, ha).expect(200);

      // Leaver no longer has placement on today (closed before today)
      await h.ctx.sql.query(
        `UPDATE employee_placements SET valid_to = '2026-10-05'::date WHERE employee_id = $1 AND valid_to IS NULL`,
        [leaverAn],
      );
      await h.ctx.sql.query(`UPDATE employees SET status = 'TERMINATED' WHERE id = $1`, [leaverAn]);

      const licensing = h.ctx.app.get(LicensingApi);
      const runner = h.ctx.app.get(TransactionRunner);
      const { taskId: revId } = await runner.run((tx) =>
        licensing.openRevocation(
          tx,
          { kind: 'SYSTEM', correlationId: 'test-leaver-rev' },
          {
            assignmentId: grantTask.assignmentId,
            source: 'DEPARTURE',
            decision: { decidedByEmployeeId: null, decidedRole: 'HR' },
          },
        ),
      );
      const revCard = taskOf(await h.getTask(revId, ha).expect(200));
      expect(revCard.defaultResponsibleEmployeeId).toBe(minhEmployee);
      expect(h.codeOf(await h.claim(revId, itB).expect(403))).toBe('PROVISIONING.NOT_IN_CHARGE');
      await h.claim(revId, ha).expect(200);
      await completeRevocation(revId, { completion: 'ACCOUNT_REMOVED', evidence: 'Revoked for leaver' }, ha).expect(
        200,
      );

      // Extension factory also picks substitute ?? inCharge (H18)
      const extService = h.ctx.app.get(ProvisioningExtensionService, { strict: false });
      const { taskId: extId } = await runner.run((tx) =>
        extService.open(
          tx,
          {
            appUserId: ha.appUserId,
            employeeId: haEmployee,
            subject: ha.appUserId,
            sessionId: 's',
            directRoles: ['IT_ADMIN'],
            roles: ['IT_ADMIN'],
          },
          {
            assignmentId: grantTask.assignmentId,
            holderEmployeeId: an,
            requestId: randomUUID(),
            now: new Date(),
          },
        ),
      );
      expect(taskOf(await h.getTask(extId, ha).expect(200)).defaultResponsibleEmployeeId).toBe(minhEmployee);
    } finally {
      await endSubstitute(subId).expect(201);
    }
  });

  it('blocks ended substitute from completing an IN_PROGRESS task while allowing in-charge IT Admin to take over (S2-16)', async () => {
    const subId = h.dataOf<{ substitute: { id: string } }>(
      await appointSubstitute(desDept.id, minhEmployee, 'Temp cover').expect(201),
    ).substitute.id;
    const subscriptionId = await h.subscription(5, 'K2');
    const planId = await h.planOf(subscriptionId);
    const task = await h.granted(an, planId, {
      subscriptionId,
      account: minh,
      departmentId: desDept.id,
    });
    expect(task.status).toBe('IN_PROGRESS');
    expect(task.claimedBy).toBe(minh.appUserId);

    await endSubstitute(subId).expect(201);

    expect(h.codeOf(await h.complete(task.id, { evidence: 'Late completion' }, minh).expect(403))).toBe(
      'PROVISIONING.NOT_IN_CHARGE',
    );

    const takenByHa = taskOf(await h.claim(task.id, ha).expect(200));
    expect(takenByHa.claimedBy).toBe(ha.appUserId);
    const done = taskOf(await h.complete(task.id, { evidence: 'Completed by Ha' }, ha).expect(200));
    expect(done.status).toBe('COMPLETED');
  });
});
