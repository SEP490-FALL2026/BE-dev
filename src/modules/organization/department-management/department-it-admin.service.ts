import { Injectable } from '@nestjs/common';
import type { DepartmentItSubstituteEndCause } from '../../../generated/prisma/client';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import type { AuditValue } from '../../audit/public/audit.types';
import { itAdminLoadOf, type ItAdminLoad } from '../department-it-substitute/department-it-substitute.policy';
import { DepartmentItSubstituteRepo } from '../department-it-substitute/department-it-substitute.repo';
import { DepartmentItAdminInvalidError } from '../department/department.errors';
import { assertItAdminHasRoom } from '../department/department.policy';
import { DepartmentRepo } from '../department/department.repo';
import { EmployeeRecordService } from '../employee/employee-record.service';
import { organizationAuditEvent } from '../organization-audit-event.mapper';
import { EmployeeAccountsHook } from '../public/organization.extension-points';
import { lockAndReadEmployee } from './department-facts.service';

/** Whether the person named to answer for the technical work of a department can, plus substitute lifecycle and load telemetry. */
@Injectable()
export class DepartmentItAdminService {
  constructor(
    private readonly employees: EmployeeRecordService,
    private readonly employeeAccounts: EmployeeAccountsHook,
    private readonly departments: DepartmentRepo,
    private readonly substitutes: DepartmentItSubstituteRepo,
    private readonly audit: AuditApi,
  ) {}

  /**
   * An employee who works, with a usable IT_ADMIN account, who answers for fewer than four active departments (`QĐ-110l`). The employee row
   * is locked `FOR UPDATE` first (the order of the lock protocol), so two assignments of the same IT Admin wait for each other and the second
   * counts the first; then the account is read, then the departments are counted. Throws DepartmentItAdminInvalidError and
   * DepartmentItAdminLimitReachedError.
   */
  async assertUsable(tx: DbTx, employeeId: string): Promise<void> {
    const employee = await lockAndReadEmployee(this.employees, tx, employeeId, 'UPDATE');
    if (!employee || employee.status !== 'ACTIVE') throw new DepartmentItAdminInvalidError();
    const account = await this.employeeAccounts.get().inspectEmployeeAccount(tx, employeeId);
    if (!account.usable || !account.roles.includes('IT_ADMIN')) throw new DepartmentItAdminInvalidError();
    assertItAdminHasRoom(await this.departments.countActiveInChargeOf(tx, employeeId));
  }

  /**
   * Closes any active temporary substitute when a non-null IT Admin in charge is named and returns their workload telemetry.
   * Clearing IT Admin in charge (`null`) leaves any active substitute intact.
   */
  async onInChargeNamed(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    organizationId: string,
    departmentId: string,
    newItAdminEmployeeId: string | null | undefined,
    after: Record<string, AuditValue>,
    now: Date,
  ): Promise<ItAdminLoad | null> {
    if (!newItAdminEmployeeId) return null;
    await this.closeActiveSubstitute(tx, actor, organizationId, departmentId, 'IN_CHARGE_NAMED', now);
    const inChargeCount = await this.departments.countActiveInChargeExcludingStarting(tx, newItAdminEmployeeId);
    const substituteCount = await this.substitutes.countActiveBySubstitute(tx, newItAdminEmployeeId);
    const load = itAdminLoadOf({ employeeId: newItAdminEmployeeId, inChargeCount, substituteCount });
    if (load.overLimit) after.overLimit = true;

    return load;
  }

  /** Closes any active temporary substitute when a department is deactivated. */
  async closeActiveSubstitute(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    organizationId: string,
    departmentId: string,
    endCause: DepartmentItSubstituteEndCause,
    now: Date,
  ): Promise<void> {
    const ended = await this.substitutes.endActiveForDepartment(tx, {
      departmentId,
      endedAt: now,
      endedByAppUserId: actor.appUserId,
      endCause,
    });
    if (!ended) return;

    await this.audit.record(
      tx,
      organizationAuditEvent(
        actor,
        organizationId,
        'DEPARTMENT_IT_SUBSTITUTE.ENDED',
        'DepartmentItSubstitute',
        ended.id,
        { departmentId, substituteEmployeeId: ended.substitute.id, endedAt: null, endCause: null },
        {
          departmentId,
          substituteEmployeeId: ended.substitute.id,
          endedAt: now.toISOString(),
          endCause,
        },
      ),
    );
  }
}
