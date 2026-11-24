import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { ItCoverageSweepService } from '../../../src/modules/identity-access/it-coverage/it-coverage-sweep.service';
import { IdentityAccessApi } from '../../../src/modules/identity-access/public/identity-access.api';
import { OrganizationReadApi } from '../../../src/modules/organization/public/organization-read.api';
import { RequestHarness } from '../../support/request-harness';
import { insertEmployeeWithoutPlacement } from '../../support/builders/account.builder';
import { createActivatedAccount } from '../../support/api-accounts';

describe('department IT substitutes, acting scope, work departments and load warning (integration, real PostgreSQL)', () => {
  const h = new RequestHarness();
  let organizationReads: OrganizationReadApi;
  let identityAccess: IdentityAccessApi;
  let itCoverageSweeps: ItCoverageSweepService;
  let codeSeq = 0;
  const code = (prefix: string): string => `${prefix}-${(codeSeq += 1)}`;

  beforeAll(async () => {
    await h.start();
    organizationReads = h.ctx.app.get(OrganizationReadApi);
    identityAccess = h.ctx.app.get(IdentityAccessApi);
    itCoverageSweeps = h.ctx.app.get(ItCoverageSweepService);
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  const appoint = (departmentId: string, body: object, token = h.admin) =>
    request(h.server())
      .post(`/api/v1/departments/${departmentId}/it-substitutes`)
      .set({ Authorization: `Bearer ${token}` })
      .send(body);

  const endSubstitute = (id: string, token = h.admin) =>
    request(h.server())
      .post(`/api/v1/department-it-substitutes/${id}/end`)
      .set({ Authorization: `Bearer ${token}` })
      .send();

  const listSubstitutes = (query = '', token = h.admin) =>
    request(h.server())
      .get(`/api/v1/department-it-substitutes${query}`)
      .set({ Authorization: `Bearer ${token}` });

  const updateDepartment = (id: string, body: object, token = h.admin) =>
    request(h.server())
      .patch(`/api/v1/departments/${id}`)
      .set({ Authorization: `Bearer ${token}` })
      .send(body);

  const getDepartment = (id: string, token = h.admin) =>
    request(h.server())
      .get(`/api/v1/departments/${id}`)
      .set({ Authorization: `Bearer ${token}` });

  const errCode = (res: request.Response) => (res.body as { error: { code: string } }).error.code;
  const dataOf = <T>(res: request.Response) => (res.body as { data: T }).data;
  const containing = (fields: object): unknown => expect.objectContaining(fields);
  const arrayContaining = (items: unknown[]): unknown => expect.arrayContaining(items);
  const noticesFor = async (subjectId: string, code: string) =>
    (
      await h.ctx.sql.query<{ recipient_employee_id: string; event_key: string; params: Record<string, unknown> }>(
        `SELECT recipient_employee_id, event_key, params
           FROM in_app_notifications WHERE subject_id = $1 AND code = $2 ORDER BY recipient_employee_id, id`,
        [subjectId, code],
      )
    ).rows;

  it('appoints, rejects invalid/duplicate/in-charge/inactive/forbidden, lists scoped, and ends REMOVED (W2-27 (a), (b))', async () => {
    const dept = await h.departmentWithUnit(code('DES'));
    const ha = await h.staff(dept, code('E-HA'), 'IT_ADMIN');
    const minh = await h.staff(dept, code('E-MINH'), 'IT_ADMIN');
    const plain = await h.staff(dept, code('E-EMP'), 'EMPLOYEE');
    await updateDepartment(dept.id, { itAdminEmployeeId: ha.employeeId }).expect(200);

    // IT Admin cannot appoint or end
    expect(
      errCode(
        await appoint(
          dept.id,
          { substituteEmployeeId: minh.employeeId, reason: 'Cover' },
          minh.account.accessToken,
        ).expect(403),
      ),
    ).toBe('AUTHORIZATION.FORBIDDEN');

    // Non-IT-Admin employee -> 422 NOT_USABLE_IT_ADMIN; missing department -> 404; in-charge -> 409
    expect(
      errCode(await appoint(dept.id, { substituteEmployeeId: plain.employeeId, reason: 'Cover' }).expect(422)),
    ).toBe('DEPARTMENT_IT_SUBSTITUTE.NOT_USABLE_IT_ADMIN');
    expect(
      errCode(await appoint(randomUUID(), { substituteEmployeeId: minh.employeeId, reason: 'Cover' }).expect(404)),
    ).toBe('DEPARTMENT.NOT_FOUND');
    expect(errCode(await appoint(dept.id, { substituteEmployeeId: ha.employeeId, reason: 'Cover' }).expect(409))).toBe(
      'DEPARTMENT_IT_SUBSTITUTE.IS_IN_CHARGE',
    );

    // Happy appoint -> 201 + audit
    const created = await appoint(dept.id, { substituteEmployeeId: minh.employeeId, reason: 'Ha on leave' }).expect(
      201,
    );
    const body = dataOf<{
      substitute: { id: string; endCause: string | null; substitute: { id: string; usable: boolean } };
      itAdminLoad: { employeeId: string; inChargeCount: number; substituteCount: number; overLimit: boolean };
    }>(created);
    expect(body.substitute.substitute).toMatchObject({ id: minh.employeeId, usable: true });
    expect(body.substitute.endCause).toBeNull();
    expect(body.itAdminLoad).toEqual({
      employeeId: minh.employeeId,
      inChargeCount: 0,
      substituteCount: 1,
      overLimit: false,
    });

    // Second active appoint -> 409 ALREADY_ACTIVE
    expect(
      errCode(await appoint(dept.id, { substituteEmployeeId: minh.employeeId, reason: 'Again' }).expect(409)),
    ).toBe('DEPARTMENT_IT_SUBSTITUTE.ALREADY_ACTIVE');

    // departmentGet shows itSubstitute and itCoverage = SUBSTITUTE
    const profile = dataOf<{ itCoverage: string; itSubstitute: { id: string; employee: { id: string } } | null }>(
      await getDepartment(dept.id).expect(200),
    );
    expect(profile.itCoverage).toBe('SUBSTITUTE');
    expect(profile.itSubstitute?.id).toBe(body.substitute.id);

    // List scoped to IT Admin
    const listForMinh = dataOf<{ items: { id: string }[] }>(
      await listSubstitutes(`?departmentId=${dept.id}&state=ACTIVE`, minh.account.accessToken).expect(200),
    );
    expect(listForMinh.items.map((item) => item.id)).toEqual([body.substitute.id]);

    // End -> 201 REMOVED, second end -> 409 ALREADY_ENDED, missing -> 404
    const ended = dataOf<{ endCause: string }>(await endSubstitute(body.substitute.id).expect(201));
    expect(ended.endCause).toBe('REMOVED');
    expect(errCode(await endSubstitute(body.substitute.id).expect(409))).toBe('DEPARTMENT_IT_SUBSTITUTE.ALREADY_ENDED');
    expect(errCode(await endSubstitute(randomUUID()).expect(404))).toBe('DEPARTMENT_IT_SUBSTITUTE.NOT_FOUND');

    const appointedNotices = await noticesFor(dept.id, 'DEPARTMENT_IT_SUBSTITUTE_APPOINTED');
    expect(appointedNotices.map((row) => row.recipient_employee_id).sort()).toEqual(
      [ha.employeeId, minh.employeeId].sort(),
    );
    expect(appointedNotices[0]).toMatchObject({
      event_key: `departmentItSubstituteAppointed:${body.substitute.id}`,
      params: {
        substituteId: body.substitute.id,
        departmentId: dept.id,
        substituteEmployeeId: minh.employeeId,
        replacedEmployeeId: ha.employeeId,
      },
    });
    const endedNotices = await noticesFor(dept.id, 'DEPARTMENT_IT_SUBSTITUTE_ENDED');
    expect(endedNotices.map((row) => row.recipient_employee_id).sort()).toEqual(
      [ha.employeeId, minh.employeeId].sort(),
    );
    expect(endedNotices[0]).toMatchObject({
      event_key: `departmentItSubstituteEnded:${body.substitute.id}`,
      params: {
        substituteId: body.substitute.id,
        departmentId: dept.id,
        substituteEmployeeId: minh.employeeId,
        endCause: 'REMOVED',
      },
    });
  });

  it('closes active substitute with IN_CHARGE_NAMED on non-null change, keeps on null, and closes DEPARTMENT_RETIRED on deactivate (W2-27 (c), (w))', async () => {
    const dept = await h.departmentWithUnit(code('CLS'));
    const it1 = await h.staff(dept, code('E-IT1'), 'IT_ADMIN');
    const it2 = await h.staff(dept, code('E-IT2'), 'IT_ADMIN');
    await updateDepartment(dept.id, { itAdminEmployeeId: it1.employeeId }).expect(200);

    const firstSub = dataOf<{ substitute: { id: string } }>(
      await appoint(dept.id, { substituteEmployeeId: it2.employeeId, reason: 'Leave' }).expect(201),
    ).substitute;

    // Setting itAdminEmployeeId to null keeps active substitute
    const afterNull = dataOf<{ itSubstitute: { id: string } | null; itAdminLoad: unknown }>(
      await updateDepartment(dept.id, { itAdminEmployeeId: null }).expect(200),
    );
    expect(afterNull.itSubstitute?.id).toBe(firstSub.id);
    expect(afterNull.itAdminLoad).toBeNull();

    // Naming non-null itAdminEmployeeId closes substitute with IN_CHARGE_NAMED
    const afterNamed = dataOf<{ itSubstitute: unknown; itCoverage: string; itAdminLoad: { employeeId: string } }>(
      await updateDepartment(dept.id, { itAdminEmployeeId: it1.employeeId }).expect(200),
    );
    expect(afterNamed.itSubstitute).toBeNull();
    expect(afterNamed.itCoverage).toBe('IN_CHARGE');
    expect(afterNamed.itAdminLoad.employeeId).toBe(it1.employeeId);
    expect(
      (
        await h.ctx.sql.query<{ end_cause: string }>('SELECT end_cause FROM department_it_substitutes WHERE id = $1', [
          firstSub.id,
        ])
      ).rows[0].end_cause,
    ).toBe('IN_CHARGE_NAMED');

    // Empty department deactivated closes active substitute with DEPARTMENT_RETIRED
    const emptyDept = dataOf<{ id: string }>(
      await request(h.server())
        .post('/api/v1/departments')
        .set({ Authorization: `Bearer ${h.admin}` })
        .send({ code: code('RET'), name: 'Retiring' })
        .expect(201),
    );
    const secondSub = dataOf<{ substitute: { id: string } }>(
      await appoint(emptyDept.id, { substituteEmployeeId: it2.employeeId, reason: 'Temp' }).expect(201),
    ).substitute;
    await request(h.server())
      .post(`/api/v1/departments/${emptyDept.id}/deactivate`)
      .set({ Authorization: `Bearer ${h.admin}` })
      .send({})
      .expect(200);
    expect(
      (
        await h.ctx.sql.query<{ end_cause: string }>('SELECT end_cause FROM department_it_substitutes WHERE id = $1', [
          secondSub.id,
        ])
      ).rows[0].end_cause,
    ).toBe('DEPARTMENT_RETIRED');
    expect(
      errCode(await appoint(emptyDept.id, { substituteEmployeeId: it2.employeeId, reason: 'After' }).expect(409)),
    ).toBe('DEPARTMENT_IT_SUBSTITUTE.DEPARTMENT_INACTIVE');

    const namedEndNotices = await noticesFor(dept.id, 'DEPARTMENT_IT_SUBSTITUTE_ENDED');
    expect(namedEndNotices).toEqual(
      arrayContaining([
        containing({
          recipient_employee_id: it2.employeeId,
          event_key: `departmentItSubstituteEnded:${firstSub.id}`,
          params: containing({ endCause: 'IN_CHARGE_NAMED' }),
        }),
      ]),
    );
    const retiredEndNotices = await noticesFor(emptyDept.id, 'DEPARTMENT_IT_SUBSTITUTE_ENDED');
    expect(retiredEndNotices).toEqual([
      containing({
        recipient_employee_id: it2.employeeId,
        event_key: `departmentItSubstituteEnded:${secondSub.id}`,
        params: containing({ endCause: 'DEPARTMENT_RETIRED' }),
      }),
    ]);
  });

  it('allows overLimit > 4 as soft warning on substitute appoint and departmentUpdate while keeping 4-dept hard cap for in-charge (W2-27 (p))', async () => {
    const base = await h.departmentWithUnit(code('CAP'));
    const minh = await h.staff(base, code('E-MINH-CAP'), 'IT_ADMIN');
    const lan = await h.staff(base, code('E-LAN-CAP'), 'IT_ADMIN');

    const minhDepts = await Promise.all([1, 2, 3, 4].map(() => h.departmentWithUnit(code('MC'))));
    for (const d of minhDepts) await updateDepartment(d.id, { itAdminEmployeeId: minh.employeeId }).expect(200);

    const fifth = await h.departmentWithUnit(code('M5'));
    expect(errCode(await updateDepartment(fifth.id, { itAdminEmployeeId: minh.employeeId }).expect(409))).toBe(
      'DEPARTMENT.IT_ADMIN_LIMIT_REACHED',
    );
    const minhLoad = dataOf<{ itAdminLoad: { inChargeCount: number; substituteCount: number; overLimit: boolean } }>(
      await appoint(fifth.id, { substituteEmployeeId: minh.employeeId, reason: 'Overflow cover' }).expect(201),
    ).itAdminLoad;
    expect(minhLoad).toEqual({ employeeId: minh.employeeId, inChargeCount: 4, substituteCount: 1, overLimit: true });

    const lanInCharge = await Promise.all([1, 2].map(() => h.departmentWithUnit(code('LI'))));
    const lanSubs = await Promise.all([1, 2].map(() => h.departmentWithUnit(code('LS'))));
    for (const d of lanInCharge) await updateDepartment(d.id, { itAdminEmployeeId: lan.employeeId }).expect(200);
    for (const d of lanSubs) await appoint(d.id, { substituteEmployeeId: lan.employeeId, reason: 'Sub' }).expect(201);

    const lanThird = await h.departmentWithUnit(code('L3'));
    const lanLoad = dataOf<{ itAdminLoad: { inChargeCount: number; substituteCount: number; overLimit: boolean } }>(
      await updateDepartment(lanThird.id, { itAdminEmployeeId: lan.employeeId }).expect(200),
    ).itAdminLoad;
    expect(lanLoad).toEqual({ employeeId: lan.employeeId, inChargeCount: 3, substituteCount: 2, overLimit: true });
  });

  it('resolves workDepartmentsOf (including leaver fallback), acting scope vs read scope, and itAdminsActingFor (S2-1, S2-2, S2-3)', async () => {
    const dept = await h.departmentWithUnit(code('SCP'));
    const leaver = await h.staff(dept, code('E-LVR'));
    const unplacedId = await insertEmployeeWithoutPlacement(h.ctx, h.seed, {
      code: code('E-UNP'),
      email: null,
    });
    const observer = await h.staff(dept, code('E-OBS'), 'IT_ADMIN');
    await h.ctx.sql.query(
      `UPDATE employee_placements SET valid_to = $2::date WHERE employee_id = $1 AND valid_to IS NULL`,
      [leaver.employeeId, h.today()],
    );

    const workMap = await organizationReads.workDepartmentsOf([leaver.employeeId, unplacedId], h.today());
    expect(workMap.get(leaver.employeeId)).toBe(dept.id);
    expect(workMap.has(unplacedId)).toBe(false);
    expect(await organizationReads.getEmployeeIdsOfWorkDepartments([dept.id], h.today())).toContain(leaver.employeeId);

    const usable = (ids: readonly string[]) => identityAccess.findUsableItAdminEmployeeIds(ids);
    const readScope = await organizationReads.getItAdminScope(observer.employeeId, usable);
    const actingScope = await organizationReads.getItAdminActingScope(observer.employeeId, usable);
    expect(readScope).toContain(dept.id);
    expect(actingScope).not.toContain(dept.id);

    const actingBefore = await organizationReads.itAdminsActingFor([dept.id], usable);
    expect(actingBefore.get(dept.id)?.actors).toEqual([]);
  });

  it('runs appoint X to D concurrently with X submitting Request for 20 rounds without 40P01 deadlock (S2-9)', async () => {
    const dept = await h.departmentWithUnit(code('CON'));
    const head = await h.staff(dept, code('E-HD'));
    await h.makeHead(dept, head);
    const planId = await h.plan('K5');
    const itUserCode = code('E-X');
    const itUserId = await h.member(dept.code, itUserCode, await h.title());
    const itUserAccount = await createActivatedAccount(h.ctx, h.seed, {
      code: itUserCode,
      email: `${itUserCode.toLowerCase()}@acme.vn`,
      role: 'IT_ADMIN',
      admin: h.admin,
      employeeId: itUserId,
    });

    for (let round = 0; round < 20; round += 1) {
      const targetDept = await h.departmentWithUnit(code('TD'));
      const [appointRes, submitRes] = await Promise.all([
        appoint(targetDept.id, { substituteEmployeeId: itUserId, reason: `Round ${round}` }),
        h.submit(
          { planId, beneficiaryEmployeeId: itUserId, businessReason: `Need ${round}`, termMonths: 1 },
          itUserAccount,
        ),
      ]);
      expect(appointRes.status).toBe(201);
      expect([201, 409, 422]).toContain(submitRes.status);
    }
  });

  it('alerts Super Admin once per weekday for uncovered non-starting departments and skips starting/covered/weekends (W2-27 i, S2-8)', async () => {
    const noInCharge = await h.departmentWithUnit(code('NOC'));
    const lockedInChargeDept = await h.departmentWithUnit(code('LIC'));
    const coveredBySubDept = await h.departmentWithUnit(code('SUB'));
    const lockedIt = await h.staff(lockedInChargeDept, code('E-LCK'), 'IT_ADMIN');
    const subIt = await h.staff(coveredBySubDept, code('E-SUBC'), 'IT_ADMIN');
    await updateDepartment(lockedInChargeDept.id, { itAdminEmployeeId: lockedIt.employeeId }).expect(200);
    await h.ctx.sql.query(`UPDATE app_users SET status = 'LOCKED' WHERE employee_id = $1`, [lockedIt.employeeId]);
    await appoint(coveredBySubDept.id, { substituteEmployeeId: subIt.employeeId, reason: 'Cover' }).expect(201);

    const startingDeptId = (
      await h.ctx.sql.query<{ id: string }>(`SELECT id FROM departments WHERE is_starting = true LIMIT 1`)
    ).rows[0]?.id;
    const superAdminId = (
      await h.ctx.sql.query<{ employee_id: string }>(
        `SELECT u.employee_id FROM app_users u
           JOIN role_grants g ON g.app_user_id = u.id AND g.role = 'SUPER_ADMIN' AND g.revoked_at IS NULL
          WHERE u.status = 'ACTIVE' AND u.activation_state = 'ACTIVATED' LIMIT 1`,
      )
    ).rows[0].employee_id;

    // Weekend pass does nothing
    const saturday = new Date('2026-11-28T03:00:00.000Z');
    expect(await itCoverageSweeps.run(saturday)).toEqual({ told: 0 });

    // First weekday pass notifies uncovered non-starting departments once
    const monday = new Date('2026-11-30T03:00:00.000Z');
    const firstPass = await itCoverageSweeps.run(monday);
    expect(firstPass.told).toBeGreaterThanOrEqual(2);

    const noIcNotices = await noticesFor(noInCharge.id, 'DEPARTMENT_IT_COVERAGE_MISSING');
    expect(noIcNotices).toEqual([
      containing({
        recipient_employee_id: superAdminId,
        event_key: `departmentItCoverage:${noInCharge.id}:2026-11-30`,
        params: containing({
          departmentId: noInCharge.id,
          inChargeEmployeeId: null,
          reason: 'NO_IN_CHARGE',
        }),
      }),
    ]);

    const lockedIcNotices = await noticesFor(lockedInChargeDept.id, 'DEPARTMENT_IT_COVERAGE_MISSING');
    expect(lockedIcNotices).toEqual([
      containing({
        recipient_employee_id: superAdminId,
        event_key: `departmentItCoverage:${lockedInChargeDept.id}:2026-11-30`,
        params: containing({
          departmentId: lockedInChargeDept.id,
          inChargeEmployeeId: lockedIt.employeeId,
          reason: 'IN_CHARGE_NOT_USABLE',
        }),
      }),
    ]);

    expect(await noticesFor(coveredBySubDept.id, 'DEPARTMENT_IT_COVERAGE_MISSING')).toEqual([]);
    if (startingDeptId) expect(await noticesFor(startingDeptId, 'DEPARTMENT_IT_COVERAGE_MISSING')).toEqual([]);

    // Second pass on the same weekday sends nothing new
    expect(await itCoverageSweeps.run(monday)).toEqual({ told: 0 });
  });
});
