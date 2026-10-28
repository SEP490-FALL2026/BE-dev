import request from 'supertest';
import { Client } from 'pg';
import { ApiAccount, adminToken, createActivatedAccount } from '../support/api-accounts';
import { HttpTestApp, SeededInstallation, createHttpTestApp, seedInstallation } from '../support/http-test-app';
import { findPlacementCoverageViolations } from '../support/placement-coverage';
import { HR_BASIS } from '../support/hr-basis';
import { UseFacts, registerUseReaders } from '../support/organization-use-readers';

interface CostCenterWire {
  id: string;
  code: string;
  name: string;
  kind: string;
  status: string;
  department: { id: string; code: string; name: string } | null;
  linkedAt: string | null;
  createdAt: string;
  updatedAt: string;
  deactivatedAt: string | null;
}

interface ErrorBody {
  error: { code: string; details?: Record<string, unknown> };
}

describe('the Cost Center catalogue over HTTP (integration, real PostgreSQL)', () => {
  let ctx: HttpTestApp;
  let seed: SeededInstallation;
  let finance: ApiAccount;
  let it1: ApiAccount;
  let counter = 0;
  const server = () => ctx.app.getHttpServer();
  const asFinance = () => ({ Authorization: `Bearer ${finance.accessToken}` });
  const asIt = () => ({ Authorization: `Bearer ${it1.accessToken}` });
  let superAdmin: string;
  const asSuperAdmin = () => ({ Authorization: `Bearer ${superAdmin}` });
  let useFacts: UseFacts;

  beforeAll(async () => {
    ctx = await createHttpTestApp();
    seed = await seedInstallation(ctx.app);
    const admin = await adminToken(ctx, seed);
    superAdmin = admin;
    target = await insertDepartment('P-TARGET');
    finance = await createActivatedAccount(ctx, seed, {
      code: 'E-FIN',
      email: 'fin@acme.vn',
      roles: ['FINANCE'],
      admin,
    });
    it1 = await createActivatedAccount(ctx, seed, { code: 'E-IT1', email: 'it1@acme.vn', roles: ['IT_ADMIN'], admin });
    // The open obligations of a Cost Center are held by other modules (Requests, commitments): nothing, unless a case says so.
    useFacts = registerUseReaders(ctx.app);
  }, 120000);

  afterEach(() => {
    useFacts.requests = [];
    useFacts.commitments = [];
  });

  afterAll(async () => {
    await ctx?.close();
  });

  const unique = (prefix: string): string => {
    counter += 1;

    return `${prefix}-${counter}`;
  };
  const dataOf = (response: request.Response) => (response.body as { data: CostCenterWire }).data;
  const errorOf = (response: request.Response) => (response.body as ErrorBody).error;

  const create = (body: object, headers: Record<string, string> = asFinance()) =>
    request(server()).post('/api/v1/cost-centers').set(headers).send(body);
  /** A department with no Cost Center, written the way the installation writes one (`QĐ-87d(1)`). */
  const insertDepartment = async (code = unique('P')): Promise<{ id: string; code: string }> => ({
    code,
    id: (
      await ctx.sql.query<{ id: string }>(
        `INSERT INTO departments (id, organization_id, code, name)
         VALUES (gen_random_uuid(), $1, $2, $3) RETURNING id`,
        [seed.organizationId, code, `Department ${code}`],
      )
    ).rows[0].id,
  });
  /** A Cost Center Finance creates for a department of its own (or the one named). */
  const createUnit = async (code = unique('CC'), departmentId?: string): Promise<CostCenterWire> =>
    dataOf(
      await create({
        code,
        name: `Name of ${code}`,
        kind: 'UNIT',
        departmentId: departmentId ?? (await insertDepartment()).id,
      }).expect(201),
    );
  const deactivate = (id: string, headers: Record<string, string> = asFinance()) =>
    request(server()).post(`/api/v1/cost-centers/${id}/deactivate`).set(headers);
  /** A department no Cost Center was ever created for: what a refused body is aimed at. */
  let target: { id: string; code: string };

  const auditActions = async (resourceId: string): Promise<{ action: string; before: unknown; after: unknown }[]> =>
    (
      await ctx.sql.query<{ action: string; before: unknown; after: unknown }>(
        'SELECT action, before, after FROM audit_events WHERE resource_id = $1 ORDER BY occurred_at, id',
        [resourceId],
      )
    ).rows;

  describe('creating a cost center (AC-1, AC-2, AC-4)', () => {
    it('lets Finance create one for a department, in use and linked at the moment it is created, and records who did it', async () => {
      const department = await insertDepartment();
      const response = await create({
        code: 'CC-DES',
        name: '  Design   team ',
        kind: 'UNIT',
        departmentId: department.id,
      }).expect(201);

      expect((response.body as { message: string }).message).toBe('COST_CENTER.CREATED');
      expect(dataOf(response)).toMatchObject({
        code: 'CC-DES',
        name: 'Design team',
        kind: 'UNIT',
        status: 'ACTIVE',
        department: { id: department.id, code: department.code },
        deactivatedAt: null,
      });
      // The link begins when the Cost Center is created, and never before it or the department existed (F68).
      expect(dataOf(response).linkedAt).toBe(dataOf(response).createdAt);
      const events = await auditActions(dataOf(response).id);
      expect(events).toEqual([
        {
          action: 'COST_CENTER.CREATED',
          before: null,
          after: { code: 'CC-DES', name: 'Design team', kind: 'UNIT', status: 'ACTIVE', departmentId: department.id },
        },
      ]);
      const actor = await ctx.sql.query<{ actor_kind: string; actor_app_user_id: string; actor_roles: string[] }>(
        `SELECT actor_kind, actor_app_user_id, actor_roles FROM audit_events WHERE resource_id = $1`,
        [dataOf(response).id],
      );
      expect(actor.rows[0]).toMatchObject({ actor_kind: 'USER', actor_app_user_id: finance.appUserId });
      expect(actor.rows[0].actor_roles).toEqual(['FINANCE']);
    });

    it('refuses a COMPANY cost center: the Company is the root of the organization, not a Cost Center (QĐ-86a)', async () => {
      const code = unique('CORP');

      const response = await create({
        code,
        name: 'Whole company',
        kind: 'COMPANY',
        departmentId: target.id,
      }).expect(422);

      expect(errorOf(response).code).toBe('COST_CENTER.KIND_NOT_SUPPORTED');
      expect((await ctx.sql.query('SELECT 1 FROM cost_centers WHERE code = $1', [code])).rows).toHaveLength(0);
    });

    it('turns the IT Admin away from creating one: 403, nothing created', async () => {
      const code = unique('CC-IT');

      await create({ code, name: 'By IT', kind: 'UNIT', departmentId: target.id }, asIt()).expect(403);

      expect((await ctx.sql.query('SELECT 1 FROM cost_centers WHERE code = $1', [code])).rows).toHaveLength(0);
    });

    it('refuses a code that is taken, 409, and keeps the first one', async () => {
      const first = await createUnit();

      const response = await create({
        code: first.code,
        name: 'Another',
        kind: 'UNIT',
        departmentId: target.id,
      }).expect(409);

      expect(errorOf(response).code).toBe('COST_CENTER.CODE_TAKEN');
      expect((await ctx.sql.query('SELECT name FROM cost_centers WHERE code = $1', [first.code])).rows).toEqual([
        { name: first.name },
      ]);
    });

    it.each([
      ['a project kind', { kind: 'PROJECT', name: 'Project Alpha' }, 'COST_CENTER.KIND_NOT_SUPPORTED'],
      ['a placeholder kind', { kind: 'UNCLASSIFIED', name: 'Anything' }, 'COST_CENTER.KIND_NOT_SUPPORTED'],
      ['the name Chưa phân loại', { kind: 'UNIT', name: 'Chưa phân loại' }, 'COST_CENTER.NAME_RESERVED'],
      [
        'the name Chua phan loai, without accents',
        { kind: 'UNIT', name: ' CHUA phan  loai ' },
        'COST_CENTER.NAME_RESERVED',
      ],
      [
        'the report line Chưa phân bổ Cost Center',
        { kind: 'UNIT', name: 'Chưa phân bổ Cost Center' },
        'COST_CENTER.NAME_RESERVED',
      ],
      ['an empty name', { kind: 'UNIT', name: '   ' }, 'COST_CENTER.NAME_INVALID'],
      ['a name over 200 characters', { kind: 'UNIT', name: 'N'.repeat(201) }, 'COST_CENTER.NAME_INVALID'],
    ])('turns away %s with 422 %s and creates nothing (AC-4)', async (_name, body, code) => {
      const costCenterCode = unique('CC-BAD');
      const before = (await ctx.sql.query<{ n: number }>('SELECT count(*)::int AS n FROM cost_centers')).rows[0].n;

      const response = await create({ code: costCenterCode, departmentId: target.id, ...body }).expect(422);

      expect(errorOf(response).code).toBe(code);
      expect((await ctx.sql.query<{ n: number }>('SELECT count(*)::int AS n FROM cost_centers')).rows[0].n).toBe(
        before,
      );
    });
  });

  describe('a Cost Center belongs to one department for its whole life (QĐ-87d(1), QĐ-87d(3))', () => {
    it('needs a department: a body without one, or with one that does not exist or is retired, is turned back and creates nothing', async () => {
      const before = (await ctx.sql.query<{ n: number }>('SELECT count(*)::int AS n FROM cost_centers')).rows[0].n;
      const retired = await insertDepartment(unique('P-RET'));
      await ctx.sql.query(`UPDATE departments SET status = 'INACTIVE', deactivated_at = now() WHERE id = $1`, [
        retired.id,
      ]);

      const without = await create({ code: unique('CC-NODEP'), name: 'No department', kind: 'UNIT' }).expect(422);
      const missing = await create({
        code: unique('CC-MISS'),
        name: 'Missing',
        kind: 'UNIT',
        departmentId: '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11',
      }).expect(422);
      const stopped = await create({
        code: unique('CC-STOP'),
        name: 'Retired department',
        kind: 'UNIT',
        departmentId: retired.id,
      }).expect(422);

      expect(errorOf(without).code).toBe('VALIDATION_ERROR');
      expect(errorOf(missing).code).toBe('COST_CENTER.DEPARTMENT_NOT_ACTIVE');
      expect(errorOf(stopped).code).toBe('COST_CENTER.DEPARTMENT_NOT_ACTIVE');
      expect((await ctx.sql.query<{ n: number }>('SELECT count(*)::int AS n FROM cost_centers')).rows[0].n).toBe(
        before,
      );
    });

    it('is refused for a department that already has a Cost Center in use (409), and allowed once that one is retired: the new one is current from then on', async () => {
      const first = await createUnit();
      const departmentId = (first.department as { id: string }).id;

      const refused = await create({
        code: unique('CC-2ND'),
        name: 'Second',
        kind: 'UNIT',
        departmentId,
      }).expect(409);
      expect(errorOf(refused).code).toBe('COST_CENTER.DEPARTMENT_ALREADY_LINKED');

      await deactivate(first.id).expect(200);
      const second = await createUnit(unique('CC-2ND'), departmentId);

      // The first stays with the department as history; the department's current Cost Center is the second, the only one
      // of the department in use.
      expect(second.department).toMatchObject({ id: departmentId });
      expect(new Date(second.linkedAt as string).getTime()).toBeGreaterThanOrEqual(
        new Date(first.deactivatedAt ?? first.createdAt).getTime(),
      );
      expect(
        (
          await ctx.sql.query<{ id: string }>(
            `SELECT id FROM cost_centers WHERE department_id = $1 AND status = 'ACTIVE'`,
            [departmentId],
          )
        ).rows,
      ).toEqual([{ id: second.id }]);
      const linked = (
        await ctx.sql.query<{ id: string; department_id: string }>(
          'SELECT id, department_id FROM cost_centers WHERE department_id = $1 ORDER BY created_at',
          [departmentId],
        )
      ).rows;
      expect(linked.map((row) => row.id)).toEqual([first.id, second.id]);
    });

    it('never dates the link before the Cost Center or its department (F68)', async () => {
      const costCenter = await createUnit();

      const rows = (
        await ctx.sql.query<{ not_before: boolean }>(
          `SELECT (c.linked_at >= c.created_at AND c.linked_at >= d.created_at) AS not_before
             FROM cost_centers c JOIN departments d ON d.id = c.department_id WHERE c.id = $1`,
          [costCenter.id],
        )
      ).rows;
      expect(rows).toEqual([{ not_before: true }]);
    });

    it('shows when it was linked in the list too, and keeps a Cost Center linked for its whole life', async () => {
      const costCenter = await createUnit(unique('CC-LIFE'));

      const listed = (
        (await request(server()).get(`/api/v1/cost-centers?search=${costCenter.code.toLowerCase()}`).set(asFinance()))
          .body as { data: { items: CostCenterWire[] } }
      ).data.items[0];
      expect(listed.linkedAt).toBe(costCenter.linkedAt);

      // The department is never changed afterwards: the database refuses it.
      const other = await insertDepartment(unique('P-OTHER'));
      await expect(
        ctx.sql.query('UPDATE cost_centers SET department_id = $2 WHERE id = $1', [costCenter.id, other.id]),
      ).rejects.toMatchObject({ code: '23514' });
    });
  });

  describe('reading the catalogue', () => {
    it('lets Finance and the Super Admin read it, with the department each belongs to, and turns the IT Admin away (QĐ-87a)', async () => {
      const costCenter = await createUnit(unique('CC-READ'));
      const departmentId = (costCenter.department as { id: string }).id;

      await request(server()).get('/api/v1/cost-centers').set(asIt()).expect(403);
      for (const headers of [asFinance(), asSuperAdmin()]) {
        const response = await request(server())
          .get(`/api/v1/cost-centers?search=${costCenter.code.toLowerCase()}`)
          .set(headers)
          .expect(200);
        const page = (response.body as { data: { items: CostCenterWire[]; pagination: { totalItems: number } } }).data;

        expect(page.items).toHaveLength(1);
        expect(page.items[0]).toMatchObject({ code: costCenter.code, department: { id: departmentId } });
        expect(page.pagination.totalItems).toBe(1);
      }
    });

    it('filters by status and kind, in code order, with a page and a total from one snapshot', async () => {
      const retired = await createUnit(unique('CC-OLD'));
      await deactivate(retired.id).expect(200);

      const inactive = await request(server()).get('/api/v1/cost-centers?status=INACTIVE').set(asFinance()).expect(200);
      const items = (inactive.body as { data: { items: CostCenterWire[] } }).data.items;
      expect(items.length).toBeGreaterThan(0);
      expect(items.every((item) => item.status === 'INACTIVE')).toBe(true);
      expect(items.map((item) => item.code)).toContain(retired.code);

      await request(server()).get('/api/v1/cost-centers?kind=COMPANY').set(asFinance()).expect(422);
      const codes = (
        (await request(server()).get('/api/v1/cost-centers?pageSize=100').set(asFinance()).expect(200)).body as {
          data: { items: CostCenterWire[] };
        }
      ).data.items.map((item) => item.code);
      expect(codes).toEqual([...codes].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
    });

    it('searches as literal text: a percent sign is a character, not a wildcard', async () => {
      const response = await request(server()).get('/api/v1/cost-centers?search=%25').set(asFinance()).expect(200);

      expect((response.body as { data: { items: unknown[] } }).data.items).toHaveLength(0);
    });
  });

  describe('renaming (the code never changes)', () => {
    it('changes only the name and records before and after', async () => {
      const costCenter = await createUnit();

      const response = await request(server())
        .patch(`/api/v1/cost-centers/${costCenter.id}`)
        .set(asFinance())
        .send({ name: 'Design & Brand' })
        .expect(200);

      expect(dataOf(response)).toMatchObject({ code: costCenter.code, name: 'Design & Brand', status: 'ACTIVE' });
      expect(await auditActions(costCenter.id)).toEqual([
        expect.objectContaining({ action: 'COST_CENTER.CREATED' }),
        { action: 'COST_CENTER.RENAMED', before: { name: costCenter.name }, after: { name: 'Design & Brand' } },
      ]);
    });

    it('records nothing when the name is the same, and refuses a reserved name', async () => {
      const costCenter = await createUnit();

      await request(server())
        .patch(`/api/v1/cost-centers/${costCenter.id}`)
        .set(asFinance())
        .send({ name: `  ${costCenter.name} ` })
        .expect(200);
      const reserved = await request(server())
        .patch(`/api/v1/cost-centers/${costCenter.id}`)
        .set(asFinance())
        .send({ name: 'Chưa phân loại' })
        .expect(422);

      expect(errorOf(reserved).code).toBe('COST_CENTER.NAME_RESERVED');
      expect(await auditActions(costCenter.id)).toHaveLength(1);
    });

    it('is 404 for a cost center that does not exist and 403 for the IT Admin', async () => {
      const missing = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';
      const costCenter = await createUnit();

      const notFound = await request(server())
        .patch(`/api/v1/cost-centers/${missing}`)
        .set(asFinance())
        .send({ name: 'x' })
        .expect(404);
      await request(server())
        .patch(`/api/v1/cost-centers/${costCenter.id}`)
        .set(asIt())
        .send({ name: 'By IT' })
        .expect(403);

      expect(errorOf(notFound).code).toBe('COST_CENTER.NOT_FOUND');
    });
  });

  describe('retiring a cost center (AC-3, AC-5, AC-10, AC-11)', () => {
    it.each<[string, 'requests' | 'commitments', string, string]>([
      ['a Request with a cost that is not over', 'requests', 'ACCESS_REQUEST', 'totalRequests'],
      ['a commitment still held', 'commitments', 'BUDGET_COMMITMENT', 'totalCommitments'],
    ])(
      'is refused while %s sits on it, listing the obligation with its total (AC-3, F16)',
      async (_name, group, kind, total) => {
        const costCenter = await createUnit();
        useFacts[group] = Array.from({ length: 21 }, (_unused, index) => ({
          kind,
          id: `${kind}-${index}`,
          label: null,
        }));

        const response = await deactivate(costCenter.id).expect(409);

        expect(errorOf(response).code).toBe('COST_CENTER.IN_USE');
        const details = errorOf(response).details as Record<string, unknown>;
        expect(Object.keys(details).sort()).toEqual([
          'commitments',
          'department',
          'requests',
          'totalCommitments',
          'totalRequests',
        ]);
        expect(details.department).toMatchObject({ id: (costCenter.department as { id: string }).id });
        expect(details[total]).toBe(21);
        expect(details[group]).toHaveLength(20);
        expect((details[group] as unknown[])[0]).toEqual({ kind, id: `${kind}-0`, label: null });
        expect((await ctx.sql.query('SELECT status FROM cost_centers WHERE id = $1', [costCenter.id])).rows).toEqual([
          { status: 'ACTIVE' },
        ]);
        expect(await auditActions(costCenter.id)).toEqual([expect.objectContaining({ action: 'COST_CENTER.CREATED' })]);

        // Once the obligation is cleared, the same Cost Center is retired.
        useFacts[group] = [];
        await deactivate(costCenter.id).expect(200);
      },
    );

    it('is not held back by the people in its department: employees working there are not an obligation (AC-3, QĐ-87d(2))', async () => {
      const costCenter = await createUnit();
      const department = costCenter.department as { id: string; code: string };
      await request(server())
        .post('/api/v1/employees')
        .set(asSuperAdmin())
        .send({
          hrBasis: HR_BASIS,
          employeeCode: unique('E-STAY'),
          fullName: 'Stays In',
          employmentType: 'STAFF',
          hireDate: '2026-10-01',
          departmentCode: department.code,
          jobTitle: 'Administrator',
        })
        .expect(201);

      const response = await deactivate(costCenter.id).expect(200);

      expect(dataOf(response).status).toBe('INACTIVE');
      // The department goes back to an incomplete finance configuration: nothing but its Cost Center changed.
      expect((await ctx.sql.query('SELECT status FROM departments WHERE id = $1', [department.id])).rows).toEqual([
        { status: 'ACTIVE' },
      ]);
    });

    it('retires one whose department has nobody in it, and answers the same the second time without a second record', async () => {
      const costCenter = await createUnit();

      const first = await deactivate(costCenter.id).expect(200);
      const second = await deactivate(costCenter.id).expect(200);

      expect(dataOf(first)).toMatchObject({ status: 'INACTIVE' });
      expect(dataOf(first).deactivatedAt).not.toBeNull();
      expect(dataOf(second).deactivatedAt).toBe(dataOf(first).deactivatedAt);
      expect((await auditActions(costCenter.id)).map((event) => event.action)).toEqual([
        'COST_CENTER.CREATED',
        'COST_CENTER.DEACTIVATED',
      ]);
      expect((await auditActions(costCenter.id))[1]).toEqual({
        action: 'COST_CENTER.DEACTIVATED',
        before: { status: 'ACTIVE' },
        after: { status: 'INACTIVE' },
      });
    });

    it('retires one whose department has nobody left, and keeps the department (split and merge, AC-10, AC-11)', async () => {
      const costCenter = await createUnit();
      const departmentId = (costCenter.department as { id: string }).id;

      const response = await deactivate(costCenter.id).expect(200);

      expect(dataOf(response)).toMatchObject({ status: 'INACTIVE', department: { id: departmentId } });
      expect((await ctx.sql.query('SELECT 1 FROM departments WHERE id = $1', [departmentId])).rows).toHaveLength(1);
    });

    it('is Finance only: the IT Admin gets 403 and nothing changes', async () => {
      const costCenter = await createUnit();

      await deactivate(costCenter.id, asIt()).expect(403);

      expect((await ctx.sql.query('SELECT status FROM cost_centers WHERE id = $1', [costCenter.id])).rows).toEqual([
        { status: 'ACTIVE' },
      ]);
    });

    it('is 404 for a cost center that does not exist', async () => {
      const response = await deactivate('3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11').expect(404);

      expect(errorOf(response).code).toBe('COST_CENTER.NOT_FOUND');
    });

    it('is never moved to another department once made, and is not brought back beside the one that replaced it: the database refuses both (AC-5)', async () => {
      const first = await createUnit();
      const departmentId = (first.department as { id: string }).id;
      const elsewhere = await createUnit();
      await deactivate(first.id).expect(200);
      await createUnit(unique('CC-NEXT'), departmentId);

      await expect(
        ctx.sql.query(`UPDATE cost_centers SET department_id = $2 WHERE id = $1`, [
          first.id,
          (elsewhere.department as { id: string }).id,
        ]),
      ).rejects.toMatchObject({ code: '23514' });
      await expect(
        ctx.sql.query(`UPDATE cost_centers SET status = 'ACTIVE', deactivated_at = NULL WHERE id = $1`, [first.id]),
      ).rejects.toMatchObject({ code: '23505' });
    });

    it('takes people into a department whose cost center is retired, or that has none: no reason, a person with no cost center (QĐ-87d(3), F44)', async () => {
      const retiredCenter = await insertDepartment(unique('P-GONE'));
      const none = await insertDepartment(unique('P-NONE'));
      await deactivate((await createUnit(unique('CC'), retiredCenter.id)).id).expect(200);

      for (const department of [retiredCenter, none]) {
        const response = await request(server())
          .post('/api/v1/employees')
          .set(asSuperAdmin())
          .send({
            hrBasis: HR_BASIS,
            employeeCode: unique('E-LATE'),
            fullName: 'Late Joiner',
            employmentType: 'STAFF',
            hireDate: '2026-10-01',
            departmentCode: department.code,
            jobTitle: 'Administrator',
          })
          .expect(201);

        expect((response.body as { data: { department: { code: string } } }).data.department.code).toBe(
          department.code,
        );
      }
    });
  });

  describe('what Finance sees of the people in a cost center (AC-6)', () => {
    it('shows code, name and that they are working, and nothing else', async () => {
      const seeded = (await ctx.sql.query<{ id: string }>(`SELECT id FROM cost_centers WHERE code = 'CC-1'`)).rows[0];

      const response = await request(server())
        .get(`/api/v1/cost-centers/${seeded.id}/employees?pageSize=100`)
        .set(asFinance())
        .expect(200);
      const data = (
        response.body as {
          data: {
            costCenter: { id: string; code: string };
            items: Record<string, unknown>[];
            pagination: { totalItems: number };
          };
        }
      ).data;

      expect(data.costCenter).toEqual({ id: seeded.id, code: 'CC-1' });
      expect(data.items.length).toBe(data.pagination.totalItems);
      expect(data.items.map((item) => item.employeeCode)).toEqual(
        expect.arrayContaining(['E-ADMIN', 'E-FIN', 'E-IT1']),
      );
      for (const item of data.items) {
        expect(Object.keys(item).sort()).toEqual(['employeeCode', 'fullName', 'status']);
        expect(item.status).toBe('WORKING');
      }
    });

    it('is empty for a cost center whose department has nobody in it, and refused to everyone but Finance', async () => {
      const empty = await createUnit(unique('CC-EMPTY'));

      const response = await request(server())
        .get(`/api/v1/cost-centers/${empty.id}/employees`)
        .set(asFinance())
        .expect(200);
      await request(server()).get(`/api/v1/cost-centers/${empty.id}/employees`).set(asIt()).expect(403);
      await request(server()).get(`/api/v1/cost-centers/${empty.id}/employees`).set(asSuperAdmin()).expect(403);

      expect((response.body as { data: { items: unknown[] } }).data.items).toEqual([]);
    });

    it('is 404 for a cost center that does not exist', async () => {
      await request(server())
        .get('/api/v1/cost-centers/3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11/employees')
        .set(asFinance())
        .expect(404);
    });
  });

  describe('the lock protocol: retiring a cost center racing a Request that holds it (T-11, F16)', () => {
    let holder: Client;

    beforeAll(async () => {
      holder = new Client({ connectionString: ctx.database.url });
      await holder.connect();
    });

    afterAll(async () => {
      await holder?.end();
    });

    afterEach(async () => {
      await holder.query('ROLLBACK').catch(() => undefined);
    });

    async function waitForWaiters(observer: Client, count: number, timeoutMs = 10000): Promise<void> {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        const { rows } = await observer.query<{ waiting: number }>(
          'SELECT count(*)::int AS waiting FROM pg_locks WHERE NOT granted',
        );
        if (rows[0].waiting >= count) return;
        if (Date.now() > deadline) throw new Error(`Fewer than ${count} backends reached a lock wait in time.`);
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
    }

    it('reads the obligations after it holds the Cost Center, so what the Request that held it first adds is seen', async () => {
      const costCenter = await createUnit();

      // A Request that charges the Cost Center holds it `FOR SHARE` until it commits; the retirement queues behind it.
      await holder.query('BEGIN');
      await holder.query('SELECT id FROM cost_centers WHERE id = $1 FOR SHARE', [costCenter.id]);
      const retiring = deactivate(costCenter.id).then((r) => r);
      await waitForWaiters(ctx.sql, 1);
      useFacts.requests = [{ kind: 'ACCESS_REQUEST', id: 'request-1', label: null }];
      await holder.query('COMMIT');

      const refused = await retiring;
      expect(refused.status).toBe(409);
      expect(errorOf(refused).code).toBe('COST_CENTER.IN_USE');
      expect((await ctx.sql.query('SELECT status FROM cost_centers WHERE id = $1', [costCenter.id])).rows).toEqual([
        { status: 'ACTIVE' },
      ]);

      // With nothing left on it, the same wait ends in the retirement.
      useFacts.requests = [];
      await holder.query('BEGIN');
      await holder.query('SELECT id FROM cost_centers WHERE id = $1 FOR SHARE', [costCenter.id]);
      const again = deactivate(costCenter.id).then((r) => r);
      await waitForWaiters(ctx.sql, 1);
      await holder.query('COMMIT');
      expect((await again).status).toBe(200);
    });
  });

  // The OpenAPI document declares this 422 (H2b); these cases prove the runtime answers it before it is documented.
  it.each([
    ['an unknown status', 'status=RETIRED'],
    ['a page size above the limit', 'pageSize=101'],
    ['an unknown query field', 'colour=blue'],
  ])('answers 422 VALIDATION_ERROR to a list query with %s', async (_label, query) => {
    const response = await request(server()).get(`/api/v1/cost-centers?${query}`).set(asFinance()).expect(422);

    expect(errorOf(response).code).toBe('VALIDATION_ERROR');
  });

  it('leaves every employee with exactly the placements the invariant I-2 asks for', async () => {
    expect(await findPlacementCoverageViolations(ctx.sql)).toEqual([]);
  });
});
