import { Client } from 'pg';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { TransactionRunner } from '../../src/infrastructure/database/transaction-runner';
import { CostCenterCatalogueService } from '../../src/modules/organization/cost-center/cost-center-catalogue.service';
import { CostCenterRepo } from '../../src/modules/organization/cost-center/cost-center.repo';
import { DepartmentDirectoryService } from '../../src/modules/organization/department/department-directory.service';
import { DepartmentHeadRepo } from '../../src/modules/organization/department/department-head.repo';
import { DepartmentRepo } from '../../src/modules/organization/department/department.repo';
import { EmployeeDirectoryService } from '../../src/modules/organization/employee/employee-directory.service';
import { EmployeeRepo } from '../../src/modules/organization/employee/employee.repo';
import { ImportLookupRepo } from '../../src/modules/organization/employee/import-lookup.repo';
import { JobTitleCatalogueService } from '../../src/modules/organization/job-title/job-title-catalogue.service';
import { JobTitleRepo } from '../../src/modules/organization/job-title/job-title.repo';
import { OrganizationRepo } from '../../src/modules/organization/organization.repo';
import {
  EmployeeCodeTakenError,
  EmployeeEmailTakenError,
  EmployeeNotFoundError,
  OrganizationAlreadyExistsError,
} from '../../src/modules/organization/organization.errors';
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
    organization = new OrganizationService(
      new OrganizationRepo(prisma),
      new DepartmentDirectoryService(new DepartmentRepo(prisma), new DepartmentHeadRepo(prisma)),
      new EmployeeDirectoryService(new EmployeeRepo(prisma), new ImportLookupRepo(prisma)),
      new CostCenterCatalogueService(new CostCenterRepo(prisma)),
      new JobTitleCatalogueService(new JobTitleRepo(prisma)),
    );
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

  it('creates a job title under the one name rule, so the installation path cannot disagree with the API (T-12)', async () => {
    const created = await runner.run((tx) => organization.createJobTitle(tx, organizationId, '  Senior   Designer\t'));

    const stored = await sql.query<{ name: string; normalized_name: string; status: string; version: number }>(
      'SELECT name, normalized_name, status, version FROM job_titles WHERE id = $1',
      [created.id],
    );
    expect(stored.rows).toEqual([
      { name: 'Senior Designer', normalized_name: 'senior designer', status: 'ACTIVE', version: 1 },
    ]);
    // The same title typed another way is the same title.
    await expect(
      runner.run((tx) => organization.createJobTitle(tx, organizationId, 'SENIOR designer')),
    ).rejects.toThrow();
    const count = await sql.query(`SELECT 1 FROM job_titles WHERE normalized_name = 'senior designer'`);
    expect(count.rows).toHaveLength(1);
  });

  it('locks an employee through the facade and reports a missing one', async () => {
    const { id } = await hire('E8', 'e8@acme.vn');
    await expect(runner.run((tx) => organization.lockEmployeeForShare(tx, id))).resolves.toBeUndefined();
    await expect(
      runner.run((tx) => organization.lockEmployeeForShare(tx, '4f24d10d-63ad-49b1-a7a1-c988765990ae')),
    ).rejects.toThrow(/not found/i);
  });

  // Wave 2 characterization: what the facade answers, pinned before its job title, employee and cost center work moved
  // to capability services. The facade calls stay the same; only who answers them behind it changes.
  it('reports a missing employee with the public EmployeeNotFoundError, for both lock modes', async () => {
    const missing = '0b4d7a5c-2f1e-4c3b-9a8d-7e6f5a4b3c2d';
    const locks = [
      (tx: Parameters<typeof organization.lockEmployeeForShare>[0]) => organization.lockEmployeeForShare(tx, missing),
      (tx: Parameters<typeof organization.lockEmployeeForUpdate>[0]) => organization.lockEmployeeForUpdate(tx, missing),
    ];
    for (const lock of locks) {
      const failure = await runner.run((tx) => lock(tx)).catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(EmployeeNotFoundError);
      expect(failure).toMatchObject({ employeeId: missing });
    }
  });

  it('reads several employees at once, leaving out ids it does not know', async () => {
    const first = await hire('E-MANY1', null);
    const second = await hire('E-MANY2', null);

    await expect(organization.getEmployees([])).resolves.toEqual([]);
    const found = await organization.getEmployees([second.id, '6e1f2a3b-4c5d-4e6f-8a7b-9c0d1e2f3a4b', first.id]);
    expect(found.map((employee) => employee.employeeCode).sort()).toEqual(['E-MANY1', 'E-MANY2']);
    expect(Object.keys(found[0]).sort()).toEqual([
      'employeeCode',
      'fullName',
      'hireDate',
      'id',
      'organizationId',
      'status',
      'workEmail',
    ]);
  });

  it('creates the installation cost center as a UNIT, and counts as free only active UNITs no department has', async () => {
    const free = async () => (await organization.getOnboardingFacts()).freeCostCenters;
    const before = await free();

    const unit = await runner.run((tx) =>
      organization.createUnitCostCenter(tx, { organizationId, code: 'CC-FREE', name: 'Free unit' }),
    );
    expect((await sql.query('SELECT kind, status FROM cost_centers WHERE id = $1', [unit.id])).rows).toEqual([
      { kind: 'UNIT', status: 'ACTIVE' },
    ]);
    expect(await free()).toBe(before + 1);

    await sql.query(`UPDATE cost_centers SET kind = 'COMPANY' WHERE id = $1`, [unit.id]);
    expect(await free()).toBe(before);
    await sql.query(
      `UPDATE cost_centers SET kind = 'UNIT', status = 'INACTIVE', deactivated_at = now() WHERE id = $1`,
      [unit.id],
    );
    expect(await free()).toBe(before);
  });

  // Wave 3 characterization: the department and head answers of the facade, pinned before the department capability left
  // the module root. Other modules (identity-access, installation, data-import, onboarding) depend on exactly these.
  describe('department facade kept by the Wave 3 move', () => {
    const insertHeadPeriod = (employeeId: string, from: string, to: string | null) =>
      sql.query(
        `INSERT INTO department_head_periods (id, organization_id, department_id, employee_id, valid_from, valid_to)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)`,
        [organizationId, departmentId, employeeId, from, to],
      );
    const newDepartment = async (code: string, name: string) => {
      const costCenter = await runner.run((tx) =>
        organization.createUnitCostCenter(tx, { organizationId, code: `CC-${code}`, name: `Unit ${code}` }),
      );

      return runner.run((tx) =>
        organization.createDepartment(tx, { organizationId, code, name, costCenterId: costCenter.id }),
      );
    };

    it('tells who heads a department, on a date and from today on, including a period that begins later', async () => {
      const past = await hire('E-HD1', null);
      const current = await hire('E-HD2', null);
      const later = await hire('E-HD3', null);
      const never = await hire('E-HD4', null);
      await insertHeadPeriod(past.id, '2026-02-01', '2026-03-01');
      await insertHeadPeriod(current.id, '2026-03-01', '2099-01-01');
      await insertHeadPeriod(later.id, '2099-01-01', null);

      expect(await organization.isDepartmentHead(past.id)).toBe(false);
      expect(await organization.isDepartmentHead(current.id)).toBe(true);
      expect(await organization.isDepartmentHead(later.id)).toBe(true);
      expect(await runner.run((tx) => organization.isDepartmentHead(never.id, tx))).toBe(false);
      expect(await organization.getHeadedDepartment(past.id, '2026-02-15')).toEqual({ departmentId });
      expect(await organization.getHeadedDepartment(past.id, '2026-03-01')).toBeNull();
      expect(await organization.getHeadedDepartment(current.id)).toEqual({ departmentId });
      expect(await organization.getHeadedDepartment(later.id)).toBeNull();
    });

    it('creates the installation department as given, and locks a department by code for an entry', async () => {
      const created = await newDepartment('P-NOHEAD', 'No head');
      const retired = await newDepartment('P-RETIRED', 'Retired');
      await sql.query(`UPDATE departments SET status = 'INACTIVE', deactivated_at = now() WHERE id = $1`, [retired.id]);

      expect(
        (
          await sql.query(
            `SELECT d.code, d.name, d.status, d.function_description, d.it_admin_employee_id, c.code AS cost_center
               FROM departments d JOIN cost_centers c ON c.id = d.cost_center_id WHERE d.id = $1`,
            [created.id],
          )
        ).rows,
      ).toEqual([
        {
          code: 'P-NOHEAD',
          name: 'No head',
          status: 'ACTIVE',
          function_description: null,
          it_admin_employee_id: null,
          cost_center: 'CC-P-NOHEAD',
        },
      ]);
      const lock = (code: string) => runner.run((tx) => organization.lockDepartmentForEntry(tx, organizationId, code));
      await expect(lock('P-NOHEAD')).resolves.toEqual({
        id: created.id,
        code: 'P-NOHEAD',
        name: 'No head',
        active: true,
        costCenterActive: true,
      });
      await expect(lock('P-RETIRED')).resolves.toEqual({
        id: retired.id,
        code: 'P-RETIRED',
        name: 'Retired',
        active: false,
        costCenterActive: true,
      });
      await expect(lock('P-NONE')).resolves.toBeNull();
    });

    it('reports the active departments nobody heads today, for the import and the onboarding checklist', async () => {
      const withoutHead = (await sql.query<{ id: string }>(`SELECT id FROM departments WHERE code = 'P-NOHEAD'`))
        .rows[0].id;
      const retired = (await sql.query<{ id: string }>(`SELECT id FROM departments WHERE code = 'P-RETIRED'`)).rows[0]
        .id;

      await expect(
        organization.departmentsWithoutHead([
          departmentId,
          withoutHead,
          retired,
          '5a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
        ]),
      ).resolves.toEqual([{ id: withoutHead, code: 'P-NOHEAD', name: 'No head' }]);

      const facts = await organization.getOnboardingFacts();
      const count = async (query: string) => (await sql.query<{ n: number }>(query)).rows[0].n;
      expect(facts.activeDepartments).toBe(
        await count(`SELECT count(*)::int AS n FROM departments WHERE status = 'ACTIVE'`),
      );
      expect(facts.activeEmployees).toBe(
        await count(`SELECT count(*)::int AS n FROM employees WHERE status = 'ACTIVE'`),
      );
      expect(facts.departmentsWithoutHead).toEqual([{ code: 'P-NOHEAD', name: 'No head' }]);
      expect(facts.departmentsByItAdmin).toEqual([
        { code: 'P-ENG', name: 'Engineering', itAdminEmployeeId: null, itAdminStatus: null },
        { code: 'P-NOHEAD', name: 'No head', itAdminEmployeeId: null, itAdminStatus: null },
      ]);
    });
  });
});
