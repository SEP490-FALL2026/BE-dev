import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { isUniqueViolation } from '../../../infrastructure/database/unique-violation';
import { CostCenterCodeTakenError } from './cost-center.errors';
import { CreateCostCenterInput } from '../organization.types';
import { CostCenterKind, CostCenterRecord, CostCenterStatus } from './cost-center.types';

interface CostCenterRow {
  id: string;
  code: string;
  name: string;
  kind: CostCenterKind;
  status: CostCenterStatus;
  created_at: Date;
  updated_at: Date;
  deactivated_at: Date | null;
  department_id: string | null;
  department_code: string | null;
  department_name: string | null;
}

const SELECT_WITH_DEPARTMENT = Prisma.sql`
  SELECT c.id, c.code, c.name, c.kind, c.status, c.created_at, c.updated_at, c.deactivated_at,
         d.id AS department_id, d.code AS department_code, d.name AS department_name
    FROM cost_centers c LEFT JOIN departments d ON d.cost_center_id = c.id`;

function toRecord(row: CostCenterRow): CostCenterRecord {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    kind: row.kind,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deactivatedAt: row.deactivated_at,
    department:
      row.department_id === null
        ? null
        : { id: row.department_id, code: row.department_code ?? '', name: row.department_name ?? '' },
  };
}

/**
 * The Cost Center catalogue (US-04-09) and the questions retiring one needs answered about its department: the one
 * writer of `cost_centers`, for the installation and for the catalogue.
 */
@Injectable()
export class CostCenterRepo {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The installation's cost center: always a UNIT, created as given. Unlike `insert` it does not turn a taken code into
   * CostCenterCodeTakenError: the installation command reports the database error as it is.
   */
  async createCostCenter(tx: DbTx, input: CreateCostCenterInput): Promise<{ id: string }> {
    return tx.costCenter.create({ data: { ...input, kind: 'UNIT' }, select: { id: true } });
  }

  async insert(
    tx: DbTx,
    input: { organizationId: string; code: string; name: string; kind: CostCenterKind },
  ): Promise<CostCenterRecord> {
    try {
      const created = await tx.costCenter.create({ data: input, select: { id: true } });

      return (await this.findById(created.id, tx)) as CostCenterRecord;
    } catch (error) {
      if (isUniqueViolation(error, 'code')) throw new CostCenterCodeTakenError(input.code);
      throw error;
    }
  }

  /**
   * Takes the Cost Center's row lock (`FOR UPDATE` to change it, `FOR SHARE` to rely on it), then reads it in a
   * separate statement so what is read is what the lock protects. Null when it does not exist.
   */
  async lock(tx: DbTx, id: string, mode: 'SHARE' | 'UPDATE'): Promise<CostCenterRecord | null> {
    const rows =
      mode === 'SHARE'
        ? await tx.$queryRaw<{ id: string }[]>`SELECT id FROM cost_centers WHERE id = ${id}::uuid FOR SHARE`
        : await tx.$queryRaw<{ id: string }[]>`SELECT id FROM cost_centers WHERE id = ${id}::uuid FOR UPDATE`;
    if (rows.length === 0) return null;

    return this.findById(id, tx);
  }

  /** The cost center with this code, with the department charged to it (the local seed fixture, P23-RV-01). */
  async findByCode(tx: DbTx, organizationId: string, code: string): Promise<CostCenterRecord | null> {
    const rows = await tx.$queryRaw<CostCenterRow[]>`
      ${SELECT_WITH_DEPARTMENT} WHERE c.organization_id = ${organizationId}::uuid AND c.code = ${code}`;

    return rows[0] ? toRecord(rows[0]) : null;
  }

  async findById(id: string, tx?: DbTx): Promise<CostCenterRecord | null> {
    const rows = await (tx ?? this.prisma).$queryRaw<CostCenterRow[]>`
      ${SELECT_WITH_DEPARTMENT} WHERE c.id = ${id}::uuid`;

    return rows[0] ? toRecord(rows[0]) : null;
  }

  async rename(tx: DbTx, id: string, name: string, now: Date): Promise<void> {
    await tx.costCenter.update({ where: { id }, data: { name, updatedAt: now } });
  }

  async deactivate(tx: DbTx, id: string, now: Date): Promise<void> {
    await tx.costCenter.update({ where: { id }, data: { status: 'INACTIVE', deactivatedAt: now, updatedAt: now } });
  }

  /**
   * One page of the catalogue in code order and the total for the same filter, from one snapshot
   * (RepeatableRead). The search is a literal substring of code or name, without case.
   */
  async list(filter: {
    status?: CostCenterStatus;
    kind?: CostCenterKind;
    search?: string;
    skip: number;
    take: number;
  }): Promise<{ items: CostCenterRecord[]; total: number }> {
    const conditions = [
      ...(filter.status ? [Prisma.sql`c.status = ${filter.status}::"CostCenterStatus"`] : []),
      ...(filter.kind ? [Prisma.sql`c.kind = ${filter.kind}::"CostCenterKind"`] : []),
      ...(filter.search
        ? [
            Prisma.sql`(strpos(lower(c.code), ${filter.search.toLowerCase()}) > 0
                        OR strpos(lower(c.name), ${filter.search.toLowerCase()}) > 0)`,
          ]
        : []),
    ];
    const where = conditions.length > 0 ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}` : Prisma.empty;

    return this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<CostCenterRow[]>`
          ${SELECT_WITH_DEPARTMENT} ${where} ORDER BY c.code, c.id LIMIT ${filter.take} OFFSET ${filter.skip}`;
        const counted = await tx.$queryRaw<{ total: number }[]>`
          SELECT count(*)::int AS total FROM cost_centers c ${where}`;

        return { items: rows.map(toRecord), total: counted[0].total };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }

  /** Takes the row lock of the department charged to this Cost Center (it is locked after the Cost Center, T-11). */
  async lockDepartmentOf(tx: DbTx, costCenterId: string): Promise<void> {
    await tx.$queryRaw`SELECT id FROM departments WHERE cost_center_id = ${costCenterId}::uuid FOR UPDATE`;
  }

  /** The people placed in the department on `onDate`, in code order: one page and the total. */
  async currentMembersOfDepartment(
    client: DbTx | undefined,
    departmentId: string,
    onDate: string,
    options: { skip: number; take: number },
  ): Promise<{ items: { employeeCode: string; fullName: string }[]; total: number }> {
    const db = client ?? this.prisma;
    const rows = await db.$queryRaw<{ employee_code: string; full_name: string }[]>`
      SELECT e.employee_code, e.full_name
        FROM employee_placements p JOIN employees e ON e.id = p.employee_id
       WHERE p.department_id = ${departmentId}::uuid
         AND p.valid_from <= ${onDate}::date AND (p.valid_to IS NULL OR p.valid_to > ${onDate}::date)
         AND e.status = 'ACTIVE'
       ORDER BY e.employee_code, e.id LIMIT ${options.take} OFFSET ${options.skip}`;
    const counted = await db.$queryRaw<{ total: number }[]>`
      SELECT count(*)::int AS total
        FROM employee_placements p JOIN employees e ON e.id = p.employee_id
       WHERE p.department_id = ${departmentId}::uuid
         AND p.valid_from <= ${onDate}::date AND (p.valid_to IS NULL OR p.valid_to > ${onDate}::date)
         AND e.status = 'ACTIVE'`;

    return {
      items: rows.map((row) => ({ employeeCode: row.employee_code, fullName: row.full_name })),
      total: counted[0].total,
    };
  }

  /** How many active UNIT cost centers no department is charged to yet: what the next department can take. */
  async countFreeUnits(tx?: DbTx): Promise<number> {
    const rows = await (tx ?? this.prisma).$queryRaw<{ total: number }[]>`
      SELECT count(*)::int AS total FROM cost_centers c
       WHERE c.kind = 'UNIT' AND c.status = 'ACTIVE'
         AND NOT EXISTS (SELECT 1 FROM departments d WHERE d.cost_center_id = c.id)`;

    return rows[0].total;
  }
}
