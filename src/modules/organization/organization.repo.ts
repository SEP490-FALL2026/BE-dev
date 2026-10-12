import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { fromDateColumn, toDateColumn } from '../../core/business-date';
import { normalizeEmail } from '../../core/email';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { DbTx } from '../../infrastructure/database/transaction-runner';
import {
  EmployeeCodeTakenError,
  EmployeeEmailTakenError,
  EmployeeNotFoundError,
  OrganizationAlreadyExistsError,
} from './errors/organization.errors';
import {
  CreateCostCenterInput,
  CreateDepartmentInput,
  CreateEmployeeWithPlacementInput,
  CreateOrganizationInput,
  EmployeeProfile,
  EmployeeRecord,
  OrganizationRecord,
} from './organization.types';

/** True for a P2002 whose constraint or column list mentions one of `needles`. */
function isUniqueViolation(error: unknown, ...needles: string[]): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') return false;
  const haystack = JSON.stringify(error.meta ?? {});

  return needles.some((needle) => haystack.includes(needle));
}

const ORGANIZATION_SELECT = { id: true, name: true, timeZone: true, reportingCurrency: true } as const;

@Injectable()
export class OrganizationRepo {
  constructor(private readonly prisma: PrismaService) {}

  // --- installation -----------------------------------------------------------------

  async findOrganization(tx?: DbTx): Promise<OrganizationRecord | null> {
    return (tx ?? this.prisma).organization.findFirst({ select: ORGANIZATION_SELECT });
  }

  async createOrganization(tx: DbTx, input: CreateOrganizationInput): Promise<OrganizationRecord> {
    try {
      return await tx.organization.create({
        data: { ...input, bootstrapCompletedAt: new Date() },
        select: ORGANIZATION_SELECT,
      });
    } catch (error) {
      // The singleton index is the last defence when two installers race past the advisory lock.
      if (isUniqueViolation(error, 'organizations_singleton')) throw new OrganizationAlreadyExistsError();
      throw error;
    }
  }

  async createCostCenter(tx: DbTx, input: CreateCostCenterInput): Promise<{ id: string }> {
    return tx.costCenter.create({ data: { ...input, kind: 'UNIT' }, select: { id: true } });
  }

  async createDepartment(tx: DbTx, input: CreateDepartmentInput): Promise<{ id: string }> {
    return tx.department.create({ data: input, select: { id: true } });
  }

  async createJobTitle(tx: DbTx, organizationId: string, name: string): Promise<{ id: string }> {
    return tx.jobTitle.create({
      data: { organizationId, name, normalizedName: name.trim().normalize('NFC').toLowerCase() },
      select: { id: true },
    });
  }

  // --- employees --------------------------------------------------------------------

  /** The single writer of employees and their placements: every path opens exactly one placement from hireDate. */
  async createEmployeeWithPlacement(tx: DbTx, input: CreateEmployeeWithPlacementInput): Promise<{ id: string }> {
    const workEmail = input.workEmail?.trim() || null;

    try {
      const employee = await tx.employee.create({
        data: {
          organizationId: input.organizationId,
          employeeCode: input.employeeCode,
          fullName: input.fullName,
          workEmail,
          normalizedWorkEmail: workEmail === null ? null : normalizeEmail(workEmail),
          employmentType: input.employmentType,
          hireDate: toDateColumn(input.hireDate),
          status: 'ACTIVE',
        },
        select: { id: true },
      });
      await tx.employeePlacement.create({
        data: {
          organizationId: input.organizationId,
          employeeId: employee.id,
          departmentId: input.departmentId,
          jobTitleId: input.jobTitleId,
          validFrom: toDateColumn(input.hireDate),
        },
      });

      return employee;
    } catch (error) {
      if (isUniqueViolation(error, 'employee_code')) throw new EmployeeCodeTakenError(input.employeeCode);
      if (isUniqueViolation(error, 'normalized_work_email')) throw new EmployeeEmailTakenError();
      throw error;
    }
  }

  /** Locks the employee row so its status cannot change until commit. */
  async lockEmployee(tx: DbTx, employeeId: string, mode: 'SHARE' | 'UPDATE'): Promise<void> {
    const rows =
      mode === 'SHARE'
        ? await tx.$queryRaw<{ id: string }[]>`SELECT id FROM employees WHERE id = ${employeeId}::uuid FOR SHARE`
        : await tx.$queryRaw<{ id: string }[]>`SELECT id FROM employees WHERE id = ${employeeId}::uuid FOR UPDATE`;

    if (rows.length === 0) throw new EmployeeNotFoundError(employeeId);
  }

  /** Unlocked read: the per-request guard must not take locks (and must not deadlock with termination). */
  async findEmployee(employeeId: string, tx?: DbTx): Promise<EmployeeRecord | null> {
    const row = await (tx ?? this.prisma).employee.findUnique({ where: { id: employeeId } });
    if (!row) return null;

    return {
      id: row.id,
      organizationId: row.organizationId,
      employeeCode: row.employeeCode,
      fullName: row.fullName,
      workEmail: row.workEmail,
      status: row.status,
      hireDate: fromDateColumn(row.hireDate),
    };
  }

  /** Name, department and job title at `onDate` (a date-column value) for /me. */
  async findProfile(employeeId: string, onDate: Date): Promise<EmployeeProfile | null> {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: {
        id: true,
        employeeCode: true,
        fullName: true,
        placements: {
          where: { validFrom: { lte: onDate }, OR: [{ validTo: null }, { validTo: { gt: onDate } }] },
          select: { department: { select: { code: true, name: true } }, jobTitle: { select: { name: true } } },
          take: 1,
        },
      },
    });
    if (!employee) return null;

    const placement = employee.placements[0];
    return {
      id: employee.id,
      employeeCode: employee.employeeCode,
      fullName: employee.fullName,
      department: placement?.department ?? null,
      jobTitle: placement?.jobTitle.name ?? null,
    };
  }
}
