import { Injectable } from '@nestjs/common';
import { fromDateColumn, toDateColumn } from '../../../core/business-date';
import { normalizeEmail } from '../../../core/email';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { isUniqueViolation } from '../../../infrastructure/database/unique-violation';
import { EmployeeCodeTakenError, EmployeeEmailTakenError, EmployeeNotFoundError } from '../organization.errors';
import {
  CreateEmployeeWithPlacementInput,
  EmployeeCandidate,
  EmployeeProfile,
  EmployeeRecord,
} from '../organization.types';

/** Escapes LIKE metacharacters so a search term matches literally (backslash is PostgreSQL's default escape). */
function escapeLikePattern(term: string): string {
  return term.replace(/[\\%_]/g, (character) => `\\${character}`);
}

/** Employees and their placements: the one writer of both tables, the employee locks and every employee read. */
@Injectable()
export class EmployeeRepo {
  constructor(private readonly prisma: PrismaService) {}

  /** The database clock at the start of the transaction: the instant `created_at` defaults to. */
  async databaseNow(tx: DbTx): Promise<Date> {
    const rows = await tx.$queryRaw<{ now: Date }[]>`SELECT now() AS now`;

    return rows[0].now;
  }

  async employeeCodeExists(tx: DbTx, organizationId: string, employeeCode: string): Promise<boolean> {
    const row = await tx.employee.findUnique({
      where: { organizationId_employeeCode: { organizationId, employeeCode } },
      select: { id: true },
    });

    return row !== null;
  }

  async workEmailExists(tx: DbTx, organizationId: string, normalizedWorkEmail: string): Promise<boolean> {
    const row = await tx.employee.findUnique({
      where: { organizationId_normalizedWorkEmail: { organizationId, normalizedWorkEmail } },
      select: { id: true },
    });

    return row !== null;
  }

  /**
   * The single writer of employees and their placements: every path opens exactly one placement, from the hire
   * date (installation) or from the day the person is recorded (everything else, R-11).
   */
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
          validFrom: toDateColumn(input.memberSince ?? input.hireDate),
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

  /** Unlocked read by the code of the employee, for the operator procedures that name people by code. */
  async findEmployeeByCode(employeeCode: string, tx?: DbTx): Promise<EmployeeRecord | null> {
    const row = await (tx ?? this.prisma).employee.findFirst({ where: { employeeCode } });
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

  async findEmployees(employeeIds: string[]): Promise<EmployeeRecord[]> {
    if (employeeIds.length === 0) return [];

    const rows = await this.prisma.employee.findMany({ where: { id: { in: employeeIds } } });

    return rows.map((row) => ({
      id: row.id,
      organizationId: row.organizationId,
      employeeCode: row.employeeCode,
      fullName: row.fullName,
      workEmail: row.workEmail,
      status: row.status,
      hireDate: fromDateColumn(row.hireDate),
    }));
  }

  async searchActiveEmployees(
    search: string | undefined,
    onDate: Date,
    limit: number,
    excludeEmployeeIds: readonly string[],
  ): Promise<EmployeeCandidate[]> {
    const term = search?.trim();
    // Literal match: % and _ typed by the user are characters, not wildcards (Prisma `contains` does not
    // escape them). The exclusion list travels as ONE uuid[] parameter: a Prisma `notIn` sends one bind
    // parameter per id and fails beyond PostgreSQL's parameter limit.
    const pattern = term ? `%${escapeLikePattern(term)}%` : null;
    const day = fromDateColumn(onDate);
    const rows = await this.prisma.$queryRaw<
      { id: string; employee_code: string; full_name: string; work_email: string | null; department: string | null }[]
    >`
      SELECT e.id, e.employee_code, e.full_name, e.work_email, placement.department
        FROM employees e
        LEFT JOIN LATERAL (
          SELECT d.name AS department
            FROM employee_placements p
            JOIN departments d ON d.id = p.department_id
           WHERE p.employee_id = e.id
             AND p.valid_from <= ${day}::date
             AND (p.valid_to IS NULL OR p.valid_to > ${day}::date)
           ORDER BY p.valid_from DESC
           LIMIT 1
        ) placement ON true
       WHERE e.status = 'ACTIVE'
         AND e.id <> ALL (${[...excludeEmployeeIds]}::uuid[])
         AND (${pattern}::text IS NULL
              OR e.employee_code ILIKE ${pattern}
              OR e.full_name ILIKE ${pattern}
              OR e.work_email ILIKE ${pattern})
       ORDER BY e.employee_code, e.id
       LIMIT ${limit}`;

    return rows.map((row) => ({
      id: row.id,
      employeeCode: row.employee_code,
      fullName: row.full_name,
      workEmail: row.work_email,
      department: row.department,
    }));
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
