import request from 'supertest';
import { Client } from 'pg';
import { ApiAccount, adminToken, createActivatedAccount } from '../support/api-accounts';
import { HttpTestApp, SeededInstallation, createHttpTestApp, seedInstallation } from '../support/http-test-app';
import { findPlacementCoverageViolations } from '../support/placement-coverage';

interface CostCenterWire {
  id: string;
  code: string;
  name: string;
  kind: string;
  status: string;
  department: { id: string; code: string; name: string } | null;
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

  beforeAll(async () => {
    ctx = await createHttpTestApp();
    seed = await seedInstallation(ctx.app);
    const admin = await adminToken(ctx, seed);
    finance = await createActivatedAccount(ctx, seed, {
      code: 'E-FIN',
      email: 'fin@acme.vn',
      roles: ['FINANCE'],
      admin,
    });
    it1 = await createActivatedAccount(ctx, seed, { code: 'E-IT1', email: 'it1@acme.vn', roles: ['IT_ADMIN'], admin });
  }, 120000);

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
  const createUnit = async (code = unique('CC')): Promise<CostCenterWire> =>
    dataOf(await create({ code, name: `Name of ${code}`, kind: 'UNIT' }).expect(201));
  const deactivate = (id: string, headers: Record<string, string> = asFinance()) =>
    request(server()).post(`/api/v1/cost-centers/${id}/deactivate`).set(headers);

  /** A department charged to the cost center, made by SQL: creating departments is a later slice. */
  const insertDepartment = async (costCenterId: string, code = unique('P')): Promise<string> =>
    (
      await ctx.sql.query<{ id: string }>(
        `INSERT INTO departments (id, organization_id, code, name, cost_center_id)
         VALUES (gen_random_uuid(), $1, $2, $3, $4) RETURNING id`,
        [seed.organizationId, code, `Department ${code}`, costCenterId],
      )
    ).rows[0].id;

  const auditActions = async (resourceId: string): Promise<{ action: string; before: unknown; after: unknown }[]> =>
    (
      await ctx.sql.query<{ action: string; before: unknown; after: unknown }>(
        'SELECT action, before, after FROM audit_events WHERE resource_id = $1 ORDER BY occurred_at, id',
        [resourceId],
      )
    ).rows;

  describe('creating a cost center (AC-1, AC-2, AC-4)', () => {
    it('lets Finance create one, in use and with no department, and records who did it', async () => {
      const response = await create({ code: 'CC-DES', name: '  Design   team ', kind: 'UNIT' }).expect(201);

      expect((response.body as { message: string }).message).toBe('COST_CENTER.CREATED');
      expect(dataOf(response)).toMatchObject({
        code: 'CC-DES',
        name: 'Design team',
        kind: 'UNIT',
        status: 'ACTIVE',
        department: null,
        deactivatedAt: null,
      });
      const events = await auditActions(dataOf(response).id);
      expect(events).toEqual([
        {
          action: 'COST_CENTER.CREATED',
          before: null,
          after: { code: 'CC-DES', name: 'Design team', kind: 'UNIT', status: 'ACTIVE' },
        },
      ]);
      const actor = await ctx.sql.query<{ actor_kind: string; actor_app_user_id: string; actor_roles: string[] }>(
        `SELECT actor_kind, actor_app_user_id, actor_roles FROM audit_events WHERE resource_id = $1`,
        [dataOf(response).id],
      );
      expect(actor.rows[0]).toMatchObject({ actor_kind: 'USER', actor_app_user_id: finance.appUserId });
      expect(actor.rows[0].actor_roles).toEqual(['FINANCE']);
    });

    it('lets Finance create a COMPANY cost center too', async () => {
      const response = await create({ code: unique('CORP'), name: 'Whole company', kind: 'COMPANY' }).expect(201);

      expect(dataOf(response)).toMatchObject({ kind: 'COMPANY', status: 'ACTIVE' });
    });

    it('turns the IT Admin away from creating one: 403, nothing created', async () => {
      const code = unique('CC-IT');

      await create({ code, name: 'By IT', kind: 'UNIT' }, asIt()).expect(403);

      expect((await ctx.sql.query('SELECT 1 FROM cost_centers WHERE code = $1', [code])).rows).toHaveLength(0);
    });

    it('refuses a code that is taken, 409, and keeps the first one', async () => {
      const first = await createUnit();

      const response = await create({ code: first.code, name: 'Another', kind: 'UNIT' }).expect(409);

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

      const response = await create({ code: costCenterCode, ...body }).expect(422);

      expect(errorOf(response).code).toBe(code);
      expect((await ctx.sql.query<{ n: number }>('SELECT count(*)::int AS n FROM cost_centers')).rows[0].n).toBe(
        before,
      );
    });
  });

  describe('reading the catalogue', () => {
    it('lets Finance and the IT Admin read it, with the department charged to each', async () => {
      const costCenter = await createUnit(unique('CC-READ'));
      const departmentId = await insertDepartment(costCenter.id, unique('P-READ'));

      for (const headers of [asFinance(), asIt()]) {
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

      const company = await request(server()).get('/api/v1/cost-centers?kind=COMPANY').set(asFinance()).expect(200);
      expect(
        (company.body as { data: { items: CostCenterWire[] } }).data.items.every((item) => item.kind === 'COMPANY'),
      ).toBe(true);
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
    it('is refused while the department charged to it has people, naming the department and the people (AC-3)', async () => {
      // The seeded P-OPS has the Super Admin and the accounts above in it.
      const seeded = (await ctx.sql.query<{ id: string }>(`SELECT id FROM cost_centers WHERE code = 'CC-1'`)).rows[0];

      const response = await deactivate(seeded.id).expect(409);

      expect(errorOf(response).code).toBe('COST_CENTER.IN_USE');
      const details = errorOf(response).details as {
        department: { code: string; name: string };
        employees: { employeeCode: string; fullName: string }[];
        totalEmployees: number;
      };
      expect(details.department).toMatchObject({ code: 'P-OPS', name: 'Operations' });
      expect(details.totalEmployees).toBeGreaterThanOrEqual(3);
      expect(details.employees.map((employee) => employee.employeeCode)).toEqual(
        expect.arrayContaining(['E-ADMIN', 'E-FIN', 'E-IT1']),
      );
      expect(Object.keys(details.employees[0]).sort()).toEqual(['employeeCode', 'fullName']);
      expect((await ctx.sql.query('SELECT status FROM cost_centers WHERE id = $1', [seeded.id])).rows).toEqual([
        { status: 'ACTIVE' },
      ]);
      expect(await auditActions(seeded.id)).toEqual([]);
    });

    it('retires one that no department uses, and answers the same the second time without a second record', async () => {
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
    });

    it('retires one whose department has nobody left, and keeps the department (split and merge, AC-10, AC-11)', async () => {
      const costCenter = await createUnit();
      const departmentId = await insertDepartment(costCenter.id);

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

    it('cannot be chosen again for a department: the database refuses it (AC-5)', async () => {
      const costCenter = await createUnit();
      await deactivate(costCenter.id).expect(200);

      await expect(insertDepartment(costCenter.id)).rejects.toMatchObject({ code: '23514' });
    });

    it('keeps people out of a department whose cost center is retired: the entry is refused with a reason', async () => {
      const costCenter = await createUnit();
      const departmentCode = unique('P-GONE');
      await insertDepartment(costCenter.id, departmentCode);
      await deactivate(costCenter.id).expect(200);

      const response = await request(server())
        .post('/api/v1/employees')
        .set(asIt())
        .send({
          employeeCode: unique('E-GONE'),
          fullName: 'Late Joiner',
          employmentType: 'STAFF',
          hireDate: '2026-10-01',
          departmentCode,
          jobTitleId: seed.jobTitleId,
        })
        .expect(422);

      expect((errorOf(response).details as { reasons: unknown }).reasons).toEqual([
        { field: 'departmentCode', code: 'DEPARTMENT_COST_CENTER_INACTIVE' },
      ]);
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

    it('is empty for a cost center with no department, and refused to everyone but Finance', async () => {
      const company = dataOf(await create({ code: unique('CORP'), name: 'Company wide', kind: 'COMPANY' }).expect(201));

      const response = await request(server())
        .get(`/api/v1/cost-centers/${company.id}/employees`)
        .set(asFinance())
        .expect(200);
      await request(server()).get(`/api/v1/cost-centers/${company.id}/employees`).set(asIt()).expect(403);

      expect((response.body as { data: { items: unknown[] } }).data.items).toEqual([]);
    });

    it('is 404 for a cost center that does not exist', async () => {
      await request(server())
        .get('/api/v1/cost-centers/3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11/employees')
        .set(asFinance())
        .expect(404);
    });
  });

  describe('the lock protocol: retiring a cost center racing a person entering its department', () => {
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

    it('never leaves a person in a department whose cost center was retired, in either order', async () => {
      const deadlocksBefore = (
        await ctx.sql.query<{ n: number }>(
          'SELECT deadlocks::int AS n FROM pg_stat_database WHERE datname = current_database()',
        )
      ).rows[0].n;
      let entered = 0;
      let refused = 0;
      for (let round = 0; round < 6; round += 1) {
        const costCenter = await createUnit();
        const departmentCode = unique('P-RACE');
        const departmentId = await insertDepartment(costCenter.id, departmentCode);
        const employeeCode = unique('E-RACE');

        await holder.query('BEGIN');
        await holder.query('SELECT id FROM departments WHERE id = $1 FOR UPDATE', [departmentId]);
        const retiring = deactivate(costCenter.id).then((r) => r);
        const entering = request(server())
          .post('/api/v1/employees')
          .set(asIt())
          .send({
            employeeCode,
            fullName: 'Racing Person',
            employmentType: 'STAFF',
            hireDate: '2026-10-01',
            departmentCode,
            jobTitleId: seed.jobTitleId,
          })
          .then((r) => r);
        await waitForWaiters(ctx.sql, 2);
        await holder.query('COMMIT');
        const [retirement, entry] = await Promise.all([retiring, entering]);

        const placed = (await ctx.sql.query('SELECT 1 FROM employees WHERE employee_code = $1', [employeeCode])).rows
          .length;
        if (entry.status === 201) {
          // The person got in first, so the cost center still has someone in it: it cannot be retired.
          entered += 1;
          expect(retirement.status).toBe(409);
          expect(placed).toBe(1);
        } else {
          // The retirement went first: nobody enters a department whose cost center is retired.
          refused += 1;
          expect(retirement.status).toBe(200);
          expect(entry.status).toBe(422);
          expect(placed).toBe(0);
        }
      }
      // Both orders are legal; one must not be the only one that ever happens by accident of the harness.
      expect(entered + refused).toBe(6);
      const deadlocksAfter = (
        await ctx.sql.query<{ n: number }>(
          'SELECT deadlocks::int AS n FROM pg_stat_database WHERE datname = current_database()',
        )
      ).rows[0].n;
      expect(deadlocksAfter).toBe(deadlocksBefore);
    });
  });

  it('leaves every employee with exactly the placements the invariant I-2 asks for', async () => {
    expect(await findPlacementCoverageViolations(ctx.sql)).toEqual([]);
  });
});
