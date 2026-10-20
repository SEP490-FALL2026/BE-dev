import { Injectable } from '@nestjs/common';
import { BusinessDate, fromDateColumn } from '../../../core/business-date';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { isUniqueViolation } from '../../../infrastructure/database/unique-violation';
import { CostCenterStatus } from '../cost-center/cost-center.types';
import { CreateDepartmentInput, EmployeeStatus } from '../organization.types';
import { DepartmentCodeTakenError, DepartmentCostCenterError } from './department.errors';
import { DepartmentMemberRecord, DepartmentRecord, DepartmentStatus } from './department.types';

interface DepartmentRow {
  id: string;
  code: string;
  name: string;
  function_description: string | null;
  status: DepartmentStatus;
  created_at: Date;
  updated_at: Date;
  deactivated_at: Date | null;
  cc_id: string;
  cc_code: string;
  cc_name: string;
  cc_status: CostCenterStatus;
  it_id: string | null;
  it_code: string | null;
  it_name: string | null;
  it_status: EmployeeStatus | null;
}

const SELECT_DEPARTMENT = Prisma.sql`
  SELECT d.id, d.code, d.name, d.function_description, d.status, d.created_at, d.updated_at, d.deactivated_at,
         c.id AS cc_id, c.code AS cc_code, c.name AS cc_name, c.status AS cc_status,
         e.id AS it_id, e.employee_code AS it_code, e.full_name AS it_name, e.status AS it_status
    FROM departments d
    JOIN cost_centers c ON c.id = d.cost_center_id
    LEFT JOIN employees e ON e.id = d.it_admin_employee_id`;

function toRecord(row: DepartmentRow): DepartmentRecord {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    functionDescription: row.function_description,
    status: row.status,
    costCenter: { id: row.cc_id, code: row.cc_code, name: row.cc_name, status: row.cc_status },
    itAdmin:
      row.it_id === null
        ? null
        : {
            employeeId: row.it_id,
            employeeCode: row.it_code ?? '',
            fullName: row.it_name ?? '',
            employeeStatus: row.it_status ?? 'ACTIVE',
          },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deactivatedAt: row.deactivated_at,
  };
}

export interface DepartmentListFilter {
  status?: DepartmentStatus;
  search?: string;
  skip: number;
  take: number;
}

/**
 * The one writer of `departments` (US-03-06, US-01-11), and the reads of who is placed in a department. Who heads a
 * department is `DepartmentHeadRepo`.
 */
@Injectable()
export class DepartmentRepo {
  constructor(private readonly prisma: PrismaService) {}

  // --- departments --------------------------------------------------------------------

  /** Throws DepartmentCodeTakenError, or DepartmentCostCenterError('TAKEN') when another department already has the cost center. */
  async insert(
    tx: DbTx,
    input: {
      organizationId: string;
      code: string;
      name: string;
      functionDescription: string | null;
      costCenterId: string;
      itAdminEmployeeId: string | null;
    },
  ): Promise<string> {
    try {
      const created = await tx.department.create({ data: input, select: { id: true } });

      return created.id;
    } catch (error) {
      if (isUniqueViolation(error, 'cost_center_id')) throw new DepartmentCostCenterError('TAKEN');
      if (isUniqueViolation(error, 'code')) throw new DepartmentCodeTakenError(input.code);
      throw error;
    }
  }

  /** The installation's first department (`FR-9.8`): written as given, a database error is not translated. */
  async createForInstallation(tx: DbTx, input: CreateDepartmentInput): Promise<{ id: string }> {
    return tx.department.create({ data: input, select: { id: true } });
  }

  /**
   * Takes the department's row lock (`FOR UPDATE` to change it or what hangs on it, `FOR SHARE` to rely on it),
   * then reads it in a separate statement. Null when it does not exist.
   */
  async lock(tx: DbTx, id: string, mode: 'SHARE' | 'UPDATE'): Promise<DepartmentRecord | null> {
    const rows =
      mode === 'SHARE'
        ? await tx.$queryRaw<{ id: string }[]>`SELECT id FROM departments WHERE id = ${id}::uuid FOR SHARE`
        : await tx.$queryRaw<{ id: string }[]>`SELECT id FROM departments WHERE id = ${id}::uuid FOR UPDATE`;
    if (rows.length === 0) return null;

    return this.findById(id, tx);
  }

  /**
   * Takes the department's row lock (`FOR SHARE`: it must still exist, and its cost center must not change, until
   * commit) and reads it. Null when there is no department with this code.
   */
  async lockByCode(
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

  /** The department with this code, with its cost center (the local seed fixture, P23-RV-01). */
  async findByCode(tx: DbTx, organizationId: string, code: string): Promise<DepartmentRecord | null> {
    const rows = await tx.$queryRaw<DepartmentRow[]>`
      ${SELECT_DEPARTMENT} WHERE d.organization_id = ${organizationId}::uuid AND d.code = ${code}`;

    return rows[0] ? toRecord(rows[0]) : null;
  }

  async findById(id: string, tx?: DbTx): Promise<DepartmentRecord | null> {
    const rows = await (tx ?? this.prisma).$queryRaw<DepartmentRow[]>`${SELECT_DEPARTMENT} WHERE d.id = ${id}::uuid`;

    return rows[0] ? toRecord(rows[0]) : null;
  }

  async update(
    tx: DbTx,
    id: string,
    data: { name?: string; functionDescription?: string | null; itAdminEmployeeId?: string | null },
    now: Date,
  ): Promise<void> {
    await tx.department.update({ where: { id }, data: { ...data, updatedAt: now } });
  }

  async deactivate(tx: DbTx, id: string, now: Date): Promise<void> {
    await tx.department.update({ where: { id }, data: { status: 'INACTIVE', deactivatedAt: now, updatedAt: now } });
  }

  /** One page in code order and the total for the same filter, from one snapshot. */
  async list(filter: DepartmentListFilter): Promise<{ items: DepartmentRecord[]; total: number }> {
    const conditions = [
      ...(filter.status ? [Prisma.sql`d.status = ${filter.status}::"DepartmentStatus"`] : []),
      ...(filter.search
        ? [
            Prisma.sql`(strpos(lower(d.code), ${filter.search.toLowerCase()}) > 0
                        OR strpos(lower(d.name), ${filter.search.toLowerCase()}) > 0)`,
          ]
        : []),
    ];
    const where = conditions.length > 0 ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}` : Prisma.empty;

    return this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<DepartmentRow[]>`
          ${SELECT_DEPARTMENT} ${where} ORDER BY d.code, d.id LIMIT ${filter.take} OFFSET ${filter.skip}`;
        const counted = await tx.$queryRaw<{ total: number }[]>`
          SELECT count(*)::int AS total FROM departments d ${where}`;

        return { items: rows.map(toRecord), total: counted[0].total };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }

  /** Active departments that nobody heads on `onDate`, in code order. */
  async activeDepartmentsWithoutHead(
    onDate: BusinessDate,
    tx?: DbTx,
  ): Promise<{ id: string; code: string; name: string }[]> {
    return (tx ?? this.prisma).$queryRaw<{ id: string; code: string; name: string }[]>`
      SELECT d.id, d.code, d.name FROM departments d
       WHERE d.status = 'ACTIVE'
         AND NOT EXISTS (
           SELECT 1 FROM department_head_periods h
            WHERE h.department_id = d.id
              AND h.valid_from <= ${onDate}::date AND (h.valid_to IS NULL OR h.valid_to > ${onDate}::date))
       ORDER BY d.code, d.id`;
  }

  /** Active departments with the IT Admin in charge they name (or none), in code order. */
  async activeDepartmentsWithItAdmin(
    tx?: DbTx,
  ): Promise<
    { id: string; code: string; name: string; itAdminEmployeeId: string | null; itAdminStatus: EmployeeStatus | null }[]
  > {
    const rows = await (tx ?? this.prisma).$queryRaw<
      { id: string; code: string; name: string; it_admin_employee_id: string | null; status: EmployeeStatus | null }[]
    >`
      SELECT d.id, d.code, d.name, d.it_admin_employee_id, e.status
        FROM departments d LEFT JOIN employees e ON e.id = d.it_admin_employee_id
       WHERE d.status = 'ACTIVE' ORDER BY d.code, d.id`;

    return rows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      itAdminEmployeeId: row.it_admin_employee_id,
      itAdminStatus: row.status,
    }));
  }

  async countActiveDepartments(tx?: DbTx): Promise<number> {
    return (tx ?? this.prisma).department.count({ where: { status: 'ACTIVE' } });
  }

  // --- members ------------------------------------------------------------------------

  async memberCounts(departmentIds: string[], onDate: BusinessDate): Promise<Map<string, number>> {
    if (departmentIds.length === 0) return new Map();
    const rows = await this.prisma.$queryRaw<{ department_id: string; total: number }[]>`
      SELECT p.department_id, count(*)::int AS total
        FROM employee_placements p
       WHERE p.department_id = ANY(${departmentIds}::uuid[])
         AND p.valid_from <= ${onDate}::date AND (p.valid_to IS NULL OR p.valid_to > ${onDate}::date)
       GROUP BY p.department_id`;

    return new Map(rows.map((row) => [row.department_id, row.total]));
  }

  /** The people placed in the department on `onDate`, in code order: one page and the total. */
  async members(
    client: DbTx | undefined,
    departmentId: string,
    onDate: BusinessDate,
    options: { skip: number; take: number },
  ): Promise<{ items: DepartmentMemberRecord[]; total: number }> {
    const db = client ?? this.prisma;
    const rows = await db.$queryRaw<
      {
        employee_code: string;
        full_name: string;
        status: EmployeeStatus;
        work_email: string | null;
        valid_from: Date;
      }[]
    >`
      SELECT e.employee_code, e.full_name, e.status, e.work_email, p.valid_from
        FROM employee_placements p JOIN employees e ON e.id = p.employee_id
       WHERE p.department_id = ${departmentId}::uuid
         AND p.valid_from <= ${onDate}::date AND (p.valid_to IS NULL OR p.valid_to > ${onDate}::date)
       ORDER BY e.employee_code, e.id LIMIT ${options.take} OFFSET ${options.skip}`;
    const counted = await db.$queryRaw<{ total: number }[]>`
      SELECT count(*)::int AS total FROM employee_placements p
       WHERE p.department_id = ${departmentId}::uuid
         AND p.valid_from <= ${onDate}::date AND (p.valid_to IS NULL OR p.valid_to > ${onDate}::date)`;

    return {
      items: rows.map((row) => ({
        employeeCode: row.employee_code,
        fullName: row.full_name,
        status: row.status,
        hasWorkEmail: row.work_email !== null,
        memberSince: fromDateColumn(row.valid_from),
      })),
      total: counted[0].total,
    };
  }

  /** The department the employee is a member of on `onDate`, with the end of that placement (null: open). */
  async placementOn(
    tx: DbTx,
    employeeId: string,
    onDate: BusinessDate,
  ): Promise<{ departmentId: string; validFrom: BusinessDate; validTo: BusinessDate | null } | null> {
    const rows = await tx.$queryRaw<{ department_id: string; valid_from: Date; valid_to: Date | null }[]>`
      SELECT department_id, valid_from, valid_to FROM employee_placements
       WHERE employee_id = ${employeeId}::uuid
         AND valid_from <= ${onDate}::date AND (valid_to IS NULL OR valid_to > ${onDate}::date)`;
    const row = rows[0];

    return row
      ? {
          departmentId: row.department_id,
          validFrom: fromDateColumn(row.valid_from),
          validTo: row.valid_to ? fromDateColumn(row.valid_to) : null,
        }
      : null;
  }
}
