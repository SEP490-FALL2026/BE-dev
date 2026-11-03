import request from 'supertest';
import { Client } from 'pg';
import { ApiAccount, adminToken, createActivatedAccount } from '../../support/api-accounts';
import { HttpTestApp, SeededInstallation, createHttpTestApp, seedInstallation } from '../../support/http-test-app';
import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import { OrganizationApi } from '../../../src/modules/organization/public/organization.api';
import { OrganizationReadApi } from '../../../src/modules/organization/public/organization-read.api';
import { findPlacementCoverageViolations } from '../../support/placement-coverage';
import { registerUseReaders } from '../../support/organization-use-readers';
import { waitForLockWaiters } from '../../support/lock-wait';

const ROUNDS = 6;

/** Resolves once at least `count` backends are waiting for a lock: never a fixed delay. */
async function waitForWaiters(observer: Client, count: number, timeoutMs = 10000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const { rows } = await observer.query<{ waiting: number }>(
      'SELECT count(*)::int AS waiting FROM pg_locks l JOIN pg_stat_activity a ON a.pid = l.pid WHERE NOT l.granted AND a.datname = current_database()',
    );
    if (rows[0].waiting >= count) return;
    if (Date.now() > deadline) throw new Error(`Fewer than ${count} backends reached a lock wait in time.`);
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

describe('lock protocol: manual entry races (integration, real PostgreSQL)', () => {
  let ctx: HttpTestApp;
  let seed: SeededInstallation;
  let fin1: ApiAccount;
  let holder: Client;
  let counter = 0;
  const server = () => ctx.app.getHttpServer();
  /** The Super Admin changes departments, names heads and retires them, each on an HR basis (`QĐ-87a`); the IT Admin does none. */
  const asSuperAdminWriter = () => ({ Authorization: `Bearer ${superAdmin}` });
  const asFinance = () => ({ Authorization: `Bearer ${fin1.accessToken}` });
  let superAdmin: string;

  beforeAll(async () => {
    ctx = await createHttpTestApp();
    seed = await seedInstallation(ctx.app);
    const admin = await adminToken(ctx, seed);
    superAdmin = admin;
    fin1 = await createActivatedAccount(ctx, seed, {
      code: 'E-FIN1',
      email: 'fin1@acme.vn',
      roles: ['FINANCE'],
      admin,
    });
    holder = new Client({ connectionString: ctx.database.url });
    await holder.connect();
    // What keeps a department in use lives in other modules: nothing, unless a case says so.
    registerUseReaders(ctx.app);
  }, 120000);

  afterAll(async () => {
    await holder?.end();
    await ctx?.close();
  });

  afterEach(async () => {
    await holder.query('ROLLBACK').catch(() => undefined);
  });

  const unique = (prefix: string) => {
    counter += 1;

    return `${prefix} ${counter}`;
  };

  const entry = (overrides: Record<string, unknown>) => {
    counter += 1;

    return {
      employeeCode: `E-RC${counter}`,
      fullName: `Race Person ${counter}`,
      workEmail: `race.person.${counter}@acme.vn`,
      employmentType: 'STAFF',
      hireDate: '2026-10-01',
      departmentCode: 'P-OPS',
      jobTitle: 'Administrator',
      ...overrides,
    };
  };

  const enter = (body: object) =>
    request(server())
      .post('/api/v1/employees')
      .set({ Authorization: `Bearer ${superAdmin}` })
      .send(body);

  const deadlocks = async (): Promise<number> =>
    (
      await ctx.sql.query<{ n: number }>(
        'SELECT deadlocks::int AS n FROM pg_stat_database WHERE datname = current_database()',
      )
    ).rows[0].n;

  /**
   * Holds one row so every operation fired next queues behind it, then releases them together. Which one the
   * database serves first is the database's choice; the assertions hold for either order.
   */
  async function raceBehindLock<T>(
    lockSql: string,
    params: unknown[],
    operations: Array<() => Promise<T>>,
  ): Promise<T[]> {
    await holder.query('BEGIN');
    await holder.query(lockSql, params);
    const pending = operations.map((operation) => operation());
    await waitForWaiters(ctx.sql, operations.length);
    await holder.query('COMMIT');

    return Promise.all(pending);
  }

  const rowsWith = async (sql: string, params: unknown[]) =>
    (await ctx.sql.query<Record<string, unknown>>(sql, params)).rows;

  it.each([
    ['employee code', (n: number) => ({ employeeCode: 'E-SAMECODE-' + n }), 'EMPLOYEE_CODE_TAKEN', 'employeeCode'],
    ['work email', (n: number) => ({ workEmail: `same.email.${n}@acme.vn` }), 'WORK_EMAIL_TAKEN', 'workEmail'],
  ])(
    'two entries with the same %s: exactly one is created, the other is told why',
    async (_name, shared, code, field) => {
      const deadlocksBefore = await deadlocks();
      for (let round = 0; round < ROUNDS; round += 1) {
        counter += 1;
        const same = shared(counter);

        const answers = await raceBehindLock(
          'SELECT id FROM departments WHERE code = $1 FOR UPDATE',
          ['P-OPS'],
          [() => enter(entry(same)).then((r) => r), () => enter(entry(same)).then((r) => r)],
        );

        expect(answers.map((answer) => answer.status).sort()).toEqual([201, 422]);
        const loser = answers.find((answer) => answer.status === 422);
        expect((loser?.body as { error: { details: { reasons: unknown } } }).error.details.reasons).toEqual([
          { field, code },
        ]);
        const column = field === 'employeeCode' ? 'employee_code' : 'work_email';
        const value = Object.values(same)[0];
        expect(await rowsWith(`SELECT 1 FROM employees WHERE ${column} = $1`, [value])).toHaveLength(1);
      }
      expect(await deadlocks()).toBe(deadlocksBefore);
    },
    120000,
  );

  const SETTLE_MS = 5000;

  /** Settles while the holder still holds its `FOR SHARE` lock, or fails naming the path that waited. */
  async function settlesWhileShared<T>(work: Promise<T>, what: string): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        work,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error(`${what} waited behind a FOR SHARE lock`)), SETTLE_MS);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  /** A department with no Cost Center yet, written the way the installation writes one (`QĐ-87d(1)`). */
  const bareDepartment = async (): Promise<string> => {
    counter += 1;
    const code = `P-LM${counter}`;

    return (
      await ctx.app
        .get(TransactionRunner)
        .run((tx) =>
          ctx.app
            .get(OrganizationApi)
            .createDepartment(tx, { organizationId: seed.organizationId, code, name: `Lock Department ${counter}` }),
        )
    ).id;
  };

  /** What Finance sends to create the Cost Center of a department. */
  const createCostCenterFor = (departmentId: string) => {
    counter += 1;

    return request(server())
      .post('/api/v1/cost-centers')
      .set(asFinance())
      .send({ code: `CC-LM${counter}`, name: `Lock Cost Center ${counter}`, kind: 'UNIT', departmentId })
      .then((response) => response);
  };

  /** What the Super Admin sends to create a department (after the operator activated the Cost Center link). */
  const createDepartment = () => {
    counter += 1;

    return request(server())
      .post('/api/v1/departments')
      .set({ Authorization: `Bearer ${superAdmin}` })
      .send({ code: `P-LM${counter}`, name: `Lock Department ${counter}` })
      .then((response) => response);
  };

  /**
   * Wave 2 characterization: the lock mode each path takes on the rows it relies on (lock protocol T-11), pinned
   * before the job title, employee and cost center capabilities moved behind the organization facade. A path that
   * takes `FOR SHARE` goes past a held `FOR SHARE`; a path that takes `FOR UPDATE` waits for it.
   */
  describe('lock modes kept by the Wave 2 move', () => {
    // F01 (QĐ-87d(1)): a Cost Center is created FOR a department, so what the creation of a department used to share — a
    // Cost Center — is gone, and the department row is what Finance's creation locks. The old case (a department shares its
    // Cost Center) is replaced by these three; every wait is a pg_locks wait observed through the canonical helper.
    it('creating a department touches no Cost Center: it passes a FOR UPDATE holder of one', async () => {
      const [{ id: costCenterId }] = (
        await ctx.sql.query<{ id: string }>('SELECT id FROM cost_centers ORDER BY code LIMIT 1')
      ).rows;
      await holder.query('BEGIN');
      await holder.query('SELECT id FROM cost_centers WHERE id = $1 FOR UPDATE', [costCenterId]);

      expect((await settlesWhileShared(createDepartment(), 'the department creation')).status).toBe(201);
      await holder.query('COMMIT');
    });

    it('creating the Cost Center of a department locks that department FOR UPDATE: it waits for a FOR SHARE holder (a placement)', async () => {
      const departmentId = await bareDepartment();
      await holder.query('BEGIN');
      await holder.query('SELECT id FROM departments WHERE id = $1 FOR SHARE', [departmentId]);

      let settled = false;
      const creating = createCostCenterFor(departmentId).then((response) => {
        settled = true;

        return response;
      });
      await waitForLockWaiters(ctx.sql, 1);
      // It reached the lock wait and is still waiting while the holder keeps its lock.
      expect(settled).toBe(false);
      await holder.query('COMMIT');

      expect((await creating).status).toBe(201);
      expect(settled).toBe(true);
    });

    it('two creations of a Cost Center for one department, queued one behind the other: the first is created, the second is a 409', async () => {
      const departmentId = await bareDepartment();
      await holder.query('BEGIN');
      await holder.query('SELECT id FROM departments WHERE id = $1 FOR UPDATE', [departmentId]);

      const first = createCostCenterFor(departmentId);
      await waitForLockWaiters(ctx.sql, 1);
      const second = createCostCenterFor(departmentId);
      await waitForLockWaiters(ctx.sql, 2);
      await holder.query('COMMIT');

      const [one, two] = await Promise.all([first, second]);
      // Which one the database serves first is its choice; one is created and the other is refused cleanly.
      expect([one.status, two.status].sort()).toEqual([201, 409]);
      const refused = one.status === 409 ? one : two;
      expect((refused.body as { error: { code: string } }).error.code).toBe('COST_CENTER.DEPARTMENT_ALREADY_LINKED');
      expect(
        (await ctx.sql.query('SELECT count(*)::int AS n FROM cost_centers WHERE department_id = $1', [departmentId]))
          .rows[0],
      ).toEqual({ n: 1 });
    });

    it('the import locks departments FOR SHARE (a job title is free text: nothing else to lock); the employee locks keep their two modes', async () => {
      const organization = ctx.app.get(OrganizationApi);
      const organizationReads = ctx.app.get(OrganizationReadApi);
      const runner = ctx.app.get(TransactionRunner);
      const employeeId = seed.superAdmin.employeeId;
      await holder.query('BEGIN');
      await holder.query('SELECT id FROM departments WHERE id = $1 FOR SHARE', [seed.departmentId]);
      await holder.query('SELECT id FROM employees WHERE id = $1 FOR SHARE', [employeeId]);

      await settlesWhileShared(
        runner.run((tx) => organizationReads.lockForEmployeeImport(tx, [seed.departmentId])),
        'the import locks',
      );
      await settlesWhileShared(
        runner.run((tx) => organizationReads.lockEmployeeForShare(tx, employeeId)),
        'the employee share lock',
      );
      const forUpdate = runner.run((tx) => organization.lockEmployeeForUpdate(tx, employeeId));
      await waitForWaiters(ctx.sql, 1);
      await holder.query('COMMIT');
      await expect(forUpdate).resolves.toBeUndefined();
    });
  });

  /**
   * Wave 3 characterization: the lock modes of the department paths, pinned before the department capability left the
   * module root. Each holder takes the weakest mode that still conflicts with the mode under test and not with the
   * key-share lock a foreign key check takes, so a wait proves the explicit lock and not the write itself.
   */
  describe('lock modes kept by the Wave 3 move', () => {
    // A department with its Cost Center (a department with none takes nobody in), and one person in it.
    const departmentWithMember = async (): Promise<{ id: string; employeeId: string }> => {
      const id = await bareDepartment();
      expect((await createCostCenterFor(id)).status).toBe(201);
      const { code } = (await ctx.sql.query<{ code: string }>('SELECT code FROM departments WHERE id = $1', [id]))
        .rows[0];
      const body = entry({ departmentCode: code });
      const member = await enter(body).expect(201);
      const employeeId = (member.body as { data: { id: string } }).data.id;
      // A head holds MANAGER (QĐ-93a, US-03-06 AC-23): the person has an account that holds it before the department names them.
      await createActivatedAccount(ctx, seed, {
        code: body.employeeCode,
        email: body.workEmail,
        roles: ['MANAGER'],
        admin: superAdmin,
        employeeId,
      });

      return { id, employeeId };
    };
    const assignHead = (departmentId: string, employeeId: string) =>
      request(server())
        .post(`/api/v1/departments/${departmentId}/head-assignments`)
        .set(asSuperAdminWriter())
        .send({ employeeId, effectiveFrom: '2099-01-01' })
        .then((response) => response);

    it('a manual entry takes its department FOR SHARE: it passes a FOR SHARE holder, waits for FOR NO KEY UPDATE', async () => {
      await holder.query('BEGIN');
      await holder.query('SELECT id FROM departments WHERE id = $1 FOR SHARE', [seed.departmentId]);
      const shared = await settlesWhileShared(
        enter(entry({})).then((response) => response),
        'the manual entry',
      );
      expect(shared.status).toBe(201);
      await holder.query('COMMIT');

      await holder.query('BEGIN');
      await holder.query('SELECT id FROM departments WHERE id = $1 FOR NO KEY UPDATE', [seed.departmentId]);
      const waiting = enter(entry({})).then((response) => response);
      await waitForWaiters(ctx.sql, 1);
      await holder.query('COMMIT');
      expect((await waiting).status).toBe(201);
    });

    it('changing, retiring or heading a department takes it FOR UPDATE: each waits for a FOR KEY SHARE holder', async () => {
      const department = await departmentWithMember();
      const empty = { id: await bareDepartment() };
      await holder.query('BEGIN');
      await holder.query('SELECT id FROM departments WHERE id = ANY($1::uuid[]) FOR KEY SHARE', [
        [department.id, empty.id],
      ]);

      const pending = [
        request(server())
          .patch(`/api/v1/departments/${department.id}`)
          .set(asSuperAdminWriter())
          .send({ name: unique('Renamed While Held') })
          .then((response) => response),
        request(server())
          .post(`/api/v1/departments/${empty.id}/deactivate`)
          .set(asSuperAdminWriter())
          .then((response) => response),
        assignHead(department.id, department.employeeId),
      ];
      await waitForWaiters(ctx.sql, pending.length);
      await holder.query('COMMIT');

      expect((await Promise.all(pending)).map((response) => response.status)).toEqual([200, 200, 200]);
    });

    it('naming a head takes the person FOR SHARE: it passes a FOR SHARE holder, waits for FOR NO KEY UPDATE', async () => {
      const shared = await departmentWithMember();
      await holder.query('BEGIN');
      await holder.query('SELECT id FROM employees WHERE id = $1 FOR SHARE', [shared.employeeId]);
      expect((await settlesWhileShared(assignHead(shared.id, shared.employeeId), 'the head assignment')).status).toBe(
        200,
      );
      await holder.query('COMMIT');

      const blocked = await departmentWithMember();
      await holder.query('BEGIN');
      await holder.query('SELECT id FROM employees WHERE id = $1 FOR NO KEY UPDATE', [blocked.employeeId]);
      const waiting = assignHead(blocked.id, blocked.employeeId);
      await waitForWaiters(ctx.sql, 1);
      await holder.query('COMMIT');
      expect((await waiting).status).toBe(200);
    });
  });

  it('leaves every employee with a coherent placement history (I-2 coverage)', async () => {
    await expect(findPlacementCoverageViolations(ctx.sql)).resolves.toEqual([]);
  });
});
