import { Client } from 'pg';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { TransactionRunner } from '../../src/infrastructure/database/transaction-runner';
import {
  EmployeeCodeTakenError,
  EmployeeEmailTakenError,
  OrganizationAlreadyExistsError,
} from '../../src/modules/organization/errors/organization.errors';
import { OrganizationRepo } from '../../src/modules/organization/organization.repo';
import { OrganizationService } from '../../src/modules/organization/organization.service';
import {
  DisposableDatabase,
  dropDisposableDatabase,
  migrateDisposableDatabase,
  provisionDisposableDatabase,
} from '../support/disposable-database';
import { findPlacementCoverageViolations } from '../support/placement-coverage';
import { testConfig } from '../support/test-config';

describe('organization foundation (integration)', () => {
  let database: DisposableDatabase;
  let prisma: PrismaService;
  let runner: TransactionRunner;
  let organization: OrganizationService;
  let sql: Client;
  let organizationId: string;
  let unitCostCenterId: string;
  let departmentId: string;
  let jobTitleId: string;

  beforeAll(async () => {
    database = await provisionDisposableDatabase();
    await migrateDisposableDatabase(database);
    const config = testConfig({ DATABASE_URL: database.url });
    prisma = new PrismaService(config);
    runner = new TransactionRunner(prisma, config);
    organization = new OrganizationService(new OrganizationRepo(prisma));
    sql = new Client({ connectionString: database.url });
    await sql.connect();

    await runner.run(async (tx) => {
      const org = await organization.createOrganization(tx, {
        name: 'Acme',
        timeZone: 'Asia/Ho_Chi_Minh',
        reportingCurrency: 'VND',
      });
      organizationId = org.id;
      unitCostCenterId = (await organization.createUnitCostCenter(tx, { organizationId, code: 'CC-1', name: 'Eng' }))
        .id;
      departmentId = (
        await organization.createDepartment(tx, {
          organizationId,
          code: 'P-ENG',
          name: 'Engineering',
          costCenterId: unitCostCenterId,
        })
      ).id;
      jobTitleId = (await organization.createJobTitle(tx, organizationId, 'Developer')).id;
    });
  }, 60000);

  afterAll(async () => {
    await sql?.end();
    await prisma?.$disconnect();
    if (database) await dropDisposableDatabase(database);
  });

  const hire = (code: string, email: string | null, date = '2026-01-05') =>
    runner.run((tx) =>
      organization.createEmployeeWithPlacement(tx, {
        organizationId,
        employeeCode: code,
        fullName: `Person ${code}`,
        workEmail: email,
        employmentType: 'STAFF',
        hireDate: date,
        departmentId,
        jobTitleId,
      }),
    );

  it('allows exactly one organization per installation', async () => {
    await expect(
      runner.run((tx) =>
        organization.createOrganization(tx, { name: 'Second', timeZone: 'UTC', reportingCurrency: 'USD' }),
      ),
    ).rejects.toBeInstanceOf(OrganizationAlreadyExistsError);
  });

  it('rejects changing the organization time zone', async () => {
    await expect(sql.query(`UPDATE organizations SET time_zone = 'UTC'`)).rejects.toThrow(/immutable/);
    await expect(sql.query(`UPDATE organizations SET name = 'Renamed'`)).resolves.toBeDefined();
  });

  it('rejects a department charged to a non-UNIT cost center', async () => {
    await sql.query(
      `INSERT INTO cost_centers (id, organization_id, code, name, kind)
       VALUES (gen_random_uuid(), $1, 'CC-CO', 'Company', 'COMPANY')`,
      [organizationId],
    );
    const { rows } = await sql.query<{ id: string }>(`SELECT id FROM cost_centers WHERE code = 'CC-CO'`);
    await expect(
      sql.query(
        `INSERT INTO departments (id, organization_id, code, name, cost_center_id)
         VALUES (gen_random_uuid(), $1, 'P-BAD', 'Bad', $2)`,
        [organizationId, rows[0].id],
      ),
    ).rejects.toThrow(/UNIT cost center/);
  });

  it('rejects a second department on the same cost center', async () => {
    await expect(
      sql.query(
        `INSERT INTO departments (id, organization_id, code, name, cost_center_id)
         VALUES (gen_random_uuid(), $1, 'P-TWO', 'Two', $2)`,
        [organizationId, unitCostCenterId],
      ),
    ).rejects.toThrow(/unique|duplicate/i);
  });

  it('creates an employee with exactly one open placement from the hire date', async () => {
    const { id } = await hire('E1', 'e1@acme.vn', '2026-02-02');

    const { rows } = await sql.query(
      `SELECT valid_from::text AS valid_from, valid_to FROM employee_placements WHERE employee_id = $1`,
      [id],
    );
    expect(rows).toEqual([{ valid_from: '2026-02-02', valid_to: null }]);
  });

  it('rejects a duplicate employee code and a duplicate normalized email', async () => {
    await hire('E2', 'Dup+tag@acme.vn');
    await expect(hire('E2', 'other@acme.vn')).rejects.toBeInstanceOf(EmployeeCodeTakenError);
    await expect(hire('E3', 'dup@ACME.vn')).rejects.toBeInstanceOf(EmployeeEmailTakenError);
  });

  it('allows several employees without a work email', async () => {
    await hire('E4', null);
    await expect(hire('E5', null)).resolves.toBeDefined();
  });

  it('rejects overlapping and empty placements at the database', async () => {
    const { id } = await hire('E6', 'e6@acme.vn', '2026-03-01');

    await expect(
      sql.query(
        `INSERT INTO employee_placements (id, organization_id, employee_id, department_id, job_title_id, valid_from)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, '2026-06-01')`,
        [organizationId, id, departmentId, jobTitleId],
      ),
    ).rejects.toThrow(/no_overlap|conflicting key/);

    await expect(
      sql.query(
        `INSERT INTO employee_placements (id, organization_id, employee_id, department_id, job_title_id, valid_from, valid_to)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, '2020-01-02', '2020-01-02')`,
        [organizationId, id, departmentId, jobTitleId],
      ),
    ).rejects.toThrow(/valid_range_check/);
  });

  it('coverage query is clean after normal writes', async () => {
    await expect(findPlacementCoverageViolations(sql)).resolves.toEqual([]);
  });

  it('coverage query detects a gap that the exclusion constraint allows', async () => {
    const { id } = await hire('E7', 'e7@acme.vn', '2026-04-01');
    await sql.query(`UPDATE employee_placements SET valid_to = '2026-05-01' WHERE employee_id = $1`, [id]);
    await sql.query(
      `INSERT INTO employee_placements (id, organization_id, employee_id, department_id, job_title_id, valid_from)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, '2026-05-10')`,
      [organizationId, id, departmentId, jobTitleId],
    );

    const violations = await findPlacementCoverageViolations(sql);
    expect(violations).toEqual([{ employee_id: id, problem: 'gap or overlap between consecutive placements' }]);

    await sql.query(`DELETE FROM employee_placements WHERE employee_id = $1`, [id]);
    await sql.query(`DELETE FROM employees WHERE id = $1`, [id]);
  });

  it('locks an employee through the facade and reports a missing one', async () => {
    const { id } = await hire('E8', 'e8@acme.vn');
    await expect(runner.run((tx) => organization.lockEmployeeForShare(tx, id))).resolves.toBeUndefined();
    await expect(
      runner.run((tx) => organization.lockEmployeeForShare(tx, '4f24d10d-63ad-49b1-a7a1-c988765990ae')),
    ).rejects.toThrow(/not found/i);
  });
});
