import { createHash } from 'node:crypto';
import request from 'supertest';
import { NotificationsApi } from '../../../src/modules/notifications/public/notifications.api';
import { EmployeeImportHttpHarness, HEADER, today } from '../../support/employee-import-http-harness';

/** What a confirmation carried before `QĐ-93f`: it takes no HR basis any more, so a body that still carries one is refused. */
const HR_BASIS_BODY = {
  type: 'LABOR_CONTRACT',
  reference: 'HD-2026-001',
  issuer: 'HR Department',
  issuedOn: '2026-10-01',
};

describe('importing people from a file over HTTP (integration, real PostgreSQL): the exact wire and Audit Trail, no HR basis and the notices of the people created', () => {
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

  describe('the exact wire of every route and the exact Audit Trail (characterization)', () => {
    const ISO = expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/) as unknown;
    const IMPORT_KEYS = [
      'id',
      'fileName',
      'status',
      'previewVersion',
      'ignoredColumns',
      'summary',
      'result',
      'createdAt',
      'expiresAt',
      'confirmedAt',
      'cancelledAt',
    ];
    interface AuditRow {
      actor_kind: string;
      actor_app_user_id: string | null;
      actor_roles: string[];
      action: string;
      resource_type: string;
      resource_id: string;
      before: unknown;
      after: unknown;
      correlation_id: string;
      operator_reference: string | null;
    }
    const auditOf = async (id: string): Promise<AuditRow[]> =>
      (
        await h.ctx.sql.query<AuditRow>(
          `SELECT actor_kind, actor_app_user_id, actor_roles, action, resource_type, resource_id, before, after,
                  correlation_id, operator_reference
             FROM audit_events WHERE resource_id = $1 ORDER BY occurred_at, id`,
          [id],
        )
      ).rows;
    const sessionsOf = async (appUserId: string): Promise<string[]> =>
      (
        await h.ctx.sql.query<{ id: string }>('SELECT id::text AS id FROM auth_sessions WHERE app_user_id = $1', [
          appUserId,
        ])
      ).rows.map((row) => row.id);
    const bySuperAdmin = (action: string, resourceId: string, before: unknown, after: unknown) => ({
      actor_kind: 'USER',
      actor_app_user_id: h.adminAppUserId,
      actor_roles: ['SUPER_ADMIN'],
      action,
      resource_type: 'EmployeeImport',
      resource_id: resourceId,
      before,
      after,
      correlation_id: expect.any(String) as unknown,
      operator_reference: null,
    });
    const people = (department: string) => {
      const valid = {
        employee_code: unique('EW-'),
        full_name: 'Wire Person',
        work_email: `${unique('wire.')}@acme.vn`,
        department_code: department,
      };
      const wrong = { ...valid, employee_code: unique('EW-'), work_email: '', hire_date: 'x', full_name: 'Wrong Wire' };

      return { valid, wrong, content: csv([personRow(valid), personRow(wrong)], `${HEADER},notes`) };
    };

    it('upload, view, rows, refresh, confirm and replay answer exactly these bodies; only upload and confirm are audited', async () => {
      const department = await newDepartment();
      const { valid, wrong, content } = people(department);
      const summary = {
        totalRows: 2,
        valid: 1,
        errors: 1,
        existingSame: 0,
        existingDifferent: 0,
        newPeopleByDepartment: [{ departmentCode: department, count: 1 }],
        newUnplaced: 0,
        departmentsWithoutHead: [{ code: department, name: `Department ${department}` }],
        reviewQueue: { total: 0, items: [] },
        duplicateOf: null,
      };

      const uploaded = await upload(content, 'wire.csv').expect(201);
      const id = importOf(uploaded).id;
      const preview = {
        id,
        fileName: 'wire.csv',
        status: 'PREVIEW',
        previewVersion: 1,
        ignoredColumns: ['notes'],
        summary,
        result: null,
        createdAt: ISO,
        expiresAt: ISO,
        confirmedAt: null,
        cancelledAt: null,
      };
      expect(uploaded.body).toEqual({ success: true, message: 'EMPLOYEE_IMPORT.UPLOADED', data: preview });
      expect(Object.keys(importOf(uploaded))).toEqual(IMPORT_KEYS);
      const createdAt = Date.parse((importOf(uploaded) as unknown as { createdAt: string }).createdAt);
      const expiresAt = Date.parse((importOf(uploaded) as unknown as { expiresAt: string }).expiresAt);
      expect(Math.abs(expiresAt - createdAt - 24 * 60 * 60 * 1000)).toBeLessThan(10_000);

      const viewed = await request(server()).get(`/api/v1/employee-imports/${id}`).set(asSuper()).expect(200);
      expect(viewed.body).toEqual({ success: true, message: 'EMPLOYEE_IMPORT.FETCHED', data: importOf(uploaded) });

      const page = await request(server())
        .get(`/api/v1/employee-imports/${id}/rows?page=2&pageSize=1`)
        .set(asSuper())
        .expect(200);
      expect(page.body).toEqual({
        success: true,
        message: 'EMPLOYEE_IMPORT.ROWS_LISTED',
        data: {
          items: [
            {
              line: 3,
              outcome: 'ERROR',
              cells: {
                employee_code: wrong.employee_code,
                full_name: 'Wrong Wire',
                work_email: '',
                employment_type: 'STAFF',
                hire_date: 'x',
                department_code: department,
                job_title: 'Administrator',
              },
              errors: [{ column: 'hire_date', code: 'HIRE_DATE_INVALID' }],
              differences: null,
              unplaced: null,
            },
          ],
          pagination: { page: 2, pageSize: 1, totalItems: 2, totalPages: 2 },
        },
      });
      expect(Object.keys((page.body as { data: { items: object[] } }).data.items[0])).toEqual([
        'line',
        'outcome',
        'unplaced',
        'cells',
        'errors',
        'differences',
      ]);

      const refreshed = await request(server())
        .post(`/api/v1/employee-imports/${id}/preview-refreshes`)
        .set(asSuper())
        .expect(200);
      expect(refreshed.body).toEqual({
        success: true,
        message: 'EMPLOYEE_IMPORT.PREVIEW_REFRESHED',
        data: { ...preview, previewVersion: 2 },
      });

      const key = unique('key-wire-');
      const confirmed = await confirm(id, { previewVersion: 2, idempotencyKey: key }).expect(200);
      const result = {
        created: 1,
        existingSame: 0,
        existingDifferent: 0,
        errors: 1,
        createdByDepartment: [{ departmentCode: department, count: 1 }],
        newUnplaced: 0,
        departmentsWithoutHead: [{ code: department, name: `Department ${department}` }],
      };
      expect(confirmed.body).toEqual({
        success: true,
        message: 'EMPLOYEE_IMPORT.CONFIRMED',
        data: {
          replayed: false,
          import: { ...preview, status: 'COMPLETED', previewVersion: 2, result, confirmedAt: ISO },
        },
      });
      expect(Object.keys((confirmed.body as { data: object }).data)).toEqual(['replayed', 'import']);

      const replay = await confirm(id, { previewVersion: 2, idempotencyKey: key }).expect(200);
      expect(replay.body).toEqual({
        success: true,
        message: 'EMPLOYEE_IMPORT.CONFIRMED',
        data: { replayed: true, import: (confirmed.body as { data: { import: unknown } }).data.import },
      });

      const audit = await auditOf(id);
      expect(audit).toEqual([
        bySuperAdmin('EMPLOYEE_IMPORT.UPLOADED', id, null, {
          fileName: 'wire.csv',
          fileDigest: createHash('sha256').update(Buffer.from(content)).digest('hex'),
          rows: 2,
          valid: 1,
          errors: 1,
        }),
        bySuperAdmin(
          'EMPLOYEE_IMPORT.CONFIRMED',
          id,
          { status: 'PREVIEW', previewVersion: 2 },
          {
            status: 'COMPLETED',
            created: 1,
            existingSame: 0,
            existingDifferent: 0,
            errors: 1,
            repeatedFile: false,
          },
        ),
      ]);
      const sessions = await sessionsOf(h.adminAppUserId);
      for (const event of audit) expect(sessions).toContain(event.correlation_id);
      const recorded = JSON.stringify(audit);
      for (const raw of [valid.full_name, valid.work_email, wrong.full_name, 'notes']) {
        expect(recorded).not.toContain(raw);
      }
    });

    it('cancel answers exactly the cancelled import twice, and is audited once', async () => {
      const { content } = people(await newDepartment());
      const id = importOf(await upload(content, 'cancel.csv').expect(201)).id;

      const first = await request(server())
        .post(`/api/v1/employee-imports/${id}/cancellations`)
        .set(asSuper())
        .expect(200);
      const second = await request(server())
        .post(`/api/v1/employee-imports/${id}/cancellations`)
        .set(asSuper())
        .expect(200);

      expect(first.body).toEqual({
        success: true,
        message: 'EMPLOYEE_IMPORT.CANCELLED',
        data: expect.objectContaining({ id, status: 'CANCELLED', cancelledAt: ISO, confirmedAt: null }) as unknown,
      });
      expect(Object.keys(importOf(first))).toEqual(IMPORT_KEYS);
      expect(second.body).toEqual(first.body);
      expect((await auditOf(id)).map((event) => [event.action, event.before, event.after])).toEqual([
        ['EMPLOYEE_IMPORT.UPLOADED', null, expect.objectContaining({ fileName: 'cancel.csv' })],
        ['EMPLOYEE_IMPORT.CANCELLED', { status: 'PREVIEW' }, { status: 'CANCELLED' }],
      ]);
      expect((await auditOf(id))[1]).toEqual(
        bySuperAdmin('EMPLOYEE_IMPORT.CANCELLED', id, { status: 'PREVIEW' }, { status: 'CANCELLED' }),
      );
    });

    it('answers refusals in the exact error envelope', async () => {
      const missing = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';
      const id = importOf(await upload(people(await newDepartment()).content).expect(201)).id;

      const notFound = await request(server()).get(`/api/v1/employee-imports/${missing}`).set(asSuper()).expect(404);
      const outdated = await confirm(id, { previewVersion: 5, idempotencyKey: unique('key-wire-') }).expect(409);
      const missingColumns = await upload('employee_code,full_name\nX,Y\n').expect(422);

      expect(notFound.body).toEqual({
        success: false,
        error: { code: 'IMPORT.NOT_FOUND', message: 'Import not found.', requestId: expect.any(String) as unknown },
      });
      expect(outdated.body).toEqual({
        success: false,
        error: {
          code: 'IMPORT.PREVIEW_OUTDATED',
          message: 'The preview that was confirmed is not the current one.',
          details: { currentVersion: 1 },
          requestId: expect.any(String) as unknown,
        },
      });
      expect(missingColumns.body).toEqual({
        success: false,
        error: {
          code: 'IMPORT.FILE_MISSING_COLUMNS',
          message: 'The file lacks required columns: employment_type, hire_date.',
          details: { missing: ['employment_type', 'hire_date'] },
          requestId: expect.any(String) as unknown,
        },
      });
    });

    it('rolls a stale confirmation back whole: the preview, its rows and the Audit Trail stay as they were', async () => {
      const department = await newDepartment();
      const retiring = await newDepartment();
      const id = importOf(
        await upload(
          csv([personRow({ department_code: department }), personRow({ department_code: retiring })]),
        ).expect(201),
      ).id;
      const rowsBefore = await rowsOf(id);
      await retireDepartment(retiring);
      const people = await count('employees');

      const stale = await confirm(id, { previewVersion: 1, idempotencyKey: unique('key-wire-') }).expect(409);

      expect(errorOf(stale)).toEqual({
        code: 'IMPORT.PREVIEW_STALE',
        message: 'The data changed since the preview; look at the preview again.',
        details: { changedLines: [3] },
        requestId: expect.any(String) as unknown,
      });
      expect(await count('employees')).toBe(people);
      const stored = await h.ctx.sql.query<{ status: string; preview_version: number; confirm_key: string | null }>(
        'SELECT status, preview_version, confirm_key, result FROM employee_imports WHERE id = $1',
        [id],
      );
      expect(stored.rows[0]).toEqual({ status: 'PREVIEW', preview_version: 1, confirm_key: null, result: null });
      expect(await rowsOf(id)).toEqual(rowsBefore);
      expect((await auditOf(id)).map((event) => event.action)).toEqual(['EMPLOYEE_IMPORT.UPLOADED']);
    });
  });

  describe('no HR basis and the record of the Super Admin (US-02-02 AC-16, AC-18, QĐ-93f)', () => {
    it('refuses a confirmation that still carries an HR basis, which none takes since QĐ-93f, and writes nothing', async () => {
      const department = await newDepartment();
      const uploaded = importOf(await upload(csv([personRow({ department_code: department })])).expect(201));
      const people = await count('employees');

      const refused = await confirm(
        uploaded.id,
        { previewVersion: 1, idempotencyKey: unique('key-0000'), hrBasis: HR_BASIS_BODY },
        asSuper(),
      ).expect(422);

      expect(errorOf(refused).code).toBe('VALIDATION_ERROR');
      expect(JSON.stringify(refused.body)).toContain('unrecognized_keys');
      expect(await count('employees')).toBe(people);
      expect(
        importOf(await request(server()).get(`/api/v1/employee-imports/${uploaded.id}`).set(asSuper()).expect(200))
          .status,
      ).toBe('PREVIEW');
    });

    it('confirms with no HR basis at all and writes the people (US-02-02 AC-1, AC-13, QĐ-93f)', async () => {
      const department = await newDepartment();
      const uploaded = importOf(await upload(csv([personRow({ department_code: department })])).expect(201));
      const people = await count('employees');

      await confirm(uploaded.id, { previewVersion: 1, idempotencyKey: unique('key-0000') }, asSuper()).expect(200);

      expect(await count('employees')).toBe(people + 1);
    });

    it('puts no HR basis in the Audit Trail of every person created, only the code, the department and the title and no name or email (QĐ-93f)', async () => {
      const department = await newDepartment();
      const rows = [personRow({ department_code: department }), personRow({ department_code: department })];
      const uploaded = importOf(await upload(csv(rows)).expect(201));
      await confirm(uploaded.id, { previewVersion: 1, idempotencyKey: unique('key-0000') }).expect(200);

      const events = await h.ctx.sql.query<{
        actor_roles: string[];
        resource_id: string;
        after: Record<string, unknown>;
      }>(
        `SELECT a.actor_roles, a.resource_id, a.after
           FROM audit_events a JOIN employees e ON e.id::text = a.resource_id
           JOIN employee_placements p ON p.employee_id = e.id JOIN departments d ON d.id = p.department_id
          WHERE a.action = 'EMPLOYEE.CREATED' AND d.code = $1 ORDER BY e.employee_code`,
        [department],
      );

      expect(events.rows).toHaveLength(2);
      for (const event of events.rows) {
        expect(event.actor_roles).toEqual(['SUPER_ADMIN']);
        expect(event.after).toEqual({
          employeeCode: expect.any(String) as unknown,
          department,
          jobTitle: 'Administrator',
          importId: uploaded.id,
        });
      }
    });

    it('refuses a row with the code or the work email of the Super Admin who imports, even when it would only be a person already there', async () => {
      const own = (
        await h.ctx.sql.query<{ code: string; email: string }>(
          `SELECT e.employee_code AS code, e.work_email AS email FROM employees e JOIN app_users u ON u.employee_id = e.id
             JOIN role_grants g ON g.app_user_id = u.id AND g.role = 'SUPER_ADMIN' AND g.revoked_at IS NULL`,
        )
      ).rows[0];
      const department = await newDepartment();

      const uploaded = importOf(
        await upload(
          csv([
            personRow({ department_code: department }),
            personRow({ employee_code: own.code, department_code: department }),
            personRow({ work_email: own.email.toUpperCase(), department_code: department }),
          ]),
        ).expect(201),
      );

      expect(uploaded.summary).toMatchObject({ totalRows: 3, valid: 1, errors: 2 });
      expect((await rowsOf(uploaded.id, 'ERROR')).map((row) => row.errors)).toEqual([
        [{ column: 'employee_code', code: 'OWN_RECORD' }],
        [{ column: 'work_email', code: 'OWN_RECORD' }],
      ]);
    });
  });

  describe('the in-app notices of the people created (US-02-02 AC-17, F17)', () => {
    it('tells the head of the department and the IT Admin in charge of each person created, in the confirming transaction, with ids only', async () => {
      const department = await newDepartment();
      const departmentId = (
        await h.ctx.sql.query<{ id: string }>('SELECT id FROM departments WHERE code = $1', [department])
      ).rows[0].id;
      await h.ctx.sql.query('UPDATE departments SET it_admin_employee_id = $2 WHERE id = $1', [
        departmentId,
        h.it1.employeeId,
      ]);
      const headCode = unique('E-HEADED');
      const headId = (
        (
          await request(server())
            .post('/api/v1/employees')
            .set(asSuper())
            .send({
              employeeCode: headCode,
              fullName: 'Head Person',
              employmentType: 'STAFF',
              hireDate: '2026-09-01',
              departmentCode: department,
              jobTitle: 'Head',
            })
            .expect(201)
        ).body as { data: { id: string } }
      ).data.id;
      await h.ctx.sql.query(
        `INSERT INTO department_head_periods (id, organization_id, department_id, employee_id, valid_from)
         VALUES (gen_random_uuid(), $1, $2, $3, $4)`,
        [h.seed.organizationId, departmentId, headId, today()],
      );
      const rows = [personRow({ department_code: department }), personRow({ department_code: department })];
      const codes = rows.map((row) => row.split(',')[0]);
      const data = importOf(await upload(csv(rows)).expect(201));

      await confirm(data.id, { previewVersion: 1, idempotencyKey: unique('key-notice-') }).expect(200);

      const created = (
        await h.ctx.sql.query<{ id: string }>('SELECT id FROM employees WHERE employee_code = ANY($1::text[])', [codes])
      ).rows.map((row) => row.id);
      const notices = await h.ctx.sql.query<{ recipient_employee_id: string; subject_id: string; params: unknown }>(
        `SELECT recipient_employee_id, subject_id, params FROM in_app_notifications
          WHERE code = 'EMPLOYEE_PROFILE_CREATED' AND subject_id = ANY($1::uuid[])`,
        [created],
      );
      expect(notices.rows).toHaveLength(4);
      for (const id of created) {
        const mine = notices.rows.filter((notice) => notice.subject_id === id);
        expect(mine.map((notice) => notice.recipient_employee_id).sort()).toEqual([headId, h.it1.employeeId].sort());
        expect(mine[0].params).toEqual({ employeeId: id, departmentId });
      }
    });

    // F17: the notices are written in the confirming transaction. The inbox refuses the SECOND notice, after the first was written: the
    // confirmation goes with it (nobody created, the preview as it was, no audit of it) and so does the first notice.
    it('rolls the confirmation back when a notice fails, and leaves no notice of the people who were rolled back', async () => {
      const department = await newDepartment();
      const departmentId = (
        await h.ctx.sql.query<{ id: string }>('SELECT id FROM departments WHERE code = $1', [department])
      ).rows[0].id;
      await h.ctx.sql.query('UPDATE departments SET it_admin_employee_id = $2 WHERE id = $1', [
        departmentId,
        h.it1.employeeId,
      ]);
      const headId = (
        (
          await request(server())
            .post('/api/v1/employees')
            .set(asSuper())
            .send({
              employeeCode: unique('E-HEADED'),
              fullName: 'Head Person',
              employmentType: 'STAFF',
              hireDate: '2026-09-01',
              departmentCode: department,
              jobTitle: 'Head',
            })
            .expect(201)
        ).body as { data: { id: string } }
      ).data.id;
      await h.ctx.sql.query(
        `INSERT INTO department_head_periods (id, organization_id, department_id, employee_id, valid_from)
         VALUES (gen_random_uuid(), $1, $2, $3, $4)`,
        [h.seed.organizationId, departmentId, headId, today()],
      );
      const row = personRow({ department_code: department });
      const code = row.split(',')[0];
      const id = importOf(await upload(csv([row])).expect(201)).id;
      const rowsBefore = await rowsOf(id);
      const people = await count('employees');
      const notices = async () =>
        (
          await h.ctx.sql.query<{ n: number }>(
            `SELECT count(*)::int AS n FROM in_app_notifications WHERE code = 'EMPLOYEE_PROFILE_CREATED'`,
          )
        ).rows[0].n;
      const noticesBefore = await notices();
      const inbox = h.ctx.app.get(NotificationsApi, { strict: false });
      const written = inbox.notifyInApp.bind(inbox);
      let calls = 0;
      const failing = jest.spyOn(inbox, 'notifyInApp').mockImplementation((tx, input) => {
        calls += 1;

        return calls === 2 ? Promise.reject(new Error('the inbox refused the second notice')) : written(tx, input);
      });
      let status: number;
      try {
        status = (await confirm(id, { previewVersion: 1, idempotencyKey: unique('key-rolled-') })).status;
      } finally {
        failing.mockRestore();
      }

      expect(status).toBe(500);
      expect(calls).toBe(2);
      expect(await count('employees')).toBe(people);
      expect((await h.ctx.sql.query('SELECT 1 FROM employees WHERE employee_code = $1', [code])).rows).toEqual([]);
      const stored = await h.ctx.sql.query<{ status: string; confirm_key: string | null }>(
        'SELECT status, confirm_key FROM employee_imports WHERE id = $1',
        [id],
      );
      expect(stored.rows[0]).toEqual({ status: 'PREVIEW', confirm_key: null });
      expect(await rowsOf(id)).toEqual(rowsBefore);
      const audited = await h.ctx.sql.query<{ action: string }>(
        'SELECT action FROM audit_events WHERE resource_id = $1 ORDER BY occurred_at, id',
        [id],
      );
      expect(audited.rows.map((event) => event.action)).toEqual(['EMPLOYEE_IMPORT.UPLOADED']);
      expect(await notices()).toBe(noticesBefore);
    });
  });

  it('leaves every employee with exactly the placements the invariant I-2 asks for', async () => {
    expect(await h.placementViolations()).toEqual([]);
  });
});
