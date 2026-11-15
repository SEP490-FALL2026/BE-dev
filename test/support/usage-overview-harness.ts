import { buildActivatedAccount } from './builders/account.builder';
import { createDepartment, enterEmployee } from './builders/organization.builder';
import type { ApiAccount } from './api-accounts';
import { UsageHarness } from './vendor-usage-harness';

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

  /** A person of the second department, with the work email `code@acme.vn` and the name `Person code`. */
  async personOfOtherDepartment(code: string): Promise<string> {
    return (
      await enterEmployee(this.ctx, this.admin, {
        employeeCode: code,
        fullName: `Person ${code}`,
        workEmail: `${code.toLowerCase()}@acme.vn`,
        employmentType: 'STAFF',
        hireDate: '2026-01-05',
        departmentCode: this.otherDepartment.code,
        jobTitle: 'Tester',
      })
    ).id;
  }
}
