import { Injectable } from '@nestjs/common';
import { fromDateColumn, toDateColumn } from '../../core/business-date';
import { normalizeEmail } from '../../core/email';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { DbTx } from '../../infrastructure/database/transaction-runner';
import { isUniqueViolation } from '../../infrastructure/database/unique-violation';
import {
  EmployeeCodeTakenError,
  EmployeeEmailTakenError,
  OrganizationAlreadyExistsError,
} from './errors/organization.errors';
import { displayJobTitleName, normalizeJobTitleName } from './job-title-name';
import { EmployeeNotFoundError } from './organization.errors';
import {
  CreateCostCenterInput,
  CreateDepartmentInput,
  CreateEmployeeWithPlacementInput,
  CreateOrganizationInput,
  EmployeeCandidate,
  EmployeeProfile,
  EmployeeRecord,
  JobTitleListFilter,
  JobTitleRecord,
  JobTitleStatus,
  OrganizationRecord,
} from './organization.types';

/** Escapes LIKE metacharacters so a search term matches literally (backslash is PostgreSQL's default escape). */
function escapeLikePattern(term: string): string {
  return term.replace(/[\\%_]/g, (character) => `\\${character}`);
}

const ORGANIZATION_SELECT = { id: true, name: true, timeZone: true, reportingCurrency: true } as const;
const JOB_TITLE_SELECT = {
  id: true,
  name: true,
  status: true,
  version: true,
  createdAt: true,
  updatedAt: true,
} as const;

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

  /** The installation path and the API share one name rule (T-12): shown as the display name, compared as the normalized one. */
  async createJobTitle(tx: DbTx, organizationId: string, name: string): Promise<{ id: string }> {
    return tx.jobTitle.create({
      data: { organizationId, name: displayJobTitleName(name), normalizedName: normalizeJobTitleName(name) },
      select: { id: true },
    });
  }

  // --- job title catalogue (slice G2) ------------------------------------------------

  async insertJobTitle(tx: DbTx, organizationId: string, name: string): Promise<JobTitleRecord> {
    return tx.jobTitle.create({
      data: { organizationId, name: displayJobTitleName(name), normalizedName: normalizeJobTitleName(name) },
      select: JOB_TITLE_SELECT,
    });
  }

  /**
   * Takes the title's row lock (`FOR UPDATE` to change it, `FOR SHARE` to rely on it staying as it is), then
   * reads it in a separate statement so what is read is what the lock now protects. Null when it does not exist.
   */
  async lockJobTitle(tx: DbTx, jobTitleId: string, mode: 'SHARE' | 'UPDATE'): Promise<JobTitleRecord | null> {
    const rows =
      mode === 'SHARE'
        ? await tx.$queryRaw<{ id: string }[]>`SELECT id FROM job_titles WHERE id = ${jobTitleId}::uuid FOR SHARE`
        : await tx.$queryRaw<{ id: string }[]>`SELECT id FROM job_titles WHERE id = ${jobTitleId}::uuid FOR UPDATE`;
    if (rows.length === 0) return null;

    return tx.jobTitle.findUnique({ where: { id: jobTitleId }, select: JOB_TITLE_SELECT });
  }

  /** Unlocked: the title that has this normalized name, whatever its status, to name it in a conflict. */
  async findJobTitleByNormalizedName(organizationId: string, normalizedName: string): Promise<JobTitleRecord | null> {
    return this.prisma.jobTitle.findUnique({
      where: { organizationId_normalizedName: { organizationId, normalizedName } },
      select: JOB_TITLE_SELECT,
    });
  }

  /** Renames a title and raises its version. The caller holds the row lock. */
  async renameJobTitle(tx: DbTx, jobTitleId: string, name: string, now: Date): Promise<JobTitleRecord> {
    return tx.jobTitle.update({
      where: { id: jobTitleId },
      data: {
        name: displayJobTitleName(name),
        normalizedName: normalizeJobTitleName(name),
        version: { increment: 1 },
        updatedAt: now,
      },
      select: JOB_TITLE_SELECT,
    });
  }

  /** Changes a title's status and raises its version. The caller holds the row lock. */
  async setJobTitleStatus(tx: DbTx, jobTitleId: string, status: JobTitleStatus, now: Date): Promise<JobTitleRecord> {
    return tx.jobTitle.update({
      where: { id: jobTitleId },
      data: { status, version: { increment: 1 }, updatedAt: now },
      select: JOB_TITLE_SELECT,
    });
  }

  /**
   * One page of the catalogue in normalized-name order, and the total for the same filter, from one snapshot
   * (RepeatableRead). The search is a literal substring of the normalized name: `%` and `_` are characters.
   */
  async listJobTitles(filter: JobTitleListFilter): Promise<{ items: JobTitleRecord[]; total: number }> {
    const conditions = [
      ...(filter.status ? [Prisma.sql`status = ${filter.status}::"JobTitleStatus"`] : []),
      ...(filter.search ? [Prisma.sql`strpos(normalized_name, ${filter.search}) > 0`] : []),
    ];
    const where = conditions.length > 0 ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}` : Prisma.empty;

    return this.prisma.$transaction(
      async (tx) => {
        const items = await tx.$queryRaw<
          { id: string; name: string; status: JobTitleStatus; version: number; created_at: Date; updated_at: Date }[]
        >`SELECT id, name, status, version, created_at, updated_at FROM job_titles ${where}
           ORDER BY normalized_name, id LIMIT ${filter.take} OFFSET ${filter.skip}`;
        const counted = await tx.$queryRaw<{ total: number }[]>`SELECT count(*)::int AS total FROM job_titles ${where}`;

        return {
          items: items.map((row) => ({
            id: row.id,
            name: row.name,
            status: row.status,
            version: row.version,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
          })),
          total: counted[0].total,
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }

  // --- employees --------------------------------------------------------------------

  /**
   * Takes the department's row lock (`FOR SHARE`: it must still exist, and its cost center must not change, until
   * commit) and reads it. Null when there is no department with this code.
   */
  async lockDepartmentByCode(
    tx: DbTx,
    organizationId: string,
    code: string,
  ): Promise<{ id: string; code: string; name: string; active: boolean; costCenterActive: boolean } | null> {
    const rows = await tx.$queryRaw<
      { id: string; code: string; name: string; cost_center_id: string; status: string }[]
    >`
      SELECT id, code, name, cost_center_id, status::text AS status FROM departments
       WHERE organization_id = ${organizationId}::uuid AND code = ${code} FOR SHARE`;
    const department = rows[0];
    if (!department) return null;

    // Read after the lock, in a statement of its own (lock protocol rule 7): a retirement of the cost center that
    // committed while this waited for the department is seen here.
    const centers = await tx.$queryRaw<{ status: string }[]>`
      SELECT status::text AS status FROM cost_centers WHERE id = ${department.cost_center_id}::uuid`;

    return {
      id: department.id,
      code: department.code,
      name: department.name,
      active: department.status === 'ACTIVE',
      costCenterActive: centers[0]?.status === 'ACTIVE',
    };
  }

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
