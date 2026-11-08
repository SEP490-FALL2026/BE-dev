import { Injectable } from '@nestjs/common';
import { BusinessDate, fromDateColumn, toDateColumn } from '../../../core/business-date';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { isUniqueViolation } from '../../../infrastructure/database/unique-violation';
import { CostCenterStatus } from '../organization-structure.types';
import { CreateDepartmentInput, EmployeeStatus, EmployeeWorkState } from '../public/organization.types';
import { DepartmentCodeTakenError } from './department.errors';
import { DepartmentMemberRecord, DepartmentRecord } from './department.types';
import { DepartmentStatus } from '../organization-structure.types';

interface DepartmentRow {
  id: string;
  code: string;
  name: string;
  function_description: string | null;
  status: DepartmentStatus;
  created_at: Date;
  updated_at: Date;
  deactivated_at: Date | null;
  cc_id: string | null;
  cc_code: string | null;
  cc_name: string | null;
  cc_status: CostCenterStatus | null;
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
    LEFT JOIN cost_centers c ON c.department_id = d.id AND c.status = 'ACTIVE'
    LEFT JOIN employees e ON e.id = d.it_admin_employee_id`;

function toRecord(row: DepartmentRow): DepartmentRecord {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    functionDescription: row.function_description,
    status: row.status,
    // The current Cost Center: the ACTIVE one that belongs to the department; none until Finance creates one.
    costCenter:
      row.cc_id === null ? null : { id: row.cc_id, code: row.cc_code ?? '', name: row.cc_name ?? '', status: 'ACTIVE' },
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
  /** Only these departments: what an IT Admin may read. An empty list matches none. */
  ids?: readonly string[];
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

  /** A department with no Cost Center: Finance creates it afterwards (`QĐ-87d(1)`). Throws DepartmentCodeTakenError. */
  async insert(
    tx: DbTx,
    input: {
      organizationId: string;
      code: string;
      name: string;
      functionDescription: string | null;
      itAdminEmployeeId: string | null;
    },
  ): Promise<string> {
    try {
      const created = await tx.department.create({ data: input, select: { id: true } });

      return created.id;
    } catch (error) {
      if (isUniqueViolation(error, 'code')) throw new DepartmentCodeTakenError(input.code);
      throw error;
    }
  }

  /** The installation's first department (`FR-9.8`): written as given, a database error is not translated. */
  async createForInstallation(tx: DbTx, input: CreateDepartmentInput): Promise<{ id: string }> {
    return tx.department.create({ data: input, select: { id: true } });
  }

  /** Takes the row lock (`FOR UPDATE` to change it or what hangs on it, `FOR SHARE` to rely on it), then reads it. Null when absent. */
  async lock(tx: DbTx, id: string, mode: 'SHARE' | 'UPDATE'): Promise<DepartmentRecord | null> {
    const rows =
      mode === 'SHARE'
        ? await tx.$queryRaw<{ id: string }[]>`SELECT id FROM departments WHERE id = ${id}::uuid FOR SHARE`
        : await tx.$queryRaw<{ id: string }[]>`SELECT id FROM departments WHERE id = ${id}::uuid FOR UPDATE`;
    if (rows.length === 0) return null;

    return this.findById(id, tx);
  }

  /**
   * Takes the row lock (`FOR SHARE`: it must still exist and stay as read until commit) and reads it. Null when absent. Whether the
   * department has a Cost Center is not asked: a department with none takes people in (`QĐ-87d(3)`).
   */
  async lockByCode(
    tx: DbTx,
    organizationId: string,
    code: string,
  ): Promise<{ id: string; code: string; name: string; active: boolean } | null> {
    const rows = await tx.$queryRaw<{ id: string; code: string; name: string; status: string }[]>`
      SELECT id, code, name, status::text AS status FROM departments
       WHERE organization_id = ${organizationId}::uuid AND code = ${code} FOR SHARE`;
    const department = rows[0];
    if (!department) return null;

    return { id: department.id, code: department.code, name: department.name, active: department.status === 'ACTIVE' };
  }

  /** The department each of these employees was placed in on `onDate`, in one read. */
  async placementsOn(
    employeeIds: readonly string[],
    onDate: BusinessDate,
    tx?: DbTx,
  ): Promise<{ employeeId: string; departmentId: string }[]> {
    if (employeeIds.length === 0) return [];
    const date = toDateColumn(onDate);

    return (tx ?? this.prisma).employeePlacement.findMany({
      where: {
        employeeId: { in: [...employeeIds] },
        validFrom: { lte: date },
        OR: [{ validTo: null }, { validTo: { gt: date } }],
      },
      select: { employeeId: true, departmentId: true },
    });
  }

  /** The departments with these ids in one read; an id that does not exist is absent. */
  async findByIds(ids: readonly string[], tx?: DbTx): Promise<DepartmentRecord[]> {
    if (ids.length === 0) return [];
    const rows = await (tx ?? this.prisma).$queryRaw<DepartmentRow[]>`
      ${SELECT_DEPARTMENT} WHERE d.id = ANY(${[...ids]}::uuid[])`;

    return rows.map(toRecord);
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
      ...(filter.ids ? [Prisma.sql`d.id = ANY(${[...filter.ids]}::uuid[])`] : []),
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

  /** The ids of the departments that are not stopped, by id: the departments a budget cycle divides its ceiling among. */
  async activeDepartmentIds(tx?: DbTx): Promise<string[]> {
    const rows = await (tx ?? this.prisma).department.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true },
      orderBy: { id: 'asc' },
    });

    return rows.map((row) => row.id);
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

  /** Holds the department `FOR SHARE` until the transaction ends (it must still exist and stay as read), then reads it. */
  async lockShared(tx: DbTx, id: string): Promise<DepartmentRecord | null> {
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM departments WHERE id = ${id}::uuid FOR SHARE`;
    if (rows.length === 0) return null;

    return this.findById(id, tx);
  }

  /** The departments that name this employee IT Admin in charge, by id, while the employee has not left. */
  async idsInChargeOf(employeeId: string, tx?: DbTx): Promise<string[]> {
    const rows = await (tx ?? this.prisma).$queryRaw<{ id: string }[]>`
      SELECT d.id FROM departments d JOIN employees e ON e.id = d.it_admin_employee_id
       WHERE d.it_admin_employee_id = ${employeeId}::uuid AND e.status = 'ACTIVE'
       ORDER BY d.id`;

    return rows.map((row) => row.id);
  }

  /** The active departments that name each of these employees IT Admin in charge, in code order; whether they still work is not asked. */
  inChargeOfMany(employeeIds: readonly string[], tx?: DbTx) {
    return (tx ?? this.prisma).department.findMany({
      where: { itAdminEmployeeId: { in: [...employeeIds] }, status: 'ACTIVE' },
      select: { id: true, code: true, itAdminEmployeeId: true },
      orderBy: [{ code: 'asc' }, { id: 'asc' }],
    });
  }

  /** Everyone placed in the department on `onDate`, by employee id; null when the department does not exist. */
  async memberIdsOn(departmentId: string, onDate: BusinessDate, tx?: DbTx): Promise<string[] | null> {
    if (!(await this.findById(departmentId, tx))) return null;
    const rows = await (tx ?? this.prisma).$queryRaw<{ employee_id: string }[]>`
      SELECT p.employee_id FROM employee_placements p
       WHERE p.department_id = ${departmentId}::uuid
         AND p.valid_from <= ${onDate}::date AND (p.valid_to IS NULL OR p.valid_to > ${onDate}::date)`;

    return rows.map((row) => row.employee_id);
  }

  /**
   * The people placed in the department on `onDate`, in code order: one page and the total, read in one snapshot when the
   * caller has no transaction of its own (`LD-11`). The email is never read, only whether there is one.
   */
  async members(
    client: DbTx | undefined,
    departmentId: string,
    onDate: BusinessDate,
    options: { skip: number; take: number },
  ): Promise<{ items: DepartmentMemberRecord[]; total: number }> {
    if (client) return this.readMembers(client, departmentId, onDate, options);

    return this.prisma.$transaction((tx) => this.readMembers(tx, departmentId, onDate, options), {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    });
  }

  private async readMembers(
    db: DbTx,
    departmentId: string,
    onDate: BusinessDate,
    options: { skip: number; take: number },
  ): Promise<{ items: DepartmentMemberRecord[]; total: number }> {
    const rows = await db.$queryRaw<
      {
        employee_id: string;
        employee_code: string;
        full_name: string;
        status: EmployeeStatus;
        work_state: EmployeeWorkState;
        has_work_email: boolean;
        valid_from: Date;
      }[]
    >`
      SELECT e.id AS employee_id, e.employee_code, e.full_name, e.status, e.work_state, (e.work_email IS NOT NULL) AS has_work_email, p.valid_from
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
        employeeId: row.employee_id,
        employeeCode: row.employee_code,
        fullName: row.full_name,
        status: row.status,
        workState: row.work_state,
        hasWorkEmail: row.has_work_email,
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
