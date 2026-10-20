import { Injectable } from '@nestjs/common';
import { BusinessDate, businessDateAt } from '../../../core/business-date';
import { InvalidEmailError, normalizeEmail } from '../../../core/email';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditService } from '../../audit/audit.service';
import { EmployeeCodeTakenError, EmployeeEmailTakenError } from '../organization.errors';
import { EmployeeRowInvalidError } from './employee.errors';
import { validateEmployeeRow } from './employee-row.validator';
import { organizationAuditEvent } from '../mappers/audit-event.mapper';
import { OrganizationService } from '../organization.service';
import { EmploymentType } from '../organization.types';

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** What the form sends. The department is named by its code, like the import file column (`FR-9.7`). */
export interface ManualEmployeeInput {
  employeeCode: string;
  fullName: string;
  workEmail?: string | null;
  employmentType: EmploymentType;
  hireDate: BusinessDate;
  departmentCode?: string | null;
  jobTitleId?: string | null;
}

export interface ManualEmployeeView {
  id: string;
  employeeCode: string;
  fullName: string;
  workEmail: string | null;
  employmentType: EmploymentType;
  hireDate: BusinessDate;
  status: 'ACTIVE';
  /** The day the person became a member of the department: the day they were recorded, not the hire date. */
  memberSince: BusinessDate;
  department: { id: string; code: string; name: string };
  jobTitle: { id: string; name: string };
}

/**
 * Entering one person by hand (`US-02-02` AC-14, `QĐ-67d`): the Employee and its single placement, in one
 * transaction, and nothing else. It creates no account, role, invitation or mail; giving the person a login
 * is the Super Admin's separate step.
 */
@Injectable()
export class EmployeeManualService {
  constructor(
    private readonly organization: OrganizationService,
    private readonly audit: AuditService,
    private readonly runner: TransactionRunner,
  ) {}

  /**
   * Throws EmployeeRowInvalidError carrying every reason (T-16), or TransientDatabaseError. `now` is the moment of
   * the entry; it is a parameter so a test can fix the clock, and it defaults to the database clock of the transaction.
   */
  async create(actor: AuthenticatedPrincipal, input: ManualEmployeeInput, now?: Date): Promise<ManualEmployeeView> {
    const organization = await this.organization.getOrganization();
    if (!organization) throw new Error('An employee was entered before installation');
    try {
      return await this.runner.run(async (tx) => {
        // The day the person is recorded, in the organization's own calendar (T-14), whatever hire date was typed.
        // Taken inside the transaction from the database clock, the same instant `created_at` will carry, unless a
        // test fixed the clock.
        const memberSince = businessDateAt(
          now ?? (await this.organization.employeeRecordingInstant(tx)),
          organization.timeZone,
        );
        // Lock order (T-11): department, then job title, then the employee rows that get written.
        const departmentCode = input.departmentCode?.trim() ?? '';
        const department = departmentCode
          ? await this.organization.lockDepartmentForEntry(tx, organization.id, departmentCode)
          : null;
        const jobTitleId = input.jobTitleId?.trim() ?? '';
        const jobTitle =
          jobTitleId && UUID_SHAPE.test(jobTitleId)
            ? await this.organization.lockJobTitleForShare(tx, jobTitleId)
            : null;
        const workEmail = input.workEmail?.trim() || null;
        const normalizedEmail = workEmail === null ? null : this.normalize(workEmail);

        const reasons = validateEmployeeRow(
          { departmentCode, jobTitleId },
          {
            department,
            jobTitle,
            employeeCodeTaken: await this.organization.isEmployeeCodeTaken(tx, organization.id, input.employeeCode),
            workEmailTaken:
              normalizedEmail !== null &&
              (await this.organization.isWorkEmailTaken(tx, organization.id, normalizedEmail)),
          },
        );
        if (reasons.length > 0 || !department || !jobTitle) throw new EmployeeRowInvalidError(reasons);

        const { id } = await this.organization.createEmployeeWithPlacement(tx, {
          organizationId: organization.id,
          employeeCode: input.employeeCode,
          fullName: input.fullName,
          workEmail,
          employmentType: input.employmentType,
          hireDate: input.hireDate,
          memberSince,
          departmentId: department.id,
          jobTitleId: jobTitle.id,
        });
        await this.audit.record(
          tx,
          organizationAuditEvent(actor, organization.id, 'EMPLOYEE.CREATED', 'Employee', id, null, {
            employeeCode: input.employeeCode,
            fullName: input.fullName,
            workEmail,
            employmentType: input.employmentType,
            hireDate: input.hireDate,
            department: department.code,
            jobTitle: jobTitle.name,
            memberSince,
          }),
        );

        return {
          id,
          employeeCode: input.employeeCode,
          fullName: input.fullName,
          workEmail,
          employmentType: input.employmentType,
          hireDate: input.hireDate,
          status: 'ACTIVE' as const,
          memberSince,
          department: { id: department.id, code: department.code, name: department.name },
          jobTitle: { id: jobTitle.id, name: jobTitle.name },
        };
      });
    } catch (error) {
      // A concurrent entry won the unique key after the checks above: the same answer the checks give.
      if (error instanceof EmployeeCodeTakenError) {
        throw new EmployeeRowInvalidError([{ field: 'employeeCode', code: 'EMPLOYEE_CODE_TAKEN' }]);
      }
      if (error instanceof EmployeeEmailTakenError) {
        throw new EmployeeRowInvalidError([{ field: 'workEmail', code: 'WORK_EMAIL_TAKEN' }]);
      }
      throw error;
    }
  }

  /** The form already checked the shape; an address that still cannot be normalized cannot be taken by anyone. */
  private normalize(workEmail: string): string | null {
    try {
      return normalizeEmail(workEmail);
    } catch (error) {
      if (error instanceof InvalidEmailError) return null;
      throw error;
    }
  }
}
