import request from 'supertest';
import { Client } from 'pg';
import { ApiAccount, adminToken, createActivatedAccount } from '../support/api-accounts';
import { HttpTestApp, SeededInstallation, createHttpTestApp, seedInstallation } from '../support/http-test-app';
import { TransactionRunner } from '../../src/infrastructure/database/transaction-runner';
import { OrganizationService } from '../../src/modules/organization/organization.service';
import { findPlacementCoverageViolations } from '../support/placement-coverage';

const ROUNDS = 6;

/** Resolves once at least `count` backends are waiting for a lock: never a fixed delay. */
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

describe('lock protocol: job titles and manual entry races (integration, real PostgreSQL)', () => {
  let ctx: HttpTestApp;
  let seed: SeededInstallation;
  let it1: ApiAccount;
  let holder: Client;
  let counter = 0;
  const server = () => ctx.app.getHttpServer();
  const asIt = () => ({ Authorization: `Bearer ${it1.accessToken}` });

  beforeAll(async () => {
    ctx = await createHttpTestApp();
    seed = await seedInstallation(ctx.app);
    const admin = await adminToken(ctx, seed);
    it1 = await createActivatedAccount(ctx, seed, { code: 'E-IT1', email: 'it1@acme.vn', roles: ['IT_ADMIN'], admin });
    holder = new Client({ connectionString: ctx.database.url });
    await holder.connect();
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

  const createTitle = async (name: string): Promise<string> =>
    (
      (await request(server()).post('/api/v1/job-titles').set(asIt()).send({ name }).expect(201)).body as {
        data: { id: string };
      }
    ).data.id;

  const entry = (overrides: Record<string, unknown>) => {
    counter += 1;

    return {
      employeeCode: `E-RC${counter}`,
      fullName: `Race Person ${counter}`,
      workEmail: `race.person.${counter}@acme.vn`,
      employmentType: 'STAFF',
      hireDate: '2026-10-01',
      departmentCode: 'P-OPS',
      jobTitleId: seed.jobTitleId,
      ...overrides,
    };
  };

  const enter = (body: object) => request(server()).post('/api/v1/employees').set(asIt()).send(body);

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

  it('deactivating a title racing an entry that uses it: one wins cleanly, in either order (AC-6)', async () => {
    const deadlocksBefore = await deadlocks();
    let entered = 0;
    let refused = 0;
    for (let round = 0; round < ROUNDS; round += 1) {
      const titleId = await createTitle(unique('Race Title'));
      const body = entry({ jobTitleId: titleId });

      const [deactivation, entryAnswer] = await raceBehindLock(
        'SELECT id FROM job_titles WHERE id = $1 FOR UPDATE',
        [titleId],
        [
          () =>
            request(server())
              .post(`/api/v1/job-titles/${titleId}/deactivate`)
              .set(asIt())
              .then((r) => r),
          () => enter(body).then((r) => r),
        ],
      );

      expect(deactivation.status).toBe(200);
      expect([201, 422]).toContain(entryAnswer.status);
      const title = await rowsWith('SELECT status FROM job_titles WHERE id = $1', [titleId]);
      expect(title).toEqual([{ status: 'INACTIVE' }]);
      const people = await rowsWith('SELECT id FROM employees WHERE employee_code = $1', [body.employeeCode]);
      if (entryAnswer.status === 201) {
        // The entry took the title before it went inactive: the person keeps it (AC-6).
        entered += 1;
        expect(await rowsWith('SELECT 1 FROM employee_placements WHERE job_title_id = $1', [titleId])).toHaveLength(1);
      } else {
        refused += 1;
        expect((entryAnswer.body as { error: { details: { reasons: unknown } } }).error.details.reasons).toEqual([
          { field: 'jobTitleId', code: 'JOB_TITLE_INACTIVE' },
        ]);
        expect(people).toEqual([]);
        expect(await rowsWith('SELECT 1 FROM employee_placements WHERE job_title_id = $1', [titleId])).toEqual([]);
      }
    }
    expect(entered + refused).toBe(ROUNDS);
    expect(await deadlocks()).toBe(deadlocksBefore);
  }, 120000);

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

  it('two title additions with the same name: exactly one is created, the other is a 409', async () => {
    for (let round = 0; round < ROUNDS; round += 1) {
      counter += 1;
      const name = `Same Name ${counter}`;

      const answers = await Promise.all([
        request(server())
          .post('/api/v1/job-titles')
          .set(asIt())
          .send({ name })
          .then((r) => r),
        request(server())
          .post('/api/v1/job-titles')
          .set(asIt())
          .send({ name: name.toUpperCase() })
          .then((r) => r),
      ]);

      expect(answers.map((answer) => answer.status).sort()).toEqual([201, 409]);
      expect(await rowsWith('SELECT 1 FROM job_titles WHERE normalized_name = $1', [name.toLowerCase()])).toHaveLength(
        1,
      );
      const created = await rowsWith(
        `SELECT 1 FROM audit_events WHERE action = 'JOB_TITLE.CREATED' AND after->>'name' ILIKE $1`,
        [name],
      );
      expect(created).toHaveLength(1);
    }
  }, 120000);

  it('two titles renamed to the same name: exactly one is renamed, the other is a 409 and keeps its name', async () => {
    for (let round = 0; round < ROUNDS; round += 1) {
      const first = await createTitle(unique('Rename A'));
      const second = await createTitle(unique('Rename B'));
      counter += 1;
      const target = `Contested ${counter}`;

      const answers = await Promise.all([
        request(server())
          .patch(`/api/v1/job-titles/${first}`)
          .set(asIt())
          .send({ name: target })
          .then((r) => r),
        request(server())
          .patch(`/api/v1/job-titles/${second}`)
          .set(asIt())
          .send({ name: target })
          .then((r) => r),
      ]);

      expect(answers.map((answer) => answer.status).sort()).toEqual([200, 409]);
      expect(await rowsWith('SELECT 1 FROM job_titles WHERE name = $1', [target])).toHaveLength(1);
      const renamed = await rowsWith(
        `SELECT 1 FROM audit_events WHERE action = 'JOB_TITLE.RENAMED' AND after->>'name' = $1`,
        [target],
      );
      expect(renamed).toHaveLength(1);
    }
  }, 120000);

  it('a rename racing a deactivation of the same title: both apply, none is lost', async () => {
    const deadlocksBefore = await deadlocks();
    for (let round = 0; round < ROUNDS; round += 1) {
      const titleId = await createTitle(unique('Both Ways'));
      const newName = unique('Both Ways Renamed');

      const answers = await raceBehindLock(
        'SELECT id FROM job_titles WHERE id = $1 FOR UPDATE',
        [titleId],
        [
          () =>
            request(server())
              .patch(`/api/v1/job-titles/${titleId}`)
              .set(asIt())
              .send({ name: newName })
              .then((r) => r),
          () =>
            request(server())
              .post(`/api/v1/job-titles/${titleId}/deactivate`)
              .set(asIt())
              .then((r) => r),
        ],
      );

      expect(answers.map((answer) => answer.status)).toEqual([200, 200]);
      expect(await rowsWith('SELECT name, status, version FROM job_titles WHERE id = $1', [titleId])).toEqual([
        { name: newName, status: 'INACTIVE', version: 3 },
      ]);
    }
    expect(await deadlocks()).toBe(deadlocksBefore);
  }, 120000);

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

  const freeUnitCostCenter = async (): Promise<string> => {
    counter += 1;
    const code = `CC-LM${counter}`;

    return (
      await ctx.app
        .get(TransactionRunner)
        .run((tx) =>
          ctx.app
            .get(OrganizationService)
            .createUnitCostCenter(tx, { organizationId: seed.organizationId, code, name: `Lock ${code}` }),
        )
    ).id;
  };

  const createDepartment = (costCenterId: string) => {
    counter += 1;

    return request(server())
      .post('/api/v1/departments')
      .set(asIt())
      .send({ code: `P-LM${counter}`, name: `Lock Department ${counter}`, costCenterId })
      .then((response) => response);
  };

  /**
   * Wave 2 characterization: the lock mode each path takes on the rows it relies on (lock protocol T-11), pinned
   * before the job title, employee and cost center capabilities moved behind the organization facade. A path that
   * takes `FOR SHARE` goes past a held `FOR SHARE`; a path that takes `FOR UPDATE` waits for it.
   */
  describe('lock modes kept by the Wave 2 move', () => {
    it('a manual entry shares the job title it names; a rename of that title waits', async () => {
      const titleId = await createTitle(unique('Shared Title'));
      await holder.query('BEGIN');
      await holder.query('SELECT id FROM job_titles WHERE id = $1 FOR SHARE', [titleId]);

      const entered = await settlesWhileShared(
        enter(entry({ jobTitleId: titleId })).then((response) => response),
        'the manual entry',
      );
      expect(entered.status).toBe(201);

      const rename = request(server())
        .patch(`/api/v1/job-titles/${titleId}`)
        .set(asIt())
        .send({ name: unique('Shared Title Renamed') })
        .then((response) => response);
      await waitForWaiters(ctx.sql, 1);
      await holder.query('COMMIT');
      expect((await rename).status).toBe(200);
    });

    it('creating a department shares its cost center: it passes a FOR SHARE holder and waits for a FOR UPDATE one', async () => {
      const shared = await freeUnitCostCenter();
      await holder.query('BEGIN');
      await holder.query('SELECT id FROM cost_centers WHERE id = $1 FOR SHARE', [shared]);
      expect((await settlesWhileShared(createDepartment(shared), 'the department creation')).status).toBe(201);
      await holder.query('COMMIT');

      const updated = await freeUnitCostCenter();
      await holder.query('BEGIN');
      await holder.query('SELECT id FROM cost_centers WHERE id = $1 FOR UPDATE', [updated]);
      const waiting = createDepartment(updated);
      await waitForWaiters(ctx.sql, 1);
      await holder.query('COMMIT');
      expect((await waiting).status).toBe(201);
    });

    it('the import locks departments and job titles FOR SHARE; the employee locks keep their two modes', async () => {
      const organization = ctx.app.get(OrganizationService);
      const runner = ctx.app.get(TransactionRunner);
      const employeeId = seed.superAdmin.employeeId;
      await holder.query('BEGIN');
      await holder.query('SELECT id FROM departments WHERE id = $1 FOR SHARE', [seed.departmentId]);
      await holder.query('SELECT id FROM job_titles WHERE id = $1 FOR SHARE', [seed.jobTitleId]);
      await holder.query('SELECT id FROM employees WHERE id = $1 FOR SHARE', [employeeId]);

      await settlesWhileShared(
        runner.run((tx) => organization.lockForEmployeeImport(tx, [seed.departmentId], [seed.jobTitleId])),
        'the import locks',
      );
      await settlesWhileShared(
        runner.run((tx) => organization.lockEmployeeForShare(tx, employeeId)),
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
    const departmentWithMember = async (): Promise<{ id: string; employeeId: string }> => {
      const created = await createDepartment(await freeUnitCostCenter());
      const department = (created.body as { data: { id: string; code: string } }).data;
      const member = await enter(entry({ departmentCode: department.code })).expect(201);

      return { id: department.id, employeeId: (member.body as { data: { id: string } }).data.id };
    };
    const assignHead = (departmentId: string, employeeId: string) =>
      request(server())
        .post(`/api/v1/departments/${departmentId}/head-assignments`)
        .set(asIt())
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
      const empty = (
        (await createDepartment(await freeUnitCostCenter())).body as {
          data: { id: string };
        }
      ).data;
      await holder.query('BEGIN');
      await holder.query('SELECT id FROM departments WHERE id = ANY($1::uuid[]) FOR KEY SHARE', [
        [department.id, empty.id],
      ]);

      const pending = [
        request(server())
          .patch(`/api/v1/departments/${department.id}`)
          .set(asIt())
          .send({ name: unique('Renamed While Held') })
          .then((response) => response),
        request(server())
          .post(`/api/v1/departments/${empty.id}/deactivate`)
          .set(asIt())
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
