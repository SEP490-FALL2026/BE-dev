import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import { Client } from 'pg';
import {
  DisposableDatabase,
  dropDisposableDatabase,
  provisionDisposableDatabase,
} from '../../support/disposable-database';
import { pretendBusinessToday } from '../../support/pretend-today';
import { SeatHarness } from '../../support/seat-baseline-harness';
import { legacyServiceAccount } from '../../support/legacy-service-account';

const MIGRATIONS = join(process.cwd(), 'prisma', 'migrations');
const UNIT_ONLY = '_cost_centers_unit_only';

const migrationDirectories = (): string[] =>
  readdirSync(MIGRATIONS, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
const sqlOf = (directory: string): string => readFileSync(join(MIGRATIONS, directory, 'migration.sql'), 'utf8');

describe('cost attribution to Units only (integration, BBI-D04 → BBI-D08, BBI-D10)', () => {
  describe('the migration moves a service account from a Company Cost Center to the Unit of its owning department', () => {
    interface Legacy {
      database: DisposableDatabase;
      sql: Client;
      organizationId: string;
      department: string;
      unit: string;
      company: string;
      planId: string;
      employee: string;
    }

    const newEmployee = async (sql: Client, organizationId: string, code: string): Promise<string> => {
      const id = randomUUID();
      await sql.query(
        `INSERT INTO employees (id, organization_id, employee_code, full_name, employment_type, hire_date, updated_at)
         VALUES ($1, $2, $3, $3, 'STAFF', '2020-01-01', now())`,
        [id, organizationId, code],
      );

      return id;
    };

    /** An installation as it was before the migration: a Company Cost Center, a Unit with its department, a service account. */
    async function legacy(placed: boolean): Promise<Legacy> {
      const database = await provisionDisposableDatabase();
      const sql = new Client({ connectionString: database.url });
      await sql.connect();
      const directories = migrationDirectories();
      const target = directories.find((name) => name.endsWith(UNIT_ONLY)) ?? '';
      expect(target).not.toBe('');
      for (const directory of directories) {
        if (directory === target) break;
        await sql.query(sqlOf(directory));
      }
      const organizationId = randomUUID();
      await sql.query(
        `INSERT INTO organizations (id, name, time_zone, reporting_currency) VALUES ($1, 'Acme', 'UTC', 'VND')`,
        [organizationId],
      );
      const [unit, company, department, jobTitle] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
      await sql.query(
        `INSERT INTO cost_centers (id, organization_id, code, name, kind) VALUES ($1, $3, 'CC-UNIT', 'Unit', 'UNIT'), ($2, $3, 'CC-CORP', 'Company', 'COMPANY')`,
        [unit, company, organizationId],
      );
      await sql.query(
        `INSERT INTO departments (id, organization_id, code, name, cost_center_id, updated_at) VALUES ($1, $2, 'P-OPS', 'Ops', $3, now())`,
        [department, organizationId, unit],
      );
      await sql.query(
        `INSERT INTO job_titles (id, organization_id, name, normalized_name, updated_at) VALUES ($1, $2, 'Admin', 'admin', now())`,
        [jobTitle, organizationId],
      );
      const employee = await newEmployee(sql, organizationId, 'E-OWNER');
      if (placed) {
        await sql.query(
          `INSERT INTO employee_placements (id, organization_id, employee_id, department_id, job_title_id, valid_from)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, '2020-01-01')`,
          [organizationId, employee, department, jobTitle],
        );
      }
      const applicationId = randomUUID();
      const planId = randomUUID();
      await sql.query(
        `INSERT INTO applications (id, organization_id, kind, name, normalized_name, business_owner_employee_id,
           data_sensitivity, comm_person_to_person_messaging, comm_calls_or_meetings, comm_mailbox, is_communication_service)
         VALUES ($1, $2, 'INTERNAL', 'Tool', 'tool', $3, 'LOW', false, false, false, false)`,
        [applicationId, organizationId, employee],
      );
      await sql.query(
        `INSERT INTO plans (id, organization_id, application_id, name, normalized_name, provisioning_type)
         VALUES ($1, $2, $3, 'Plan', 'plan', 'K5')`,
        [planId, organizationId, applicationId],
      );
      await sql.query(
        `INSERT INTO license_assignments (id, organization_id, kind, source, plan_id, employee_id, account_identifier,
           normalized_account_identifier, reason, cost_center_id, valid_from, valid_from_basis, created_by_app_user_id)
         VALUES (gen_random_uuid(), $1, 'SERVICE', 'REQUEST', $2, $3, 'ci-bot', 'ci-bot', 'CI', $4, '2026-10-01', 'ACTUAL', $5)`,
        [organizationId, planId, employee, company, randomUUID()],
      );

      return { database, sql, organizationId, department, unit, company, planId, employee };
    }
    const finish = async (fixture: Legacy) => {
      await fixture.sql.end();
      await dropDisposableDatabase(fixture.database);
    };
    const target = () => migrationDirectories().find((name) => name.endsWith(UNIT_ONLY)) ?? '';

    it('owns the account by the department its responsible person was in the day it started, charges it to the Unit, and removes the Company', async () => {
      const fixture = await legacy(true);
      try {
        await fixture.sql.query(sqlOf(target()));

        const row = (
          await fixture.sql.query<{ owning_department_id: string; cost_center_id: string }>(
            `SELECT owning_department_id, cost_center_id FROM license_assignments`,
          )
        ).rows[0];
        expect(row).toEqual({ owning_department_id: fixture.department, cost_center_id: fixture.unit });
        expect((await fixture.sql.query(`SELECT code FROM cost_centers ORDER BY code`)).rows).toEqual([
          { code: 'CC-UNIT' },
        ]);
        expect(
          (await fixture.sql.query<{ labels: string[] }>(`SELECT enum_range(NULL::"CostCenterKind")::text[] AS labels`))
            .rows[0].labels,
        ).toEqual(['UNIT']);
      } finally {
        await finish(fixture);
      }
    }, 90_000);

    it('stops with the list of service accounts whose person had no department, and changes nothing', async () => {
      const fixture = await legacy(false);
      try {
        const assignment = (await fixture.sql.query<{ id: string }>(`SELECT id FROM license_assignments`)).rows[0].id;

        const failure = await fixture.sql.query(sqlOf(target())).then(
          () => null,
          (error: Error & { code?: string }) => error,
        );

        expect(failure?.message).toContain(assignment);
        expect(failure?.code).toBe('23503');
        expect((await fixture.sql.query(`SELECT code FROM cost_centers ORDER BY code`)).rows).toEqual([
          { code: 'CC-CORP' },
          { code: 'CC-UNIT' },
        ]);
        expect(
          (
            await fixture.sql.query(
              `SELECT 1 FROM information_schema.columns WHERE table_name = 'license_assignments' AND column_name = 'owning_department_id'`,
            )
          ).rowCount,
        ).toBe(0);
      } finally {
        await finish(fixture);
      }
    }, 90_000);
  });

  describe('over HTTP', () => {
    const h = new SeatHarness();
    // The business day the module's own capabilities read is the context service's, which the facade delegates to: one stub for both.
    const today = (day: string) => pretendBusinessToday(h.ctx.app, day);

    beforeAll(async () => {
      await h.start();
    }, 180000);

    afterEach(() => {
      jest.restoreAllMocks();
    });

    afterAll(async () => {
      await h.stop();
    });

    const created = (response: request.Response): request.Response => {
      if (response.status !== 201) throw new Error(`${response.status} ${JSON.stringify(response.body)}`);

      return response;
    };
    // A department the Super Admin creates and a Cost Center Finance creates for it (`QĐ-87d(1)`).
    const department = async (code: string) => {
      const made = h.dataOf<{ id: string; code: string }>(
        await request(h.server())
          .post('/api/v1/departments')
          .set({ Authorization: `Bearer ${h.admin}` })
          .send({ code, name: `Department ${code}` })
          .then(created),
      );
      await h.ctx.sql.query(`UPDATE departments SET effective_from = DATE '2020-01-01' WHERE id = $1`, [made.id]);
      await h.costCenterFor(made.id);

      return made;
    };
    const enter = async (departmentCode: string, code: string): Promise<string> =>
      h.dataOf<{ id: string }>(
        await request(h.server())
          .post('/api/v1/employees')
          .set({ Authorization: `Bearer ${h.admin}` })
          .send({
            employeeCode: code,
            fullName: `Person ${code}`,
            workEmail: `${code.toLowerCase()}@acme.vn`,
            employmentType: 'STAFF',
            hireDate: '2024-06-01',
            departmentCode,
            jobTitle: 'Administrator',
          })
          .then(created),
      ).id;
    const deactivate = (id: string) =>
      request(h.server())
        .post(`/api/v1/departments/${id}/deactivate`)
        .set({ Authorization: `Bearer ${h.admin}` });

    it('refuses to retire a department while it owns an open service account, naming it, and retires it once the account has ended', async () => {
      today('2026-12-01');
      const ops = await department('P-UO3');
      const subscriptionId = await h.subscription(10, 'K2', ops.id);
      const owner = await enter(ops.code, 'UO-OWN3');
      // A service account of the earlier releases, written by SQL (nothing writes one any more).
      const serviceId = await legacyServiceAccount(h.ctx.sql, {
        subscriptionId,
        employeeId: owner,
        identifier: 'uo3-bot',
      });
      const service = { id: serviceId };
      // The placement began on the day the person was entered; nobody is a member any more: only the service account keeps the department in use.
      await h.ctx.sql.query(`UPDATE employee_placements SET valid_to = valid_from + 1 WHERE employee_id = $1`, [owner]);

      const refused = await deactivate(ops.id).expect(409);

      expect(h.codeOf(refused)).toBe('DEPARTMENT.IN_USE');
      expect(h.detailsOf(refused)).toMatchObject({
        totalMembers: 0,
        totalServiceAccounts: 1,
        serviceAccounts: [{ assignmentId: service.id, accountIdentifier: 'uo3-bot' }],
      });
      await h.ctx.sql.query(`UPDATE license_assignments SET valid_until = '2026-12-10' WHERE id = $1`, [service.id]);
      // The subscription the department owns keeps it in use until its term is over (QĐ-90e).
      await h.ctx.sql.query(`UPDATE subscriptions SET end_date = '2026-12-10' WHERE id = $1`, [subscriptionId]);
      today('2026-12-20');
      await deactivate(ops.id).expect(200);
    });
  });
});
