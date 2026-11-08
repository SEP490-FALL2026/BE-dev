import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import { DbTx, TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { NotificationsApi } from '../../notifications/public/notifications.api';
import { DepartmentRepo } from '../department/department.repo';
import {
  DepartmentInactiveError,
  DepartmentNotFoundError,
  DepartmentNotYetEffectiveError,
} from '../department/department.errors';
import { organizationAuditEvent } from '../organization-audit-event.mapper';
import { OrganizationContextService } from '../organization-context.service';
import { EmployeeNotFoundError } from '../public/organization.errors';
import { EmployeeRecordService } from './employee-record.service';
import { firstPlacementProblem } from './employee-first-placement.policy';
import { FirstPlacementError } from './employee.errors';
import { assertMayEnterEmployees } from './employee.policy';

@Injectable()
export class EmployeeFirstPlacementService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly departments: DepartmentRepo,
    private readonly employees: EmployeeRecordService,
    private readonly context: OrganizationContextService,
    private readonly audit: AuditApi,
    private readonly notifications: NotificationsApi,
  ) {}

  async place(
    actor: AuthenticatedPrincipal,
    employeeId: string,
    input: { departmentId: string; effectiveFrom: BusinessDate },
  ) {
    assertMayEnterEmployees(actor.roles);
    return this.runner.run(async (tx) => {
      const department = await this.lockPlaceable(tx, input);
      await this.employees.lock(tx, employeeId, 'UPDATE');
      const employee = await this.employees.find(employeeId, tx);
      if (!employee) throw new EmployeeNotFoundError(employeeId);
      const unplaced = (await this.employees.unplacedAmong([employeeId], tx)).has(employeeId);
      const today = await this.context.businessToday(new Date(), tx);
      const problem = firstPlacementProblem({
        status: employee.status,
        workState: employee.workState,
        hasPlacement: !unplaced,
        effectiveFrom: input.effectiveFrom,
        hireDate: employee.hireDate,
        today,
      });
      if (problem) throw new FirstPlacementError(problem);
      this.requireEffective(department, input.effectiveFrom);
      await this.employees.insertFirstPlacement(tx, {
        organizationId: employee.organizationId,
        employeeId,
        departmentId: department.id,
        effectiveFrom: input.effectiveFrom,
      });
      await this.audit.record(
        tx,
        organizationAuditEvent(actor, employee.organizationId, 'EMPLOYEE.FIRST_PLACED', 'Employee', employeeId, null, {
          departmentId: department.id,
          effectiveFrom: input.effectiveFrom,
        }),
      );
      const notices = await this.employees.profileNotices(tx, {
        kind: 'CREATED',
        organizationId: employee.organizationId,
        employeeId,
        onDate: input.effectiveFrom,
      });
      for (const notice of notices) await this.notifications.notifyInApp(tx, notice);
      return {
        id: employee.id,
        employeeCode: employee.employeeCode,
        fullName: employee.fullName,
        workEmail: employee.workEmail,
        employmentType: employee.employmentType,
        hireDate: employee.hireDate,
        status: employee.status,
        workState: employee.workState,
        memberSince: input.effectiveFrom,
        department: { id: department.id, code: department.code, name: department.name },
        unplaced: false,
        jobTitle: employee.jobTitle ?? null,
      };
    });
  }

  /** Locks the department the person is placed in: it exists, is in use and takes effect by the day (`QĐ-104e(3)`). */
  private async lockPlaceable(tx: DbTx, input: { departmentId: string; effectiveFrom: BusinessDate }) {
    const department = await this.departments.lock(tx, input.departmentId, 'UPDATE');
    if (!department) throw new DepartmentNotFoundError();
    if (department.status !== 'ACTIVE') throw new DepartmentInactiveError();
    return department;
  }

  /** A department made for next year takes nobody in before the day it takes effect (`QĐ-104e(3)`). */
  private requireEffective(department: { effectiveFrom: BusinessDate }, day: BusinessDate): void {
    if (day < department.effectiveFrom) throw new DepartmentNotYetEffectiveError(department.effectiveFrom);
  }
}
