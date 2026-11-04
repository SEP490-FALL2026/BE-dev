import { DepartmentHarness, today, addDays } from '../../support/department-harness';

describe('department profiles, heads and the MANAGER role over HTTP (integration, real PostgreSQL): the head as MANAGER, what the IT Admin reads', () => {
  const h = new DepartmentHarness();
  const {
    asFinance,
    asIt,
    asAdmin,
    as,
    api,
    errorOf,
    dataOf,
    newDepartment,
    getDepartment,
    enter,
    accountIn,
    assignHead,
    grantManager,
    meOf,
  } = h;

  beforeAll(async () => {
    await h.start();
  }, 120000);

  afterEach(() => h.afterEach());

  afterAll(async () => {
    await h.stop();
  });

  describe('MANAGER is granted, and counts only for as long as the person heads a department (US-01-02, QĐ-93a)', () => {
    const scopeOf = async (account: Parameters<typeof meOf>[0]) =>
      (await meOf(account)).managerScope?.departmentId ?? null;

    it('gives the powers from the day the period begins and takes them back when the period ends, the grant staying (AC-2, AC-3)', async () => {
      const department = await newDepartment();
      const first = await accountIn(department.code);
      const second = await accountIn(department.code);
      await grantManager(first.employeeId);
      await grantManager(second.employeeId);
      expect(await scopeOf(first)).toBeNull();
      await assignHead(department.id, first.employeeId).expect(200);
      expect(await scopeOf(first)).toBe(department.id);

      // The next head is named for three days ahead: until then nothing changes for either.
      await assignHead(department.id, second.employeeId, addDays(today(), 3)).expect(200);
      expect(await scopeOf(first)).toBe(department.id);
      expect(await scopeOf(second)).toBeNull();

      // Three days pass: the periods slide back by four days, so the first ended yesterday and the second began yesterday.
      // The members have been in the department that long too, or the database would refuse the earlier periods.
      await h.ctx.sql.query('UPDATE employee_placements SET valid_from = valid_from - 10 WHERE department_id = $1', [
        department.id,
      ]);
      await h.ctx.sql.query(
        `UPDATE department_head_periods SET valid_from = valid_from - 4, valid_to = valid_to - 4
          WHERE department_id = $1 AND valid_to IS NOT NULL`,
        [department.id],
      );
      await h.ctx.sql.query(
        `UPDATE department_head_periods SET valid_from = valid_from - 4 WHERE department_id = $1 AND valid_to IS NULL`,
        [department.id],
      );
      expect(await scopeOf(first)).toBeNull();
      expect(await scopeOf(second)).toBe(department.id);
      // The one whose period ended keeps the role as a grant and has no scope: they hold MANAGER and head nothing (AC-3).
      expect((await meOf(first)).roles).toEqual(['MANAGER']);
      // The members did not change when the head did.
      expect((await getDepartment(department.id)).memberCount).toBe(2);
      // The one who lost the scope cannot use a Manager route (AC-3).
      await api().get(`/api/v1/departments/${department.id}`).set(as(first)).expect(403);
      await api().get(`/api/v1/departments/${department.id}`).set(as(second)).expect(200);
      // Put the members back as they were recorded, so the coverage check at the end still holds.
      await h.ctx.sql.query('DELETE FROM department_head_periods WHERE department_id = $1', [department.id]);
      await h.ctx.sql.query('UPDATE employee_placements SET valid_from = valid_from + 10 WHERE department_id = $1', [
        department.id,
      ]);
    });

    it('is selfServiceOnly until the person holds a role, and heading a department gives none', async () => {
      const department = await newDepartment();
      const member = await accountIn(department.code);
      const before = await meOf(member);
      await grantManager(member.employeeId);
      const granted = await meOf(member);
      await assignHead(department.id, member.employeeId).expect(200);
      const heading = await meOf(member);

      expect(before).toMatchObject({ roles: [], managerScope: null });
      // MANAGER held, heading nothing yet: a role, so not selfServiceOnly, and no scope.
      expect(granted).toMatchObject({ roles: ['MANAGER'], managerScope: null });
      expect(heading).toMatchObject({
        roles: ['MANAGER'],
        managerScope: { departmentId: department.id, departmentCode: department.code },
      });
    });

    it('gives no scope to a head who was never granted MANAGER, whatever the data says', async () => {
      const department = await newDepartment();
      const member = await accountIn(department.code);
      // Written by SQL on purpose: the application refuses a head without MANAGER (US-03-06 AC-23), so only a defect can produce it.
      await h.ctx.sql.query(
        `INSERT INTO department_head_periods (id, organization_id, department_id, employee_id, valid_from)
         VALUES (gen_random_uuid(), $1, $2, $3, $4::date)`,
        [h.seed.organizationId, department.id, member.employeeId, today()],
      );

      expect(await meOf(member)).toMatchObject({ roles: [], managerScope: null });
      await api().get(`/api/v1/departments/${department.id}`).set(as(member)).expect(403);
      await h.ctx.sql.query('DELETE FROM department_head_periods WHERE employee_id = $1', [member.employeeId]);
    });

    it('never gives the role to the Super Admin, even if the data says they head a department (FR-8.7)', async () => {
      const department = await newDepartment();
      // Written by SQL on purpose: the application refuses it, so only a defect or a hand edit can produce it.
      await h.ctx.sql.query(
        `INSERT INTO department_head_periods (id, organization_id, department_id, employee_id, valid_from)
         VALUES (gen_random_uuid(), $1, $2, $3, '2026-02-01')`,
        [h.seed.organizationId, h.seed.departmentId, h.seed.superAdmin.employeeId],
      );

      const me = await api().get('/api/v1/me').set(asAdmin()).expect(200);

      expect((me.body as { data: { roles: string[]; managerScope: unknown } }).data).toMatchObject({
        roles: ['SUPER_ADMIN'],
        managerScope: null,
      });
      await h.ctx.sql.query('DELETE FROM department_head_periods WHERE employee_id = $1', [
        h.seed.superAdmin.employeeId,
      ]);
      expect(department.status).toBe('ACTIVE');
    });

    it('shows the head their own department and its people, and nobody else’s (AC-17, AC-7 of US-01-02)', async () => {
      const department = await newDepartment();
      const other = await newDepartment();
      const head = await accountIn(department.code);
      const colleague = await enter(department.code, { workEmail: null });
      await enter(other.code);
      await assignHead(department.id, head.employeeId).expect(200);

      const own = await api().get(`/api/v1/departments/${department.id}`).set(as(head)).expect(200);
      const foreign = await api().get(`/api/v1/departments/${other.id}`).set(as(head)).expect(403);
      const list = await api()
        .get(`/api/v1/departments/${department.id}/employees?pageSize=100`)
        .set(as(head))
        .expect(200);
      const foreignList = await api().get(`/api/v1/departments/${other.id}/employees`).set(as(head)).expect(403);

      expect(dataOf(own).memberCount).toBe(2);
      expect(errorOf(foreign).code).toBe('DEPARTMENT.OUT_OF_SCOPE');
      expect(errorOf(foreignList).code).toBe('DEPARTMENT.OUT_OF_SCOPE');
      const items = (list.body as { data: { items: Record<string, unknown>[] } }).data.items;
      expect(items.map((item) => item.employeeCode)).toEqual([head.code, colleague.code].sort());
      for (const item of items) {
        expect(Object.keys(item).sort()).toEqual([
          'employeeCode',
          'employeeId',
          'fullName',
          'hasWorkEmail',
          'memberSince',
          'status',
          'workState',
        ]);
      }
      expect(items.find((item) => item.employeeCode === colleague.code)).toMatchObject({
        hasWorkEmail: false,
        memberSince: today(),
        status: 'ACTIVE',
      });
      // The head is one of the people in the department (AC-9).
      expect(items.some((item) => item.employeeCode === head.code)).toBe(true);
    });

    it('does not let Finance or an employee read a department or its people, nor the IT Admin read its people in full (AC-7, F12)', async () => {
      const department = await newDepartment();
      const employee = await accountIn('P-OPS');

      for (const headers of [asFinance(), as(employee)]) {
        await api().get(`/api/v1/departments/${department.id}/employees`).set(headers).expect(403);
        await api().get(`/api/v1/departments/${department.id}`).set(headers).expect(403);
        await api().get(`/api/v1/departments/${department.id}/technical-members`).set(headers).expect(403);
      }
      await api().get(`/api/v1/departments/${department.id}/employees`).set(asIt()).expect(403);
    });

    it('lets the Super Admin read any department and its people in full (QĐ-87b(4), F12)', async () => {
      const department = await newDepartment({ itAdminEmployeeId: h.it2.employeeId });
      const member = await enter(department.code);

      const profile = await api().get(`/api/v1/departments/${department.id}`).set(asAdmin()).expect(200);
      const people = await api().get(`/api/v1/departments/${department.id}/employees`).set(asAdmin()).expect(200);

      expect(dataOf(profile).id).toBe(department.id);
      const items = (people.body as { data: { items: { employeeCode: string }[] } }).data.items;
      expect(items.map((item) => item.employeeCode)).toEqual([member.code]);
    });

    describe('the IT Admin reads only the departments they are in charge of or stand in for, and only the minimum (F12)', () => {
      it('reads the technical view of the people of a department they are in charge of: no grounds, email or hire date', async () => {
        const department = await newDepartment({ itAdminEmployeeId: h.it1.employeeId });
        const member = await enter(department.code);

        const response = await api()
          .get(`/api/v1/departments/${department.id}/technical-members`)
          .set(asIt())
          .expect(200);

        const page = (
          response.body as { message: string; data: { items: Record<string, unknown>[]; pagination: unknown } }
        ).data;
        expect((response.body as { message: string }).message).toBe('DEPARTMENT.TECHNICAL_MEMBERS_LISTED');
        expect(page.items).toEqual([
          {
            id: member.employeeId,
            code: member.code,
            fullName: `Person ${member.code}`,
            departmentId: department.id,
            employmentStatus: 'WORKING',
            effectiveOn: today(),
          },
        ]);
        expect(page.pagination).toEqual({ page: 1, pageSize: 20, totalItems: 1, totalPages: 1 });
        expect(response.text).not.toMatch(/workEmail|hasWorkEmail|hireDate|employmentType|grounds/);
      });

      it('answers 404 for a department another IT Admin is in charge of, as if it did not exist, in every read', async () => {
        const theirs = await newDepartment({ itAdminEmployeeId: h.it2.employeeId });
        await enter(theirs.code);

        for (const path of [`/departments/${theirs.id}`, `/departments/${theirs.id}/technical-members`]) {
          const response = await api().get(`/api/v1${path}`).set(asIt()).expect(404);
          expect(errorOf(response).code).toBe('DEPARTMENT.NOT_FOUND');
        }
        // The list and the warnings do not name it either.
        const list = await api().get(`/api/v1/departments?search=${theirs.code}`).set(asIt()).expect(200);
        expect((list.body as { data: { items: unknown[] } }).data.items).toEqual([]);
        // ...while the Super Admin and the IT Admin in charge read it.
        await api().get(`/api/v1/departments/${theirs.id}`).set(asAdmin()).expect(200);
        await api().get(`/api/v1/departments/${theirs.id}`).set(as(h.it2)).expect(200);
      });

      it('stands in for a department nobody usable is in charge of, so the shared queue can be worked', async () => {
        const unattended = await newDepartment();
        await enter(unattended.code);

        await api().get(`/api/v1/departments/${unattended.id}`).set(asIt()).expect(200);
        const people = await api()
          .get(`/api/v1/departments/${unattended.id}/technical-members`)
          .set(asIt())
          .expect(200);

        expect((people.body as { data: { items: unknown[] } }).data.items).toHaveLength(1);
      });

      it('is told by the service, not only by the route: a caller with no reading role gets the same 403 as the guard', async () => {
        const department = await newDepartment();
        const employee = await accountIn('P-OPS');

        const response = await api()
          .get(`/api/v1/departments/${department.id}/technical-members`)
          .set(as(employee))
          .expect(403);

        expect(errorOf(response).code).toBe('AUTHORIZATION.FORBIDDEN');
      });
    });
  });

  it('leaves every employee with exactly the placements the invariant I-2 asks for', async () => {
    expect(await h.placementViolations()).toEqual([]);
  });
});
