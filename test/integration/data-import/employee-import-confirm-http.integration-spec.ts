import request from 'supertest';
import { Client } from 'pg';
import { EmployeeImportHttpHarness, type ImportWire, today, addDays } from '../../support/employee-import-http-harness';

describe('importing people from a file over HTTP (integration, real PostgreSQL): confirmation, the same file twice, a stale preview and two confirmations at once', () => {
  const h = new EmployeeImportHttpHarness();
  const {
    server,
    asSuper,
    unique,
    errorOf,
    importOf,
    newDepartment,
    retireDepartment,
    personRow,
    csv,
    upload,
    confirm,
    rowsOf,
    count,
  } = h;

  beforeAll(async () => {
    await h.start();
  }, 120000);

  afterAll(async () => {
    await h.stop();
  });

  describe('confirmation writes the people once (AC-2, AC-8, AC-10)', () => {
    it('creates exactly the valid rows, as members from today, with no account, role, invitation or mail, and records it', async () => {
      const department = await newDepartment();
      const accounts = await count('app_users');
      const grants = await count('role_grants');
      const tokens = await count('account_action_tokens');
      const mail = await count('email_outbox');
      const rows = [
        ...Array.from({ length: 5 }, () => personRow({ department_code: department, hire_date: addDays(today(), 20) })),
        personRow({ department_code: department, hire_date: 'x' }),
      ];
      const uploaded = importOf(await upload(csv(rows)).expect(201));
      const people = await count('employees');

      const response = await confirm(uploaded.id, { previewVersion: 1, idempotencyKey: unique('key-0000') }).expect(
        200,
      );

      const done = (response.body as { data: { replayed: boolean; import: ImportWire } }).data;
      expect(done.replayed).toBe(false);
      expect(done.import).toMatchObject({
        status: 'COMPLETED',
        result: {
          created: 5,
          existingSame: 0,
          existingDifferent: 0,
          errors: 1,
          createdByDepartment: [{ departmentCode: department, count: 5 }],
          departmentsWithoutHead: [{ code: department }],
        },
      });
      expect(await count('employees')).toBe(people + 5);
      // A hire date in the future still makes the person a member of the department from today (US-02-02 AC-15).
      const placements = await h.ctx.sql.query<{ valid_from: string; hire_date: string }>(
        `SELECT p.valid_from::text AS valid_from, e.hire_date::text AS hire_date FROM employee_placements p JOIN employees e ON e.id = p.employee_id
          JOIN departments d ON d.id = p.department_id WHERE d.code = $1`,
        [department],
      );
      expect(placements.rows).toHaveLength(5);
      for (const row of placements.rows) {
        expect(row.valid_from).toBe(today());
        expect(row.hire_date).toBe(addDays(today(), 20));
      }
      expect([
        await count('app_users'),
        await count('role_grants'),
        await count('account_action_tokens'),
        await count('email_outbox'),
      ]).toEqual([accounts, grants, tokens, mail]);
      const events = await h.ctx.sql.query<{ action: string; after: Record<string, unknown> }>(
        `SELECT action, after FROM audit_events WHERE resource_id = $1 ORDER BY occurred_at, id`,
        [uploaded.id],
      );
      expect(events.rows.map((event) => event.action)).toEqual([
        'EMPLOYEE_IMPORT.UPLOADED',
        'EMPLOYEE_IMPORT.CONFIRMED',
      ]);
      expect(events.rows[1].after).toMatchObject({ status: 'COMPLETED', created: 5, errors: 1 });
      // The errors are still there to download after the write.
      expect((await rowsOf(uploaded.id, 'ERROR')).map((row) => row.line)).toEqual([7]);
    });

    it('gives the same answer to the same confirmation sent again, without writing twice (AC-10)', async () => {
      const uploaded = importOf(await upload(csv([personRow(), personRow()])).expect(201));
      const key = unique('key-0000');
      const people = await count('employees');
      await confirm(uploaded.id, { previewVersion: 1, idempotencyKey: key }).expect(200);

      const again = await confirm(uploaded.id, { previewVersion: 1, idempotencyKey: key }).expect(200);

      expect((again.body as { data: { replayed: boolean } }).data.replayed).toBe(true);
      expect(await count('employees')).toBe(people + 2);
    });

    it('refuses a second confirmation with another key, with the result of the first (AC-10)', async () => {
      const uploaded = importOf(await upload(csv([personRow()])).expect(201));
      await confirm(uploaded.id, { previewVersion: 1, idempotencyKey: unique('key-0000') }).expect(200);

      const second = await confirm(uploaded.id, { previewVersion: 1, idempotencyKey: unique('key-0000') }).expect(409);

      expect(errorOf(second)).toMatchObject({ code: 'IMPORT.ALREADY_CONFIRMED', details: { result: { created: 1 } } });
    });

    it('writes nothing when the preview is thrown away (AC-3), and cancelling twice is the same', async () => {
      const uploaded = importOf(await upload(csv([personRow(), personRow()])).expect(201));
      const people = await count('employees');

      const first = await request(server())
        .post(`/api/v1/employee-imports/${uploaded.id}/cancellations`)
        .set(asSuper())
        .expect(200);
      await request(server()).post(`/api/v1/employee-imports/${uploaded.id}/cancellations`).set(asSuper()).expect(200);
      const confirmed = await confirm(uploaded.id, { previewVersion: 1, idempotencyKey: unique('key-0000') }).expect(
        409,
      );

      expect(importOf(first).status).toBe('CANCELLED');
      expect(errorOf(confirmed).code).toBe('IMPORT.CANCELLED');
      expect(await count('employees')).toBe(people);
    });

    it('refuses a preview that expired, and one that is not the current version', async () => {
      const uploaded = importOf(await upload(csv([personRow()])).expect(201));
      const people = await count('employees');

      const outdated = await confirm(uploaded.id, { previewVersion: 2, idempotencyKey: unique('key-0000') }).expect(
        409,
      );
      await h.ctx.sql.query(`UPDATE employee_imports SET expires_at = now() - interval '1 minute' WHERE id = $1`, [
        uploaded.id,
      ]);
      const expired = await confirm(uploaded.id, { previewVersion: 1, idempotencyKey: unique('key-0000') }).expect(409);

      expect(errorOf(outdated)).toMatchObject({ code: 'IMPORT.PREVIEW_OUTDATED', details: { currentVersion: 1 } });
      expect(errorOf(expired).code).toBe('IMPORT.EXPIRED');
      expect(await count('employees')).toBe(people);
    });

    it('is 404 for an import that does not exist, on every route', async () => {
      const missing = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';

      await request(server()).get(`/api/v1/employee-imports/${missing}`).set(asSuper()).expect(404);
      await request(server()).get(`/api/v1/employee-imports/${missing}/rows`).set(asSuper()).expect(404);
      await request(server()).post(`/api/v1/employee-imports/${missing}/preview-refreshes`).set(asSuper()).expect(404);
      await request(server()).post(`/api/v1/employee-imports/${missing}/cancellations`).set(asSuper()).expect(404);
      await confirm(missing, { previewVersion: 1, idempotencyKey: 'a-key-of-8' }).expect(404);
    });
  });

  describe('the same file twice (AC-4)', () => {
    it('warns when a file with the same content was imported before, and writes it again only on a deliberate yes', async () => {
      const content = csv([personRow(), personRow()]);
      const first = importOf(await upload(content, 'first.csv').expect(201));
      await confirm(first.id, { previewVersion: 1, idempotencyKey: unique('key-0000') }).expect(200);

      const second = importOf(await upload(content, 'second.csv').expect(201));
      const refused = await confirm(second.id, { previewVersion: 1, idempotencyKey: unique('key-0000') }).expect(409);
      const people = await count('employees');
      const accepted = await confirm(second.id, {
        previewVersion: 1,
        idempotencyKey: unique('key-0000'),
        acknowledgeDuplicateFile: true,
      }).expect(200);

      expect(second.summary.duplicateOf).toMatchObject({ importId: first.id, fileName: 'first.csv' });
      expect(errorOf(refused)).toMatchObject({ code: 'IMPORT.DUPLICATE_FILE_NOT_ACKNOWLEDGED' });
      // Everyone in it is there already, so writing it again changes nothing: the same people are not created twice.
      expect((accepted.body as { data: { import: ImportWire } }).data.import.result).toMatchObject({
        created: 0,
        existingSame: 2,
      });
      expect(await count('employees')).toBe(people);
    });
  });

  describe('a preview that no longer matches the data writes nothing (AC-9)', () => {
    it('is refused when someone takes a code of the file in the meantime, until the preview is looked at again', async () => {
      const taken = unique('EI-RACE-');
      const uploaded = importOf(await upload(csv([personRow({ employee_code: taken }), personRow()])).expect(201));
      await request(server())
        .post('/api/v1/employees')
        .set(asSuper())
        .send({
          employeeCode: taken,
          fullName: 'Entered by hand first',
          employmentType: 'STAFF',
          hireDate: '2026-09-01',
          departmentCode: 'P-OPS',
          jobTitle: 'Administrator',
        })
        .expect(201);
      const people = await count('employees');

      const stale = await confirm(uploaded.id, { previewVersion: 1, idempotencyKey: unique('key-0000') }).expect(409);

      expect(errorOf(stale)).toMatchObject({ code: 'IMPORT.PREVIEW_STALE', details: { changedLines: [2] } });
      expect(await count('employees')).toBe(people);
      const refreshed = importOf(
        await request(server())
          .post(`/api/v1/employee-imports/${uploaded.id}/preview-refreshes`)
          .set(asSuper())
          .expect(200),
      );
      expect(refreshed).toMatchObject({ previewVersion: 2, summary: { valid: 1, existingDifferent: 1 } });
      await confirm(uploaded.id, { previewVersion: 1, idempotencyKey: unique('key-0000') }).expect(409);
      const written = await confirm(uploaded.id, { previewVersion: 2, idempotencyKey: unique('key-0000') }).expect(200);
      expect((written.body as { data: { import: ImportWire } }).data.import.result).toMatchObject({ created: 1 });
    });

    it('is refused when the department of a row is retired in the meantime', async () => {
      const department = await newDepartment();
      const uploaded = importOf(await upload(csv([personRow({ department_code: department })])).expect(201));
      await retireDepartment(department);
      const people = await count('employees');

      const stale = await confirm(uploaded.id, { previewVersion: 1, idempotencyKey: unique('key-0000') }).expect(409);

      expect(errorOf(stale).code).toBe('IMPORT.PREVIEW_STALE');
      expect(await count('employees')).toBe(people);
    });
  });

  describe('two confirmations at the same moment (AC-8)', () => {
    let holder: Client;

    beforeAll(async () => {
      holder = new Client({ connectionString: h.ctx.database.url });
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
          'SELECT count(*)::int AS waiting FROM pg_locks l JOIN pg_stat_activity a ON a.pid = l.pid WHERE NOT l.granted AND a.datname = current_database()',
        );
        if (rows[0].waiting >= count) return;
        if (Date.now() > deadline) throw new Error(`Fewer than ${count} backends reached a lock wait in time.`);
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
    }

    it('writes the people once: one confirmation wins, the other is told it was written', async () => {
      const deadlocks = async () =>
        (
          await h.ctx.sql.query<{ n: number }>(
            'SELECT deadlocks::int AS n FROM pg_stat_database WHERE datname = current_database()',
          )
        ).rows[0].n;
      const deadlocksBefore = await deadlocks();
      for (let round = 0; round < 3; round += 1) {
        const uploaded = importOf(await upload(csv([personRow(), personRow(), personRow()])).expect(201));
        const people = await count('employees');

        await holder.query('BEGIN');
        await holder.query('SELECT id FROM employee_imports WHERE id = $1 FOR UPDATE', [uploaded.id]);
        const first = confirm(uploaded.id, { previewVersion: 1, idempotencyKey: unique('key-0000') }).then((r) => r);
        const second = confirm(uploaded.id, { previewVersion: 1, idempotencyKey: unique('key-0000') }).then((r) => r);
        await waitForWaiters(h.ctx.sql, 2);
        await holder.query('COMMIT');
        const answers = (await Promise.all([first, second])).map((answer) => answer.status).sort();

        expect(answers).toEqual([200, 409]);
        expect(await count('employees')).toBe(people + 3);
      }
      expect(await deadlocks()).toBe(deadlocksBefore);
    });
  });

  it('leaves every employee with exactly the placements the invariant I-2 asks for', async () => {
    expect(await h.placementViolations()).toEqual([]);
  });
});
