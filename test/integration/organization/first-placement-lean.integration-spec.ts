import { OrganizationReadApi } from '../../../src/modules/organization/public/organization-read.api';
import { createActivatedAccount } from '../../support/api-accounts';
import { DepartmentHarness } from '../../support/department-harness';

describe('first placement (integration)', () => {
  const h = new DepartmentHarness();
  beforeAll(async () => h.start(), 120000);
  afterAll(async () => h.stop());

  it('creates an unplaced person and places them once', async () => {
    const department = h.dataOf(await h.createDepartment(h.departmentBody({ code: 'P-LEAN' })).expect(201));
    const response = await h
      .api()
      .post('/api/v1/employees')
      .set(h.asAdmin())
      .send({
        employeeCode: 'NV-LEAN',
        workEmail: 'lean@acme.vn',
        fullName: 'Unplaced',
        employmentType: 'STAFF',
        hireDate: '2020-01-01',
        departmentCode: null,
      })
      .expect(201);
    const person = (response.body as { data: { id: string; department: unknown; unplaced: boolean } }).data;
    expect(person).toMatchObject({ department: null, unplaced: true });
    expect(
      (await h.ctx.sql.query('SELECT id FROM employee_placements WHERE employee_id = $1', [person.id])).rowCount,
    ).toBe(0);
    const account = await createActivatedAccount(h.ctx, h.seed, {
      employeeId: person.id,
      code: 'NV-LEAN',
      email: 'lean@acme.vn',
      role: 'EMPLOYEE',
      admin: h.admin,
    });
    const me = await h.api().get('/api/v1/me').set(h.as(account)).expect(200);
    expect((me.body as { data: { employee: { unplaced: boolean } } }).data.employee.unplaced).toBe(true);
    const requestBody = {
      planId: '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11',
      businessReason: 'A valid business reason',
    };
    const denied = await h.api().post('/api/v1/access-requests').set(h.as(account)).send(requestBody).expect(422);
    expect(h.errorOf(denied)).toMatchObject({ code: 'REQUEST_PARTY.INELIGIBLE', details: { reason: 'UNPLACED' } });
    const previewDenied = await h
      .api()
      .post('/api/v1/access-requests/preview')
      .set(h.as(account))
      .send({ planId: requestBody.planId })
      .expect(422);
    expect(h.errorOf(previewDenied)).toMatchObject({
      code: 'REQUEST_PARTY.INELIGIBLE',
      details: { reason: 'UNPLACED' },
    });
    const today = await h.ctx.app.get(OrganizationReadApi).businessToday();
    const head = await h.assignHeadRaw(department.id, person.id, today);
    expect(head.status).toBeGreaterThanOrEqual(400);
    expect(head.status).toBeLessThan(500);
    const badDate = await h
      .api()
      .post(`/api/v1/employees/${person.id}/first-placements`)
      .set(h.asAdmin())
      .send({ departmentId: department.id, effectiveFrom: '2000-01-01' })
      .expect(422);
    expect(h.errorOf(badDate).code).toBe('EMPLOYEE.DATE_INVALID');
    await h
      .api()
      .post(`/api/v1/employees/${person.id}/first-placements`)
      .set(h.asAdmin())
      .send({ departmentId: '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11', effectiveFrom: today })
      .expect(404);

    const placed = await h
      .api()
      .post(`/api/v1/employees/${person.id}/first-placements`)
      .set(h.asAdmin())
      .send({ departmentId: department.id, effectiveFrom: today })
      .expect(201);
    expect((placed.body as { data: { unplaced: boolean } }).data.unplaced).toBe(false);
    const after = await h.api().post('/api/v1/access-requests').set(h.as(account)).send(requestBody);
    expect(h.errorOf(after)?.details?.reason).not.toBe('UNPLACED');
    const twice = await h
      .api()
      .post(`/api/v1/employees/${person.id}/first-placements`)
      .set(h.asAdmin())
      .send({ departmentId: department.id, effectiveFrom: today })
      .expect(409);
    expect(h.errorOf(twice).code).toBe('EMPLOYEE.ALREADY_PLACED');
  });
  it('imports a person with no department', async () => {
    const csv =
      'employee_code,full_name,work_email,employment_type,hire_date,department_code,job_title\nNV-IMPORT,Import Person,,STAFF,2020-01-01,,\n';
    const uploaded = await h
      .api()
      .post('/api/v1/employee-imports')
      .set(h.asAdmin())
      .attach('file', Buffer.from(csv), 'people.csv')
      .expect(201);
    const preview = (
      uploaded.body as { data: { id: string; previewVersion: number; summary: { newUnplaced: number } } }
    ).data;
    expect(preview.summary.newUnplaced).toBe(1);
    const listed = await h.api().get(`/api/v1/employee-imports/${preview.id}/rows`).set(h.asAdmin()).expect(200);
    expect((listed.body as { data: { items: { unplaced: boolean | null }[] } }).data.items[0].unplaced).toBe(true);
    await h
      .api()
      .post(`/api/v1/employee-imports/${preview.id}/confirmations`)
      .set(h.asAdmin())
      .send({
        previewVersion: preview.previewVersion,
        idempotencyKey: 'unplaced-test-1',
        acknowledgeDuplicateFile: false,
      })
      .expect(200);
    const rows = await h.ctx.sql.query<{ id: string }>("SELECT id FROM employees WHERE employee_code = 'NV-IMPORT'");
    expect(rows.rowCount).toBe(1);
    expect(
      (await h.ctx.sql.query('SELECT id FROM employee_placements WHERE employee_id = $1', [rows.rows[0].id])).rowCount,
    ).toBe(0);
  });
  it('serializes simultaneous first placements', async () => {
    const department = h.dataOf(await h.createDepartment(h.departmentBody({ code: 'P-RACE' })).expect(201));
    const response = await h
      .api()
      .post('/api/v1/employees')
      .set(h.asAdmin())
      .send({ employeeCode: 'NV-RACE', fullName: 'Race', employmentType: 'STAFF', hireDate: '2020-01-01' })
      .expect(201);
    const id = (response.body as { data: { id: string } }).data.id;
    const today = await h.ctx.app.get(OrganizationReadApi).businessToday();
    const requests = [1, 2].map(() =>
      h
        .api()
        .post(`/api/v1/employees/${id}/first-placements`)
        .set(h.asAdmin())
        .send({ departmentId: department.id, effectiveFrom: today }),
    );
    const answers = await Promise.all(requests);
    expect(answers.map((answer) => answer.status).sort()).toEqual([201, 409]);
    expect((await h.ctx.sql.query('SELECT id FROM employee_placements WHERE employee_id = $1', [id])).rowCount).toBe(1);
  });
});
