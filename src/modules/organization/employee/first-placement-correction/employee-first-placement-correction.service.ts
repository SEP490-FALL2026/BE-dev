import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../../core/business-date';
import { DbTx, TransactionRunner } from '../../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../../audit/public/audit.api';
import { NotificationsApi } from '../../../notifications/public/notifications.api';
import {
  DepartmentInactiveError,
  DepartmentNotFoundError,
  DepartmentNotYetEffectiveError,
} from '../../department/department.errors';
import { DepartmentRepo } from '../../department/department.repo';
import { organizationAuditEvent } from '../../organization-audit-event.mapper';
import { OrganizationContextService } from '../../organization-context.service';
import { EmployeeNotFoundError } from '../../public/organization.errors';
import type { EmployeeRecord } from '../../public/organization.types';
import { firstPlacementView } from '../employee-first-placement.mapper';
import { firstPlacementProblem } from '../employee-first-placement.policy';
import { EmployeeRecordService } from '../employee-record.service';
import { EmployeeUpdateEmptyError, FirstPlacementCorrectionError, FirstPlacementError } from '../employee.errors';
import { assertMayCorrectEmployee } from '../employee.policy';
import { firstPlacementCorrectionProblem } from './employee-first-placement-correction.policy';
import { FirstPlacementUseService } from './first-placement-use.service';

interface Placement {
  id: string;
  departmentId: string;
  validFrom: BusinessDate;
}
interface Target {
  id: string;
  code: string;
  name: string;
  effectiveFrom: BusinessDate;
}
interface CorrectionInput {
  departmentId?: string;
  effectiveFrom?: BusinessDate;
  reason: string;
}

/**
 * The correction of the first placement of a person, while it starts after today and nothing refers to it (`QĐ-113e`): the Super Admin changes
 * its department and/or its first day, with a reason, never for their own record (`QĐ-87c`). The new values are held to what a first placement
 * is held to; the placement is changed in place (the database triggers let that happen for this one placement and no other); a new
 * department is told like a first placement, a new day tells nobody. Values the placement already has change nothing and record nothing.
 */
@Injectable()
export class EmployeeFirstPlacementCorrectionService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly departments: DepartmentRepo,
    private readonly employees: EmployeeRecordService,
    private readonly use: FirstPlacementUseService,
    private readonly context: OrganizationContextService,
    private readonly audit: AuditApi,
    private readonly notifications: NotificationsApi,
  ) {}

  /**
   * Throws EmployeeForbiddenError, EmployeeSelfChangeForbiddenError, EmployeeUpdateEmptyError, EmployeeNotFoundError, FirstPlacementCorrectionError,
   * FirstPlacementError, DepartmentNotFoundError, DepartmentInactiveError and DepartmentNotYetEffectiveError.
   */
  async correct(actor: AuthenticatedPrincipal, employeeId: string, input: CorrectionInput) {
    assertMayCorrectEmployee(actor, employeeId);
    if (input.departmentId === undefined && input.effectiveFrom === undefined) throw new EmployeeUpdateEmptyError();

    return this.runner.run(async (tx) => {
      // The department first, then the person: the order of the lock protocol.
      const asked = input.departmentId ? await this.lockDepartment(tx, input.departmentId) : null;
      const { employee, placement, today } = await this.correctable(tx, employeeId);
      const department = asked ?? (await this.lockDepartment(tx, placement.departmentId));
      const effectiveFrom = input.effectiveFrom ?? placement.validFrom;
      const departmentChanged = department.id !== placement.departmentId;
      // Only a department the person moves to must take people in; the one they are already placed in may have been retired since.
      if (departmentChanged && department.status !== 'ACTIVE') throw new DepartmentInactiveError();
      const dayChanged = effectiveFrom !== placement.validFrom;
      if (!departmentChanged && !dayChanged) return firstPlacementView(employee, department, effectiveFrom);

      this.requireValid(employee, department, effectiveFrom, today);
      await this.employees.correctFirstPlacement(tx, placement.id, {
        departmentId: departmentChanged ? department.id : undefined,
        effectiveFrom: dayChanged ? effectiveFrom : undefined,
      });
      const after = { departmentId: department.id, effectiveFrom, reason: input.reason };
      const before = { departmentId: placement.departmentId, effectiveFrom: placement.validFrom };
      await this.audit.record(
        tx,
        organizationAuditEvent(
          actor,
          employee.organizationId,
          'EMPLOYEE.FIRST_PLACEMENT_CORRECTED',
          'Employee',
          employeeId,
          before,
          after,
        ),
      );
      if (departmentChanged) await this.tellNewDepartment(tx, employee, effectiveFrom);

      return firstPlacementView(employee, department, effectiveFrom);
    });
  }

  /** Locks the person and reads their one placement, refusing every reason it cannot be corrected. */
  private async correctable(tx: DbTx, employeeId: string) {
    await this.employees.lock(tx, employeeId, 'UPDATE');
    const employee = await this.employees.find(employeeId, tx);
    if (!employee) throw new EmployeeNotFoundError(employeeId);
    const placements = await this.employees.placementsOf(tx, employeeId);
    const today = await this.context.businessToday(new Date(), tx);
    const use = await this.use.read(tx, employeeId);
    const problem = firstPlacementCorrectionProblem({
      status: employee.status,
      workState: employee.workState,
      placements,
      today,
      use,
    });
    const placement: Placement | undefined = placements[0];
    if (problem || !placement) {
      throw new FirstPlacementCorrectionError(problem ?? 'NOT_PLACED', problem === 'IN_USE' ? use : null);
    }

    return { employee, placement, today };
  }

  /** The new values are held to what a first placement is held to: a day not before today or the hire date, a department in effect by that day. */
  private requireValid(employee: EmployeeRecord, department: Target, effectiveFrom: BusinessDate, today: BusinessDate) {
    const invalid = firstPlacementProblem({
      status: employee.status,
      workState: employee.workState,
      hasPlacement: false,
      effectiveFrom,
      hireDate: employee.hireDate,
      today,
    });
    if (invalid) throw new FirstPlacementError(invalid);
    if (effectiveFrom < department.effectiveFrom) throw new DepartmentNotYetEffectiveError(department.effectiveFrom);
  }

  /** The head and the IT Admin in charge of the new department hear of the new person, as for a first placement. */
  private async tellNewDepartment(tx: DbTx, employee: EmployeeRecord, onDate: BusinessDate): Promise<void> {
    const notices = await this.employees.profileNotices(tx, {
      kind: 'CREATED',
      organizationId: employee.organizationId,
      employeeId: employee.id,
      onDate,
    });
    for (const notice of notices) await this.notifications.notifyInApp(tx, notice);
  }

  /** Locks a department and reads it; whether it must take people in is for the caller, who knows if the person moves to it. */
  private async lockDepartment(tx: DbTx, departmentId: string) {
    const department = await this.departments.lock(tx, departmentId, 'UPDATE');
    if (!department) throw new DepartmentNotFoundError();

    return department;
  }
}
