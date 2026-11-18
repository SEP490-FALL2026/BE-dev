import { Client } from 'pg';
import { DepartmentHarness, type DepartmentWire } from '../../support/department-harness';
import { waitForLockWaiters } from '../../support/lock-wait';

/**
 * One IT Admin answers for at most four active departments (`QĐ-110l`, `US-01-11`), counted after the employee row of the IT Admin is
 * locked `FOR UPDATE`, so two assignments made at the same moment cannot both pass (MIN-5). Real PostgreSQL over HTTP.
 */
describe('the limit of four departments per IT Admin over HTTP (integration, real PostgreSQL)', () => {
  const h = new DepartmentHarness();
  const { asAdmin, api, errorOf, dataOf, createDepartment, departmentBody, auditOf } = h;

  beforeAll(async () => {
    await h.start();
  }, 120000);

  // Each case starts with no department in the charge of either IT Admin.
  beforeEach(async () => {
    await h.ctx.sql.query('UPDATE departments SET it_admin_employee_id = NULL WHERE it_admin_employee_id = ANY($1)', [
      [h.it1.employeeId, h.it2.employeeId],
    ]);
  });

  afterEach(() => h.afterEach());

  afterAll(async () => {
    await h.stop();
  });

  /** `count` departments that name `itAdminEmployeeId` IT Admin in charge, made through the route. */
  const takeDepartments = async (itAdminEmployeeId: string, count: number): Promise<DepartmentWire[]> => {
    const created: DepartmentWire[] = [];
    for (let index = 0; index < count; index += 1) {
      created.push(dataOf(await createDepartment(departmentBody({ itAdminEmployeeId })).expect(201)));
    }

    return created;
  };

  const freeDepartment = async (): Promise<DepartmentWire> =>
    dataOf(await createDepartment(departmentBody()).expect(201));

  const assign = (departmentId: string, itAdminEmployeeId: string | null) =>
    api().patch(`/api/v1/departments/${departmentId}`).set(asAdmin()).send({ itAdminEmployeeId });

  const inCharge = async (employeeId: string): Promise<number> =>
    (
      await h.ctx.sql.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM departments WHERE it_admin_employee_id = $1 AND status = 'ACTIVE'`,
        [employeeId],
      )
    ).rows[0].n;

  it('takes four departments and refuses the fifth on create, with 409 and the limit, and writes nothing', async () => {
    await takeDepartments(h.it1.employeeId, 4);
    const before = await h.rowCount('departments');

    const refused = await createDepartment(departmentBody({ itAdminEmployeeId: h.it1.employeeId })).expect(409);

    expect(errorOf(refused)).toMatchObject({ code: 'DEPARTMENT.IT_ADMIN_LIMIT_REACHED', details: { limit: 4 } });
    expect(await h.rowCount('departments')).toBe(before);
  });

  it('refuses the fifth on a change of who is in charge, and leaves the department and its audit as they were', async () => {
    await takeDepartments(h.it2.employeeId, 4);
    const free = await freeDepartment();

    const refused = await assign(free.id, h.it2.employeeId).expect(409);

    expect(errorOf(refused).code).toBe('DEPARTMENT.IT_ADMIN_LIMIT_REACHED');
    expect((await h.getDepartment(free.id)).itAdmin).toBeNull();
    expect((await auditOf(free.id)).map((event) => event.action)).toEqual(['DEPARTMENT.CREATED']);
  });

  it('counts the departments in use only: releasing one, or retiring one, frees a place', async () => {
    const [first, second] = await takeDepartments(h.it1.employeeId, 4);
    const free = await freeDepartment();
    expect(errorOf(await assign(free.id, h.it1.employeeId).expect(409)).code).toBe('DEPARTMENT.IT_ADMIN_LIMIT_REACHED');

    // The IT Admin is taken off one department: a place is free, and the fifth department now takes them.
    await assign(first.id, null).expect(200);
    await assign(free.id, h.it1.employeeId).expect(200);
    expect(await inCharge(h.it1.employeeId)).toBe(4);
    expect(errorOf(await assign(first.id, h.it1.employeeId).expect(409)).code).toBe(
      'DEPARTMENT.IT_ADMIN_LIMIT_REACHED',
    );

    // A retired department no longer counts.
    await api().post(`/api/v1/departments/${second.id}/deactivate`).set(asAdmin()).send({}).expect(200);
    await assign(first.id, h.it1.employeeId).expect(200);
    expect(await inCharge(h.it1.employeeId)).toBe(4);
  });

  it('does not count the department an IT Admin already answers for: renaming it with the same IT Admin is not a fifth', async () => {
    const [first] = await takeDepartments(h.it1.employeeId, 4);

    await api()
      .patch(`/api/v1/departments/${first.id}`)
      .set(asAdmin())
      .send({ name: 'Renamed', itAdminEmployeeId: h.it1.employeeId })
      .expect(200);

    expect(await inCharge(h.it1.employeeId)).toBe(4);
  });

  it('lets only one of two assignments made at the same moment through when one place is left', async () => {
    await takeDepartments(h.it2.employeeId, 3);
    const first = await freeDepartment();
    const second = await freeDepartment();

    // The row of the IT Admin is held in another connection, so both requests reach it, wait, and then run one after the other.
    const holder = new Client({ connectionString: h.ctx.database.url });
    await holder.connect();
    try {
      await holder.query('BEGIN');
      await holder.query('SELECT id FROM employees WHERE id = $1 FOR UPDATE', [h.it2.employeeId]);
      const both = Promise.all([
        assign(first.id, h.it2.employeeId).then((response) => response),
        assign(second.id, h.it2.employeeId).then((response) => response),
      ]);
      await waitForLockWaiters(h.ctx.sql, 2);
      await holder.query('COMMIT');
      const statuses = (await both).map((response) => response.status).sort();

      expect(statuses).toEqual([200, 409]);
      expect(await inCharge(h.it2.employeeId)).toBe(4);
    } finally {
      await holder.query('ROLLBACK').catch(() => undefined);
      await holder.end();
    }
  });
});
