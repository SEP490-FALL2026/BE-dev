import { DepartmentHarness } from '../../support/department-harness';

describe('organization code formats (integration)', () => {
  const h = new DepartmentHarness();
  beforeAll(async () => h.start(), 120000);
  afterAll(async () => h.stop());

  it('normalizes department and employee codes before storing and looking them up', async () => {
    const department = await h.createDepartment(h.departmentBody({ code: ' p-eng ' })).expect(201);
    expect(h.dataOf(department).code).toBe('P-ENG');
    const employee = await h.enter(' p-eng ', { employeeCode: ' nv-001 ' });
    const rows = await h.ctx.sql.query<{ employee_code: string }>('SELECT employee_code FROM employees WHERE id = $1', [
      employee.employeeId,
    ]);
    expect(rows.rows[0].employee_code).toBe('NV-001');
  });

  it('rejects invalid department and employee codes', async () => {
    const invalid = await h.createDepartment(h.departmentBody({ code: 'bad_code' })).expect(422);
    expect(h.errorOf(invalid).code).toBe('DEPARTMENT.CODE_INVALID');
    const response = await h
      .api()
      .post('/api/v1/employees')
      .set(h.asAdmin())
      .send({
        employeeCode: 'x_',
        fullName: 'Name',
        employmentType: 'STAFF',
        hireDate: '2026-10-01',
        departmentCode: 'bad_',
      })
      .expect(422);
    expect(response.body.error.details.reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'EMPLOYEE_CODE_INVALID' }),
        expect.objectContaining({ code: 'DEPARTMENT_CODE_INVALID' }),
      ]),
    );
  });
});
