import request from 'supertest';
import { bodyOf } from '../../support/api-body';
import { declareApplication, declarePlan } from '../../support/builders/catalog.builder';
import { Department, Person, RequestHarness } from '../../support/request-harness';

const h = new RequestHarness();

/**
 * Rejects employees who only have future department placements with 409 `EMPLOYEE.NOT_STARTED`
 * across request intake (individual submit, preview, proposal, draft, group check/submit),
 * licensing provisioning grants, and device handover registration.
 */
describe('BF-5 rejecting future-placed employees (integration, real PostgreSQL)', () => {
  let dept: Department;
  let startedStaff: Person;
  let futureStaff: Person;
  let internalPlanId: string;
  let seq = 0;

  const unique = (prefix: string): string => `${prefix} ${(seq += 1)}`;
  const server = () => h.server();

  beforeAll(async () => {
    await h.start();
    dept = await h.departmentWithUnit('BF5-DES');
    startedStaff = await h.staff(dept, 'BF5-S1');
    await h.setItAdminInCharge(dept, { employeeId: h.it1.employeeId, account: h.it1 });

    futureStaff = await h.unplacedStaff('BF5-FUT1');
    await h.ctx.sql.query(
      `INSERT INTO employee_placements (id, organization_id, employee_id, department_id, valid_from)
       VALUES (gen_random_uuid(), $1, $2, $3, ($4::date + 7))`,
      [h.seed.organizationId, futureStaff.employeeId, dept.id, h.today()],
    );

    const appId = await declareApplication(h.ctx, h.it1.accessToken, {
      name: unique('Internal Wiki BF5'),
      kind: 'INTERNAL',
      dataSensitivity: 'LOW',
    });
    internalPlanId = await declarePlan(h.ctx, h.it1.accessToken, {
      applicationId: appId,
      name: unique('Standard'),
      provisioningType: 'K5',
      controlLevel: 'FULL',
    });
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  it('rejects requests, previews, proposals, drafts, and group checks for a future-placed employee with 409 EMPLOYEE.NOT_STARTED', async () => {
    const beforeRequests = await h.requestRows();

    const submitRes = await h.submit(h.form(internalPlanId), futureStaff.account).expect(409);
    expect(h.codeOf(submitRes)).toBe('EMPLOYEE.NOT_STARTED');

    const previewRes = await h.previewRequest({ planId: internalPlanId }, futureStaff.account).expect(409);
    expect(h.codeOf(previewRes)).toBe('EMPLOYEE.NOT_STARTED');

    const proposeRes = await h.propose(h.proposeBody(), futureStaff.account).expect(409);
    expect(h.codeOf(proposeRes)).toBe('EMPLOYEE.NOT_STARTED');

    const draftSelfRes = await request(server())
      .post('/api/v1/access-requests/drafts')
      .set(h.as(futureStaff.account))
      .send({ kind: 'INDIVIDUAL', ...h.form(internalPlanId) })
      .expect(409);
    expect(bodyOf(draftSelfRes).error.code).toBe('EMPLOYEE.NOT_STARTED');

    const draftGroupRes = await request(server())
      .post('/api/v1/access-requests/drafts')
      .set(h.as(startedStaff.account))
      .send({
        kind: 'GROUP',
        ...h.form(internalPlanId),
        lines: [{ employeeId: startedStaff.employeeId }, { employeeId: futureStaff.employeeId }],
      })
      .expect(409);
    expect(bodyOf(draftGroupRes).error.code).toBe('EMPLOYEE.NOT_STARTED');

    const groupCheckRes = await request(server())
      .post('/api/v1/group-requests/check')
      .set(h.as(startedStaff.account))
      .send({
        ...h.form(internalPlanId),
        lines: [{ employeeId: startedStaff.employeeId }, { employeeId: futureStaff.employeeId }],
      })
      .expect(409);
    expect(bodyOf(groupCheckRes).error.code).toBe('EMPLOYEE.NOT_STARTED');

    const groupSubmitRes = await request(server())
      .post('/api/v1/group-requests')
      .set(h.as(startedStaff.account))
      .send({
        ...h.form(internalPlanId),
        lines: [{ employeeId: startedStaff.employeeId }, { employeeId: futureStaff.employeeId }],
      })
      .expect(409);
    expect(bodyOf(groupSubmitRes).error.code).toBe('EMPLOYEE.NOT_STARTED');

    expect(await h.requestRows()).toBe(beforeRequests);
  });

  it('rejects provisioning grant and device handover for a future-placed employee with 409 EMPLOYEE.NOT_STARTED', async () => {
    // A real request, approved while the person was placed; the placement then starts in the future, as when a start date is moved.
    const head = await h.staff(dept, 'BF5-H1');
    await h.makeHead(dept, head);
    const grantee = await h.staff(dept, 'BF5-G1');
    const sent = await h.sent(grantee, internalPlanId);
    await h.decide(sent.id, { decision: 'APPROVE' }, head.account).expect(200);
    await h.ctx.sql.query(`UPDATE employee_placements SET valid_from = ($2::date + 7) WHERE employee_id = $1`, [
      grantee.employeeId,
      h.today(),
    ]);

    const grantRes = await h.grant({ requestId: sent.id }).expect(409);
    expect(h.codeOf(grantRes)).toBe('EMPLOYEE.NOT_STARTED');

    const deviceRes = await request(server())
      .post('/api/v1/devices')
      .set(h.as(h.it1))
      .send({
        deviceType: 'LAP',
        hostname: 'BF5-LAP-01',
        os: 'Windows 11',
        holderEmployeeId: futureStaff.employeeId,
      })
      .expect(409);
    expect(h.codeOf(deviceRes)).toBe('EMPLOYEE.NOT_STARTED');

    const stockDeviceId = h.dataOf<{ id: string }>(
      await request(server())
        .post('/api/v1/devices')
        .set(h.as(h.it1))
        .send({
          deviceType: 'LAP',
          hostname: 'BF5-STOCK-01',
          os: 'Windows 11',
        })
        .expect(201),
    ).id;
    const holderChangeRes = await request(server())
      .post(`/api/v1/devices/${stockDeviceId}/holder-changes`)
      .set(h.as(h.it1))
      .send({
        holderEmployeeId: futureStaff.employeeId,
        collectorInstalled: false,
      })
      .expect(409);
    expect(h.codeOf(holderChangeRes)).toBe('EMPLOYEE.NOT_STARTED');
  });

  it('R1-2: allows an employee with both current and future placements (201) and keeps REQUEST_PARTY.INELIGIBLE / HOLDER_UNPLACED for never-placed employees', async () => {
    const futureDept = await h.departmentWithUnit('BF5-FIN');
    const transferringStaff = await h.staff(dept, 'BF5-TR1');
    await h.ctx.sql.query(
      `UPDATE employee_placements SET valid_to = ($2::date + 7) WHERE employee_id = $1 AND valid_to IS NULL`,
      [transferringStaff.employeeId, h.today()],
    );
    await h.ctx.sql.query(
      `INSERT INTO employee_placements (id, organization_id, employee_id, department_id, valid_from)
       VALUES (gen_random_uuid(), $1, $2, $3, ($4::date + 7))`,
      [h.seed.organizationId, transferringStaff.employeeId, futureDept.id, h.today()],
    );

    await h.submit(h.form(internalPlanId), transferringStaff.account).expect(201);

    const neverPlaced = await h.unplacedStaff('BF5-UNP1');
    // R1-2: a person with no placement at all is refused as a party of a Request (422), before the department is looked at: not NOT_STARTED.
    const noDeptRes = await h.submit(h.form(internalPlanId), neverPlaced.account).expect(422);
    expect(h.codeOf(noDeptRes)).toBe('REQUEST_PARTY.INELIGIBLE');

    const unplacedDeviceRes = await request(server())
      .post('/api/v1/devices')
      .set(h.as(h.it1))
      .send({
        deviceType: 'LAP',
        hostname: 'BF5-UNP-LAP',
        os: 'Windows 11',
        holderEmployeeId: neverPlaced.employeeId,
      })
      .expect(409);
    expect(h.codeOf(unplacedDeviceRes)).toBe('DEVICE.HOLDER_UNPLACED');
  });
});
