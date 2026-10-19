import { Injectable } from '@nestjs/common';
import { BusinessDate, fromDateColumn, toDateColumn } from '../../core/business-date';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { DbTx } from '../../infrastructure/database/transaction-runner';
import { isUniqueViolation } from '../../infrastructure/database/unique-violation';
import { DepartmentMemberRecord, DepartmentRecord, DepartmentStatus, HeadPeriodRecord } from './department.types';
import { DepartmentCodeTakenError, DepartmentCostCenterError } from './errors/department.errors';
import { CostCenterStatus } from './cost-center/cost-center.types';
import { EmployeeStatus } from './organization.types';

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

/** Departments and who heads them (US-03-06, US-01-11). */
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

  // --- heads --------------------------------------------------------------------------

  /** Who heads each department on `onDate`, for the departments asked about. */
  async currentHeads(
    departmentIds: string[],
    onDate: BusinessDate,
  ): Promise<Map<string, { employeeId: string; employeeCode: string; fullName: string; since: BusinessDate }>> {
    if (departmentIds.length === 0) return new Map();
    const rows = await this.prisma.$queryRaw<
      { department_id: string; employee_id: string; employee_code: string; full_name: string; valid_from: Date }[]
    >`
      SELECT h.department_id, e.id AS employee_id, e.employee_code, e.full_name, h.valid_from
        FROM department_head_periods h JOIN employees e ON e.id = h.employee_id
       WHERE h.department_id = ANY(${departmentIds}::uuid[])
         AND h.valid_from <= ${onDate}::date AND (h.valid_to IS NULL OR h.valid_to > ${onDate}::date)`;

    return new Map(
      rows.map((row) => [
        row.department_id,
        {
          employeeId: row.employee_id,
          employeeCode: row.employee_code,
          fullName: row.full_name,
          since: fromDateColumn(row.valid_from),
        },
      ]),
    );
  }

  /** The history of who headed the department, newest period first. */
  async headPeriods(client: DbTx | undefined, departmentId: string, limit: number): Promise<HeadPeriodRecord[]> {
    const rows = await (client ?? this.prisma).$queryRaw<
      { employee_id: string; employee_code: string; full_name: string; valid_from: Date; valid_to: Date | null }[]
    >`
      SELECT e.id AS employee_id, e.employee_code, e.full_name, h.valid_from, h.valid_to
        FROM department_head_periods h JOIN employees e ON e.id = h.employee_id
       WHERE h.department_id = ${departmentId}::uuid
       ORDER BY h.valid_from DESC, h.id LIMIT ${limit}`;

    return rows.map((row) => ({
      employeeId: row.employee_id,
      employeeCode: row.employee_code,
      fullName: row.full_name,
      validFrom: fromDateColumn(row.valid_from),
      validTo: row.valid_to ? fromDateColumn(row.valid_to) : null,
    }));
  }

  /**
   * Makes room for a new head from `from` (the caller holds the department's `FOR UPDATE` lock): a period that has
   * not begun by then is cancelled, one in force on that day ends the day before it begins. Returns what was
   * cancelled and what was ended, for the audit event.
   */
  async makeRoomForHead(
    tx: DbTx,
    departmentId: string,
    from: BusinessDate,
  ): Promise<{ cancelled: HeadPeriodRecord[]; ended: HeadPeriodRecord[] }> {
    const cancelled = await tx.$queryRaw<
      { employee_id: string; employee_code: string; full_name: string; valid_from: Date; valid_to: Date | null }[]
    >`
      WITH removed AS (
        DELETE FROM department_head_periods
         WHERE department_id = ${departmentId}::uuid AND valid_from >= ${from}::date
        RETURNING employee_id, valid_from, valid_to)
      SELECT e.id AS employee_id, e.employee_code, e.full_name, r.valid_from, r.valid_to
        FROM removed r JOIN employees e ON e.id = r.employee_id`;
    const ended = await tx.$queryRaw<
      { employee_id: string; employee_code: string; full_name: string; valid_from: Date; valid_to: Date | null }[]
    >`
      WITH updated AS (
        UPDATE department_head_periods SET valid_to = ${from}::date
         WHERE department_id = ${departmentId}::uuid AND valid_from < ${from}::date
           AND (valid_to IS NULL OR valid_to > ${from}::date)
        RETURNING employee_id, valid_from, valid_to)
      SELECT e.id AS employee_id, e.employee_code, e.full_name, u.valid_from, u.valid_to
        FROM updated u JOIN employees e ON e.id = u.employee_id`;
    const toRecord = (row: (typeof cancelled)[number]): HeadPeriodRecord => ({
      employeeId: row.employee_id,
      employeeCode: row.employee_code,
      fullName: row.full_name,
      validFrom: fromDateColumn(row.valid_from),
      validTo: row.valid_to ? fromDateColumn(row.valid_to) : null,
    });

    return { cancelled: cancelled.map(toRecord), ended: ended.map(toRecord) };
  }

  async insertHeadPeriod(
    tx: DbTx,
    input: { organizationId: string; departmentId: string; employeeId: string; validFrom: BusinessDate },
  ): Promise<void> {
    await tx.departmentHeadPeriod.create({
      data: {
        organizationId: input.organizationId,
        departmentId: input.departmentId,
        employeeId: input.employeeId,
        validFrom: toDateColumn(input.validFrom),
      },
    });
  }

  /** The department the employee heads on `onDate`, if any (an unlocked read, for the per-request role check). */
  async headedDepartment(employeeId: string, onDate: BusinessDate): Promise<{ departmentId: string } | null> {
    const rows = await this.prisma.$queryRaw<{ department_id: string }[]>`
      SELECT h.department_id FROM department_head_periods h
       WHERE h.employee_id = ${employeeId}::uuid
         AND h.valid_from <= ${onDate}::date AND (h.valid_to IS NULL OR h.valid_to > ${onDate}::date)
       LIMIT 1`;

    return rows[0] ? { departmentId: rows[0].department_id } : null;
  }

  /** True when the employee heads a department now or has a head period that begins later. */
  async hasHeadPeriodFrom(client: DbTx | undefined, employeeId: string, onDate: BusinessDate): Promise<boolean> {
    const rows = await (client ?? this.prisma).$queryRaw<{ one: number }[]>`
      SELECT 1 AS one FROM department_head_periods
       WHERE employee_id = ${employeeId}::uuid AND (valid_to IS NULL OR valid_to > ${onDate}::date)
       LIMIT 1`;

    return rows.length > 0;
  }

  /** Active departments that nobody heads on `onDate`, in code order. */
  async activeDepartmentsWithoutHead(onDate: BusinessDate): Promise<{ id: string; code: string; name: string }[]> {
    return this.prisma.$queryRaw<{ id: string; code: string; name: string }[]>`
      SELECT d.id, d.code, d.name FROM departments d
       WHERE d.status = 'ACTIVE'
         AND NOT EXISTS (
           SELECT 1 FROM department_head_periods h
            WHERE h.department_id = d.id
              AND h.valid_from <= ${onDate}::date AND (h.valid_to IS NULL OR h.valid_to > ${onDate}::date))
       ORDER BY d.code, d.id`;
  }

  /** Active departments with the IT Admin in charge they name (or none), in code order. */
  async activeDepartmentsWithItAdmin(): Promise<
    { id: string; code: string; name: string; itAdminEmployeeId: string | null; itAdminStatus: EmployeeStatus | null }[]
  > {
    const rows = await this.prisma.$queryRaw<
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

  async countActiveDepartments(): Promise<number> {
    return this.prisma.department.count({ where: { status: 'ACTIVE' } });
  }

  async countEmployees(): Promise<number> {
    return this.prisma.employee.count({ where: { status: 'ACTIVE' } });
  }
}
