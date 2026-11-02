import { insertEmployeeFixture } from '../../support/http-test-app';
import { HR_BASIS } from '../../support/hr-basis';
import { DepartmentHarness, type DepartmentWire, today } from '../../support/department-harness';

describe('department profiles, heads and the MANAGER role over HTTP (integration, real PostgreSQL): creating, keeping, listing and retiring a profile', () => {
  const h = new DepartmentHarness();
  const {
    asFinance,
    asIt,
    asAdmin,
    as,
    api,
    unique,
    errorOf,
    dataOf,
    messageOf,
    createCostCenterFor,
    departmentBody,
    createDepartment,
    newDepartment,
    getDepartment,
    enter,
    accountIn,
    assignHead,
    auditOf,
    closePlacements,
    rowCount,
  } = h;

  beforeAll(async () => {
    await h.start();
  }, 120000);

  afterEach(() => h.afterEach());

  afterAll(async () => {
    await h.stop();
  });

  describe('creating a department (US-03-06 AC-1 → AC-3, QĐ-87d(1))', () => {
    it('creates one with no Cost Center, with who is in charge, records the HR basis, and shows the Cost Center Finance then creates for it (AC-1)', async () => {
      const body = departmentBody({
        name: '  Thiết kế ',
        function: 'thiết kế sản phẩm',
        itAdminEmployeeId: h.it1.employeeId,
      });

      const response = await createDepartment(body).expect(201);

      expect(messageOf(response)).toBe('DEPARTMENT.CREATED');
      expect(dataOf(response)).toMatchObject({
        code: body.code,
        name: 'Thiết kế',
        function: 'thiết kế sản phẩm',
        status: 'ACTIVE',
        costCenter: null,
        itAdmin: { employeeId: h.it1.employeeId, usable: true },
        head: null,
        memberCount: 0,
        warnings: ['MISSING_HEAD', 'MISSING_COST_CENTER'],
        successor: null,
        headHistory: [],
        headHistoryHasMore: false,
        projects: [],
        projectTotal: 0,
      });
      expect(await auditOf(dataOf(response).id)).toEqual([
        {
          action: 'DEPARTMENT.CREATED',
          before: null,
          after: {
            code: body.code,
            name: 'Thiết kế',
            function: 'thiết kế sản phẩm',
            itAdminEmployeeId: h.it1.employeeId,
          },
        },
      ]);

      // Finance creates the Cost Center FOR the department: it is the department's current one from then on.
      const costCenter = await createCostCenterFor(dataOf(response).id);
      expect((await getDepartment(dataOf(response).id)).costCenter).toMatchObject({
        id: costCenter.id,
        code: costCenter.code,
        status: 'ACTIVE',
      });
      const centers = await api().get(`/api/v1/cost-centers?search=${costCenter.code}`).set(asFinance()).expect(200);
      expect(
        (centers.body as { data: { items: { department: { code: string } | null }[] } }).data.items[0].department,
      ).toMatchObject({ code: body.code });
    });

    it("is the Super Admin's and takes no Cost Center and no HR basis: anything else is turned back and nothing is created (QĐ-87b, QĐ-87d(1), QĐ-93f)", async () => {
      const before = await rowCount('departments');

      // A body that names a Cost Center, or still cites an HR basis, is not a body of this operation.
      const named = await createDepartment({
        ...departmentBody(),
        costCenterId: '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11',
      });
      const withBasis = await createDepartment(departmentBody({ hrBasis: HR_BASIS }));
      expect([named.status, withBasis.status]).toEqual([422, 422]);
      expect([errorOf(named).code, errorOf(withBasis).code]).toEqual(['VALIDATION_ERROR', 'VALIDATION_ERROR']);

      // Only the Super Admin creates a department: not the IT Admin, not Finance.
      expect((await createDepartment(departmentBody(), asIt())).status).toBe(403);
      expect((await createDepartment(departmentBody(), asFinance())).status).toBe(403);

      expect(await rowCount('departments')).toBe(before);
    });

    it('keeps the code unique, refuses a name that is empty and, by the schema, one that is too long', async () => {
      const first = await newDepartment();

      const taken = await createDepartment(departmentBody({ code: first.code })).expect(409);
      const blank = await createDepartment(departmentBody({ name: '   ' })).expect(422);
      const long = await createDepartment(departmentBody({ name: 'N'.repeat(201) })).expect(422);

      expect(errorOf(taken).code).toBe('DEPARTMENT.CODE_TAKEN');
      expect(errorOf(blank).code).toBe('DEPARTMENT.NAME_INVALID');
      expect(errorOf(long).code).toBe('VALIDATION_ERROR');
    });

    it('refuses an IT Admin in charge who is not an IT Admin who can sign in (US-01-11)', async () => {
      const noAccount = await enter('P-OPS');

      for (const itAdminEmployeeId of [noAccount.employeeId, h.finance.employeeId, h.seed.superAdmin.employeeId]) {
        const response = await createDepartment(departmentBody({ itAdminEmployeeId })).expect(422);
        expect(errorOf(response).code).toBe('DEPARTMENT.IT_ADMIN_INVALID');
      }
      const left = await insertEmployeeFixture(h.ctx.app, h.seed, {
        code: unique('E-LEFT'),
        email: null,
        terminated: true,
      });
      await closePlacements(left.employeeId);
      const response = await createDepartment(departmentBody({ itAdminEmployeeId: left.employeeId })).expect(422);
      expect(errorOf(response).code).toBe('DEPARTMENT.IT_ADMIN_INVALID');
    });

    it('warns about a department with no IT Admin in charge, and about one with no head (AC-9, AC-15)', async () => {
      const created = await newDepartment();

      expect(created.itAdmin).toBeNull();
      expect(created.warnings.sort()).toEqual(['MISSING_HEAD', 'MISSING_IT_ADMIN']);
    });
  });

  describe('keeping the profile (AC-4, US-01-11 AC-7)', () => {
    it('renames, redescribes and changes who is in charge without touching the cost center or the members, and records before and after', async () => {
      const department = await newDepartment({ function: 'old duty', itAdminEmployeeId: h.it1.employeeId });
      const member = await enter(department.code);

      const response = await api()
        .patch(`/api/v1/departments/${department.id}`)
        .set(asAdmin())
        .send({ name: 'Sáng tạo', function: 'new duty', itAdminEmployeeId: h.it2.employeeId })
        .expect(200);

      expect(messageOf(response)).toBe('DEPARTMENT.UPDATED');
      expect(dataOf(response)).toMatchObject({
        name: 'Sáng tạo',
        function: 'new duty',
        itAdmin: { employeeId: h.it2.employeeId },
        costCenter: { id: department.costCenter?.id },
        memberCount: 1,
      });
      expect(
        (
          await h.ctx.sql.query(
            'SELECT 1 FROM employee_placements p JOIN employees e ON e.id = p.employee_id WHERE e.id = $1 AND p.department_id = $2',
            [member.employeeId, department.id],
          )
        ).rows,
      ).toHaveLength(1);
      expect((await auditOf(department.id))[1]).toEqual({
        action: 'DEPARTMENT.UPDATED',
        before: { name: 'Design', function: 'old duty', itAdminEmployeeId: h.it1.employeeId },
        after: { name: 'Sáng tạo', function: 'new duty', itAdminEmployeeId: h.it2.employeeId },
      });
    });

    it('can clear the IT Admin in charge, which brings the warning back (AC-15)', async () => {
      const department = await newDepartment({ itAdminEmployeeId: h.it1.employeeId });
      expect(department.warnings).not.toContain('MISSING_IT_ADMIN');

      const response = await api()
        .patch(`/api/v1/departments/${department.id}`)
        .set(asAdmin())
        .send({ itAdminEmployeeId: null })
        .expect(200);

      expect(dataOf(response).itAdmin).toBeNull();
      expect(dataOf(response).warnings).toContain('MISSING_IT_ADMIN');
    });

    it('answers a change that changes nothing with the profile and records nothing', async () => {
      const department = await newDepartment();

      await api()
        .patch(`/api/v1/departments/${department.id}`)
        .set(asAdmin())
        .send({ name: `  ${department.name} ` })
        .expect(200);

      expect(await auditOf(department.id)).toHaveLength(1);
    });

    it('refuses an empty change, a name that is empty, and an IT Admin who cannot be one', async () => {
      const department = await newDepartment();
      const patch = (body: object) => api().patch(`/api/v1/departments/${department.id}`).set(asAdmin()).send(body);

      expect(errorOf(await patch({}).expect(422)).code).toBe('DEPARTMENT.UPDATE_EMPTY');
      expect(errorOf(await patch({ name: ' ' }).expect(422)).code).toBe('DEPARTMENT.NAME_INVALID');
      expect(errorOf(await patch({ itAdminEmployeeId: h.finance.employeeId }).expect(422)).code).toBe(
        'DEPARTMENT.IT_ADMIN_INVALID',
      );
      expect(await auditOf(department.id)).toHaveLength(1);
    });

    it('is 404 for a department that does not exist', async () => {
      const response = await api()
        .patch('/api/v1/departments/3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11')
        .set(asAdmin())
        .send({ name: 'x' })
        .expect(404);

      expect(errorOf(response).code).toBe('DEPARTMENT.NOT_FOUND');
    });

    it('refuses Finance, an employee, a department head and the IT Admin, and changes nothing (AC-16, F10)', async () => {
      const department = await newDepartment();
      const head = await accountIn(department.code);
      await assignHead(department.id, head.employeeId).expect(200);
      const employee = await accountIn('P-OPS');

      for (const headers of [asFinance(), as(employee), as(head), asIt()]) {
        await api().patch(`/api/v1/departments/${department.id}`).set(headers).send({ name: 'Hacked' }).expect(403);
        await assignHead(department.id, employee.employeeId, today(), headers).expect(403);
      }
      // Creating a department is the Super Admin's (QĐ-87b): everyone else is refused, the IT Admin included.
      for (const headers of [asFinance(), as(employee), as(head), asIt()]) {
        await createDepartment(departmentBody(), headers).expect(403);
      }

      expect((await getDepartment(department.id)).name).toBe('Design');
    });

    it('takes every change with no HR basis, and refuses one that still cites it: 422 and nothing written (QĐ-93f)', async () => {
      const department = await newDepartment();
      const bases = [HR_BASIS, { ...HR_BASIS, reference: undefined }, {}];

      for (const hrBasis of bases) {
        const response = await api()
          .patch(`/api/v1/departments/${department.id}`)
          .set(asAdmin())
          .send({ name: 'With basis', hrBasis })
          .expect(422);
        expect(errorOf(response).code).toBe('VALIDATION_ERROR');
        await api()
          .post(`/api/v1/departments/${department.id}/deactivate`)
          .set(asAdmin())
          .send({ hrBasis })
          .expect(422);
        await api()
          .post(`/api/v1/departments/${department.id}/head-vacancies`)
          .set(asAdmin())
          .send({ effectiveFrom: today(), hrBasis })
          .expect(422);
      }

      expect(await auditOf(department.id)).toHaveLength(1);
      expect((await getDepartment(department.id)).name).toBe('Design');
    });

    it('changes a department with no HR basis and records who, when and before/after, without the key hrBasis; a retired one refuses with 409 (QĐ-93f(1), US-03-06 AC-22, API-DOC-F05)', async () => {
      const department = await newDepartment();

      await api().patch(`/api/v1/departments/${department.id}`).set(asAdmin()).send({ name: 'Renamed' }).expect(200);

      expect((await auditOf(department.id))[1]).toEqual({
        action: 'DEPARTMENT.UPDATED',
        before: { name: 'Design' },
        after: { name: 'Renamed' },
      });
      const row = await h.ctx.sql.query<{ actor_kind: string; actor_app_user_id: string | null; occurred_at: Date }>(
        `SELECT actor_kind, actor_app_user_id, occurred_at FROM audit_events WHERE resource_id = $1 AND action = 'DEPARTMENT.UPDATED'`,
        [department.id],
      );
      expect(row.rows).toHaveLength(1);
      expect(row.rows[0].actor_app_user_id).not.toBeNull();
      expect(row.rows[0].occurred_at).toBeInstanceOf(Date);

      await api().post(`/api/v1/departments/${department.id}/deactivate`).set(asAdmin()).expect(200);
      const events = (await auditOf(department.id)).length;
      const refused = await api()
        .patch(`/api/v1/departments/${department.id}`)
        .set(asAdmin())
        .send({ name: 'After retirement' })
        .expect(409);
      expect(errorOf(refused).code).toBe('DEPARTMENT.INACTIVE');
      expect(await auditOf(department.id)).toHaveLength(events);
    });

    it('measures name and function after composing accents: 200 and 1 000 characters pass (the name typed in NFD is stored composed), one more does not (API-DOC-F05)', async () => {
      const decomposed = '\u0061\u0301'.repeat(200);

      const created = await createDepartment(departmentBody({ name: decomposed, function: 'F'.repeat(1000) })).expect(
        201,
      );
      expect(dataOf(created).name).toBe('\u00e1'.repeat(200));
      expect(dataOf(created).function).toHaveLength(1000);

      const longName = await createDepartment(departmentBody({ name: '\u0061\u0301'.repeat(201) })).expect(422);
      const longFunction = await createDepartment(departmentBody({ function: 'F'.repeat(1001) })).expect(422);
      expect([errorOf(longName).code, errorOf(longFunction).code]).toEqual(['VALIDATION_ERROR', 'VALIDATION_ERROR']);
    });
  });

  describe('listing and warnings (AC-9, AC-15)', () => {
    it('lists in code order with the head, the people count and the warnings, and filters by status', async () => {
      const department = await newDepartment();

      const response = await api()
        .get(`/api/v1/departments?search=${department.code.toLowerCase()}`)
        .set(asIt())
        .expect(200);
      const page = (response.body as { data: { items: DepartmentWire[]; pagination: { totalItems: number } } }).data;

      expect(page.items).toHaveLength(1);
      expect(page.items[0]).toMatchObject({ id: department.id, head: null, memberCount: 0 });
      expect(page.pagination.totalItems).toBe(1);
      const retired = (
        (await api().get('/api/v1/departments?status=INACTIVE').set(asIt()).expect(200)).body as {
          data: { items: DepartmentWire[] };
        }
      ).data.items;
      expect(retired.every((item) => item.status === 'INACTIVE')).toBe(true);
    });

    it('shows the IT Admin and the Super Admin the warnings, and nobody else (SoD-1)', async () => {
      const department = await newDepartment();

      for (const headers of [asIt(), asAdmin()]) {
        const response = await api().get('/api/v1/department-warnings').set(headers).expect(200);
        const items = (response.body as { data: { items: { departmentId: string; warning: string }[] } }).data.items;

        expect(
          items
            .filter((item) => item.departmentId === department.id)
            .map((item) => item.warning)
            .sort(),
        ).toEqual(['MISSING_HEAD', 'MISSING_IT_ADMIN']);
        expect(Object.keys(items[0]).sort()).toEqual(['code', 'departmentId', 'name', 'warning']);
      }
      await api().get('/api/v1/department-warnings').set(asFinance()).expect(403);
    });

    it('stops warning once the department has a head and an IT Admin in charge', async () => {
      const department = await newDepartment({ itAdminEmployeeId: h.it1.employeeId });
      const member = await enter(department.code);

      await assignHead(department.id, member.employeeId).expect(200);

      const response = await api().get('/api/v1/department-warnings').set(asIt()).expect(200);
      const items = (response.body as { data: { items: { departmentId: string }[] } }).data.items;
      expect(items.some((item) => item.departmentId === department.id)).toBe(false);
    });
  });

  describe('retiring a department (AC-19, AC-20)', () => {
    it('is refused while anyone is a member, naming them, and changes nothing', async () => {
      const department = await newDepartment();
      const member = await enter(department.code);

      const response = await api().post(`/api/v1/departments/${department.id}/deactivate`).set(asAdmin()).expect(409);

      const error = (response.body as { error: { code: string; message: string; details: Record<string, unknown> } })
        .error;
      expect(error.code).toBe('DEPARTMENT.IN_USE');
      expect(error.message).toBe(
        'The department still has members, service accounts, open work or subscriptions that owe a payment.',
      );
      // Members, the service accounts the department owns (QĐ-86c), open work and the subscriptions that owe a payment (US-03-06
      // AC-19, QĐ-90e), each with its total. Shared accounts are out of scope since QĐ-75, so that key is absent.
      expect(Object.keys(error.details).sort()).toEqual([
        'members',
        'openWork',
        'serviceAccounts',
        'subscriptions',
        'totalMembers',
        'totalOpenWork',
        'totalServiceAccounts',
        'totalSubscriptions',
      ]);
      expect(Object.hasOwn(error.details, 'sharedAccounts')).toBe(false);
      expect(response.text).not.toContain('sharedAccounts');
      expect(error.details).toEqual({
        totalMembers: 1,
        members: [{ employeeCode: member.code, fullName: expect.any(String) as unknown }],
        totalServiceAccounts: 0,
        serviceAccounts: [],
        openWork: [],
        totalOpenWork: 0,
        subscriptions: [],
        totalSubscriptions: 0,
      });
      expect((await getDepartment(department.id)).status).toBe('ACTIVE');
      expect(await auditOf(department.id)).toHaveLength(1);
    });

    it.each<[string, 'openWork' | 'subscriptions', string]>([
      ['a Request that is not over, a personnel event waiting or an open task', 'openWork', 'ACCESS_REQUEST'],
      ['a subscription or a purchase that still owes a payment', 'subscriptions', 'SUBSCRIPTION'],
    ])('is refused while it has %s, listing it with its total (QĐ-90e, F15)', async (_name, group, kind) => {
      const department = await newDepartment();
      h.useFacts[group] = Array.from({ length: 21 }, (_unused, index) => ({
        kind,
        id: `${kind}-${index}`,
        label: null,
      }));

      const error = errorOf(
        await api().post(`/api/v1/departments/${department.id}/deactivate`).set(asAdmin()).expect(409),
      );

      const details = error.details as Record<string, unknown>;
      const total = group === 'openWork' ? 'totalOpenWork' : 'totalSubscriptions';
      expect(error.code).toBe('DEPARTMENT.IN_USE');
      expect(details[total]).toBe(21);
      expect(details[group]).toHaveLength(20);
      expect((details[group] as { kind: string }[])[0]).toEqual({ kind, id: `${kind}-0`, label: null });
      expect(details.totalMembers).toBe(0);
      expect((await getDepartment(department.id)).status).toBe('ACTIVE');

      // Once the work is done or the subscription is cancelled or has ended, the department can be retired.
      h.useFacts[group] = [];
      await api().post(`/api/v1/departments/${department.id}/deactivate`).set(asAdmin()).expect(200);
    });

    it('retires an empty one, keeps its history, takes nobody in afterwards, and answers the same the second time', async () => {
      const department = await newDepartment();

      const first = await api().post(`/api/v1/departments/${department.id}/deactivate`).set(asAdmin()).expect(200);
      const second = await api().post(`/api/v1/departments/${department.id}/deactivate`).set(asAdmin()).expect(200);

      expect(dataOf(first)).toMatchObject({ status: 'INACTIVE', warnings: [] });
      expect(dataOf(second).deactivatedAt).toBe(dataOf(first).deactivatedAt);
      expect((await auditOf(department.id)).map((event) => event.action)).toEqual([
        'DEPARTMENT.CREATED',
        'DEPARTMENT.DEACTIVATED',
      ]);
      const entry = await api()
        .post('/api/v1/employees')
        .set(asAdmin())
        .send({
          employeeCode: unique('E-LATE'),
          fullName: 'Late Joiner',
          employmentType: 'STAFF',
          hireDate: '2026-10-01',
          departmentCode: department.code,
          jobTitle: 'Administrator',
        })
        .expect(422);
      expect((errorOf(entry).details as { reasons: unknown }).reasons).toEqual([
        { field: 'departmentCode', code: 'DEPARTMENT_INACTIVE' },
      ]);
      await api()
        .patch(`/api/v1/departments/${department.id}`)
        .set(asAdmin())
        .send({ name: 'Renamed after retirement' })
        .expect(409);
    });

    it('lets the database refuse a placement into a retired department, whatever the application does', async () => {
      const department = await newDepartment();
      await api().post(`/api/v1/departments/${department.id}/deactivate`).set(asAdmin()).expect(200);
      const person = await insertEmployeeFixture(h.ctx.app, h.seed, { code: unique('E-SQL'), email: null });

      await expect(
        h.ctx.sql.query(
          `INSERT INTO employee_placements (id, organization_id, employee_id, department_id, valid_from)
           VALUES (gen_random_uuid(), $1, $2, $3, '2099-01-01')`,
          [h.seed.organizationId, person.employeeId, department.id],
        ),
      ).rejects.toMatchObject({ code: '23514' });
    });

    it('has no way to merge or split departments, or to delete one: a retired department is all there is', async () => {
      const department = await newDepartment();

      for (const [method, path] of [
        ['post', '/api/v1/departments/merge'],
        ['post', `/api/v1/departments/${department.id}/split`],
        ['delete', `/api/v1/departments/${department.id}`],
      ] as const) {
        await api()[method](path).set(asAdmin()).send({}).expect(404);
      }
    });
  });

  it('leaves every employee with exactly the placements the invariant I-2 asks for', async () => {
    expect(await h.placementViolations()).toEqual([]);
  });
});
