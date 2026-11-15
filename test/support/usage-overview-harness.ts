import { buildActivatedAccount } from './builders/account.builder';
import { createDepartment, enterEmployee } from './builders/organization.builder';
import type { ApiAccount } from './api-accounts';
import { pretendBusinessToday } from './pretend-today';
import { UsageHarness } from './vendor-usage-harness';

/** The day the organization is on in the world of the usage suites. */
export const USAGE_TODAY = '2026-11-15';

/** What the world of the usage suites holds: two software, the vendor source of the first, and three people. */
export interface UsageWorld {
  x: { applicationId: string; subscriptionId: string | null };
  y: { applicationId: string; subscriptionId: string | null };
  vendorSourceId: string;
  vendorSourceName: string;
  /** The confirmed import of the report: three lines, one for each of two people of two departments and one nobody was tied to. */
  importId: string;
  employeeA: string;
  employeeB: string;
  employeeC: string;
}

/**
 * The usage harness with two IT Admins each in charge of a department of their own (`QĐ-111ax`): `it1` of the seeded department and `it2`
 * of a second one, so each reads the people of its own department and nobody else's. No assertion lives here.
 */
export class UsageOverviewHarness extends UsageHarness {
  it2!: ApiAccount;
  /** The second department, in the charge of `it2`. */
  otherDepartment!: { id: string; code: string };

  /** Boots the application with `it1` in charge of the seeded department and `it2` of another one. */
  async startTwoDepartments(options: Parameters<UsageHarness['start']>[0] = {}): Promise<void> {
    await this.start(options);
    this.it2 = await buildActivatedAccount(this.ctx, this.seed, {
      code: 'E-IT2',
      email: 'it2@acme.vn',
      role: 'IT_ADMIN',
    });
    await this.ctx.sql.query(`UPDATE departments SET it_admin_employee_id = $1 WHERE id = $2`, [
      this.it1.employeeId,
      this.seed.departmentId,
    ]);
    this.otherDepartment = await createDepartment(this.ctx, this.admin, {
      code: 'P-OTHER',
      name: 'Other department',
      itAdminEmployeeId: this.it2.employeeId,
    });
  }

  /**
   * A person of the second department, with the work email `code@acme.vn` and the name `Person code`. The manual entry places the person from
   * the real day of the database, and the world is on a fixed day before it (`USAGE_TODAY`): the department an IT Admin reads is the one of
   * today (`QĐ-111ax`), so the placement goes back to the hire date, as the placements of the people of the seeded department are (the
   * fixture of `person` places them from their hire date).
   */
  async personOfOtherDepartment(code: string): Promise<string> {
    const hireDate = '2026-01-05';
    const { id } = await enterEmployee(this.ctx, this.admin, {
      employeeCode: code,
      fullName: `Person ${code}`,
      workEmail: `${code.toLowerCase()}@acme.vn`,
      employmentType: 'STAFF',
      hireDate,
      departmentCode: this.otherDepartment.code,
      jobTitle: 'Tester',
    });
    await this.ctx.sql.query(`UPDATE employee_placements SET valid_from = $2 WHERE employee_id = $1`, [id, hireDate]);

    return id;
  }

  /**
   * The world of the usage suites, on 15/11/2026: a software `X` with a vendor source (a report of 01–10/11 saying `E-A` was last active on 05/11 and
   * `E-C` on 08/11) and a collector on the machine of `E-A` (active 05, 06 and 12/11, observed without activity on 13/11); `E-A` and `E-B` are of the
   * department of `it1`, `E-C` of the one of `it2`; a software `Y` has seats of `E-A` and no data.
   */
  async world(): Promise<UsageWorld> {
    pretendBusinessToday(this.ctx.app, USAGE_TODAY);
    const x = await this.usageApp();
    const y = await this.usageApp();
    const employeeA = await this.person('E-A');
    const employeeB = await this.person('E-B');
    const employeeC = await this.personOfOtherDepartment('E-C');
    await this.seatsOn(x.subscriptionId as string, [
      { code: 'E-A', grantedOn: '2026-01-05' },
      { code: 'E-B', grantedOn: '2026-01-05' },
    ]);
    await this.seatsOn(y.subscriptionId as string, [{ code: 'E-A', grantedOn: '2026-01-05' }]);
    const source = await this.source(x.applicationId);
    const { import: confirmedImport } = await this.confirmed(
      source.id,
      this.report(
        ['email', 'last_active'],
        [
          ['e-a@acme.vn', '2026-11-05'],
          ['e-c@acme.vn', '2026-11-08'],
          ['nobody-world@acme.vn', '2026-11-09'],
        ],
      ),
      { coverageFrom: '2026-11-01', coverageTo: '2026-11-10' },
    );
    const machine = await this.registrationOf(employeeA, USAGE_TODAY);
    await this.collectorUsage(machine, x.applicationId, [
      { date: '2026-11-05', responses: 3 },
      { date: '2026-11-06', responses: 2 },
      { date: '2026-11-12', responses: 1 },
      { date: '2026-11-13', responses: 0, coverage: 'COVERED' },
    ]);

    return {
      x,
      y,
      vendorSourceId: source.id,
      vendorSourceName: source.name,
      importId: confirmedImport.id,
      employeeA,
      employeeB,
      employeeC,
    };
  }
}
