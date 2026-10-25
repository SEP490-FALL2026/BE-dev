import { Injectable } from '@nestjs/common';
import { fromDateColumn, toDateColumn, type BusinessDate } from '../../../core/business-date';
import { normalizeEmail } from '../../../core/email';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DbTx, readSqlState } from '../../../infrastructure/database/transaction-runner';
import { isUniqueViolation, isCheckViolation } from '../../../infrastructure/database/unique-violation';
import {
  EmployeeCodeTakenError,
  EmployeeEmailTakenError,
  EmployeeNotFoundError,
  PlacementDepartmentInactiveError,
  PlacementOverlapError,
} from '../organization.errors';
import {
  CreateEmployeeWithPlacementInput,
  EmployeeCandidate,
  EmployeeProfile,
  EmployeeRecord,
  EmployeeWorkState,
  OfficialFieldsPatch,
  PlacementInForce,
  ScheduledStructureChange,
  StructureChangeInput,
} from '../organization.types';

/** The employee as the facade shows it. */
function toEmployeeRecord(row: {
  id: string;
  organizationId: string;
  employeeCode: string;
  fullName: string;
  workEmail: string | null;
  employmentType: EmployeeRecord['employmentType'];
  status: EmployeeRecord['status'];
  workState: EmployeeWorkState;
  hireDate: Date;
}): EmployeeRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    employeeCode: row.employeeCode,
    fullName: row.fullName,
    workEmail: row.workEmail,
    employmentType: row.employmentType,
    status: row.status,
    workState: row.workState,
    hireDate: fromDateColumn(row.hireDate),
  };
}

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

  /** Changes the official fields of the employee whose row the caller holds `FOR UPDATE`; the unique email is the last word. */
  async updateOfficialFields(tx: DbTx, employeeId: string, patch: OfficialFieldsPatch): Promise<void> {
    try {
      await tx.employee.update({
        where: { id: employeeId },
        data: {
          ...(patch.fullName !== undefined ? { fullName: patch.fullName } : {}),
          ...(patch.workEmail !== undefined
            ? {
                workEmail: patch.workEmail,
                normalizedWorkEmail: patch.workEmail === null ? null : normalizeEmail(patch.workEmail),
              }
            : {}),
          ...(patch.employmentType !== undefined ? { employmentType: patch.employmentType } : {}),
          ...(patch.hireDate !== undefined ? { hireDate: toDateColumn(patch.hireDate) } : {}),
        },
      });
    } catch (error) {
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

  /**
   * Ends the placement the person has open on `effectiveOn` and opens the next one from that day, so every read by day is
   * right from midnight of it (ADR-04). The caller holds the employee `FOR UPDATE`. The database is the last word on two
   * placements meeting (`employee_placements_no_overlap`) and on a retired department taking a member.
   */
  async scheduleStructureChange(tx: DbTx, input: StructureChangeInput): Promise<ScheduledStructureChange> {
    const open = (
      await tx.$queryRaw<{ id: string; department_id: string; job_title_id: string; valid_from: Date }[]>`
        SELECT id, department_id, job_title_id, valid_from FROM employee_placements
         WHERE employee_id = ${input.employeeId}::uuid AND valid_to IS NULL FOR UPDATE`
    )[0];
    if (!open) throw new PlacementOverlapError('NO_OPEN_PLACEMENT');
    const validFrom = fromDateColumn(open.valid_from);
    if (validFrom >= input.effectiveOn) throw new PlacementOverlapError('NOT_AFTER_CURRENT_PERIOD');

    try {
      await tx.$executeRaw`UPDATE employee_placements SET valid_to = ${input.effectiveOn}::date WHERE id = ${open.id}::uuid`;
      const opened = await tx.employeePlacement.create({
        data: {
          organizationId: input.organizationId,
          employeeId: input.employeeId,
          departmentId: input.departmentId,
          jobTitleId: input.jobTitleId,
          validFrom: toDateColumn(input.effectiveOn),
        },
        select: { id: true },
      });

      return {
        closedPlacementId: open.id,
        openedPlacementId: opened.id,
        from: { departmentId: open.department_id, jobTitleId: open.job_title_id, validFrom },
      };
    } catch (error) {
      if (readSqlState(error) === '23P01' || isUniqueViolation(error, 'valid_from')) {
        throw new PlacementOverlapError('OVERLAP');
      }
      if (isCheckViolation(error)) throw new PlacementDepartmentInactiveError();
      throw error;
    }
  }

  /** Takes back a change that has not taken effect: removes the placement it opened and opens the one it ended again. */
  async cancelStructureChange(
    tx: DbTx,
    change: Pick<ScheduledStructureChange, 'closedPlacementId' | 'openedPlacementId'>,
  ): Promise<void> {
    const removed = await tx.$executeRaw`DELETE FROM employee_placements WHERE id = ${change.openedPlacementId}::uuid`;
    if (removed !== 1) throw new PlacementOverlapError('NO_OPEN_PLACEMENT');
    await tx.$executeRaw`UPDATE employee_placements SET valid_to = NULL WHERE id = ${change.closedPlacementId}::uuid`;
  }

  /** The placement in force on `onDate` with its days, read in the caller's transaction; null when there is none. */
  async placementInForce(tx: DbTx, employeeId: string, onDate: BusinessDate): Promise<PlacementInForce | null> {
    const rows = await tx.$queryRaw<
      { id: string; department_id: string; job_title_id: string; valid_from: Date; valid_to: Date | null }[]
    >`
      SELECT id, department_id, job_title_id, valid_from, valid_to FROM employee_placements
       WHERE employee_id = ${employeeId}::uuid AND valid_from <= ${onDate}::date
         AND (valid_to IS NULL OR valid_to > ${onDate}::date)`;
    const row = rows[0];

    return row
      ? {
          placementId: row.id,
          departmentId: row.department_id,
          jobTitleId: row.job_title_id,
          validFrom: fromDateColumn(row.valid_from),
          validTo: row.valid_to ? fromDateColumn(row.valid_to) : null,
        }
      : null;
  }

  /** The first day of a placement, or null when it does not exist. */
  async placementStart(tx: DbTx, placementId: string): Promise<BusinessDate | null> {
    const rows = await tx.$queryRaw<{ valid_from: Date }[]>`
      SELECT valid_from FROM employee_placements WHERE id = ${placementId}::uuid`;

    return rows[0] ? fromDateColumn(rows[0].valid_from) : null;
  }

  /** Moves the work state of the employee whose row the caller holds `FOR UPDATE`; the database refuses a step off the graph. */
  async setWorkState(tx: DbTx, employeeId: string, workState: EmployeeWorkState): Promise<void> {
    await tx.$executeRaw`UPDATE employees SET work_state = ${workState}::"EmployeeWorkState", updated_at = now() WHERE id = ${employeeId}::uuid`;
  }

  /** Unlocked read: the per-request guard must not take locks (and must not deadlock with termination). */
  async findEmployee(employeeId: string, tx?: DbTx): Promise<EmployeeRecord | null> {
    const row = await (tx ?? this.prisma).employee.findUnique({ where: { id: employeeId } });
    if (!row) return null;

    return toEmployeeRecord(row);
  }

  /** Unlocked read by the code of the employee, for the operator procedures that name people by code. */
  async findEmployeeByCode(employeeCode: string, tx?: DbTx): Promise<EmployeeRecord | null> {
    const row = await (tx ?? this.prisma).employee.findFirst({ where: { employeeCode } });
    if (!row) return null;

    return toEmployeeRecord(row);
  }

  async findEmployees(employeeIds: string[], tx?: DbTx): Promise<EmployeeRecord[]> {
    if (employeeIds.length === 0) return [];

    const rows = await (tx ?? this.prisma).employee.findMany({ where: { id: { in: employeeIds } } });

    return rows.map(toEmployeeRecord);
  }

  /** The department and the job title of the employee on `onDate`, by id; null when no placement holds that day. */
  async placementIdsOn(
    employeeId: string,
    onDate: BusinessDate,
    tx?: DbTx,
  ): Promise<{ departmentId: string; jobTitleId: string } | null> {
    const date = toDateColumn(onDate);
    const row = await (tx ?? this.prisma).employeePlacement.findFirst({
      where: { employeeId, validFrom: { lte: date }, OR: [{ validTo: null }, { validTo: { gt: date } }] },
      select: { departmentId: true, jobTitleId: true },
    });

    return row;
  }

  /** The employees with these codes, as far as they exist; unlocked, for the import judgement that names people by code. */
  async findEmployeesByCodes(employeeCodes: readonly string[], tx?: DbTx): Promise<EmployeeRecord[]> {
    if (employeeCodes.length === 0) return [];
    const rows = await (tx ?? this.prisma).employee.findMany({ where: { employeeCode: { in: [...employeeCodes] } } });

    return rows.map(toEmployeeRecord);
  }

  /** The distinct, lower-case domains of the work emails of everyone the organization has ever employed. */
  async workEmailDomains(tx?: DbTx): Promise<string[]> {
    const rows = await (tx ?? this.prisma).$queryRaw<{ domain: string }[]>`
      SELECT DISTINCT split_part(normalized_work_email, '@', 2) AS domain
        FROM employees
       WHERE normalized_work_email IS NOT NULL AND position('@' IN normalized_work_email) > 0
       ORDER BY 1`;

    return rows.map((row) => row.domain).filter((domain) => domain.length > 0);
  }

  /** How many employees have not left, for the onboarding checklist. */
  async countActive(tx?: DbTx): Promise<number> {
    return (tx ?? this.prisma).employee.count({ where: { status: 'ACTIVE' } });
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
