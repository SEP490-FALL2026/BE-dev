import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import { Client } from 'pg';
import { OrganizationService } from '../../src/modules/organization/organization.service';
import {
  DisposableDatabase,
  dropDisposableDatabase,
  provisionDisposableDatabase,
} from '../support/disposable-database';
import { AssignmentWire, SeatHarness } from '../support/seat-baseline-harness';
import { HR_BASIS } from '../support/hr-basis';

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
    let organization: OrganizationService;
    const today = (day: string) => jest.spyOn(organization, 'businessToday').mockResolvedValue(day);

    beforeAll(async () => {
      await h.start();
      organization = h.ctx.app.get(OrganizationService, { strict: false });
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
      await h.activateCostCenterLink();
      const made = h.dataOf<{ id: string; code: string }>(
        await request(h.server())
          .post('/api/v1/departments')
          .set({ Authorization: `Bearer ${h.admin}` })
          .send({ code, name: `Department ${code}`, hrBasis: HR_BASIS })
          .then(created),
      );
      await h.costCenterFor(made.id);

      return made;
    };
    const enter = async (departmentCode: string, code: string): Promise<string> =>
      h.dataOf<{ id: string }>(
        await request(h.server())
          .post('/api/v1/employees')
          .set({ Authorization: `Bearer ${h.admin}` })
          .send({
            hrBasis: HR_BASIS,
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
    const bot = (code: string, identifier: string) => ({
      employee_code: code,
      account_identifier: identifier,
      kind: 'service',
      reason: 'CI pipeline',
    });
    const change = (id: string, body: object) =>
      request(h.server()).post(`/api/v1/license-assignments/${id}/responsible-changes`).set(h.as(h.it1)).send(body);
    const deactivate = (id: string) =>
      request(h.server()).post(`/api/v1/departments/${id}/deactivate`).set(h.as(h.it1));

    it('keeps a service account in the department that owns it: the person who takes over must be in that department', async () => {
      today('2026-12-01');
      const ops = await department('P-UO1');
      const subscriptionId = await h.subscription(10, 'K2', ops.id);
      const other = await department('P-UO2');
      const owner = await enter(ops.code, 'UO-OWN');
      const colleague = await enter(ops.code, 'UO-COL');
      const stranger = await enter(other.code, 'UO-STR');
      await h.written({ subscriptionId }, [bot('UO-OWN', 'uo-bot')]);
      const original = (await h.assignmentsOf({ subscriptionId, kind: 'SERVICE' }))[0];
      expect(original).toMatchObject({ employeeId: owner, owningDepartmentId: ops.id });
      today('2026-12-10');

      const refused = await change(original.id, { employeeId: stranger, effectiveFrom: '2026-12-15' }).expect(422);
      const accepted = await change(original.id, { employeeId: colleague, effectiveFrom: '2026-12-15' }).expect(200);

      expect(h.codeOf(refused)).toBe('LICENSE_ASSIGNMENT.RESPONSIBLE_INVALID');
      expect(h.detailsOf(refused)).toEqual({ problem: 'OUTSIDE_OWNING_DEPARTMENT' });
      const { created: next } = h.dataOf<{ created: AssignmentWire }>(accepted);
      expect(next).toMatchObject({
        employeeId: colleague,
        owningDepartmentId: ops.id,
        costCenterId: original.costCenterId,
      });
    });

    it('refuses to retire a department while it owns an open service account, naming it, and retires it once the account has ended', async () => {
      today('2026-12-01');
      const ops = await department('P-UO3');
      const subscriptionId = await h.subscription(10, 'K2', ops.id);
      const owner = await enter(ops.code, 'UO-OWN3');
      await h.written({ subscriptionId }, [bot('UO-OWN3', 'uo3-bot')]);
      const service = (await h.assignmentsOf({ subscriptionId, kind: 'SERVICE' }))[0];
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
      today('2026-12-20');
      await deactivate(ops.id).expect(200);
    });

    it('takes no new service account into a department that was retired meanwhile', async () => {
      today('2026-12-01');
      const ops = await department('P-UO4');
      const subscriptionId = await h.subscription(10, 'K2', ops.id);
      const owner = await enter(ops.code, 'UO-OWN4');
      await h.ctx.sql.query(`UPDATE employee_placements SET valid_to = valid_from + 1 WHERE employee_id = $1`, [owner]);
      await h.ctx.sql.query(`UPDATE departments SET status = 'INACTIVE', deactivated_at = now() WHERE id = $1`, [
        ops.id,
      ]);

      const preview = await h.preview({ subscriptionId }, [bot('UO-OWN4', 'uo4-bot')]);

      expect(preview.summary).toMatchObject({ valid: 0 });
      expect(await h.assignmentsOf({ subscriptionId })).toEqual([]);
    });
  });
});
