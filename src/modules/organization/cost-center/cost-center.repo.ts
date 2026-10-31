import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { isUniqueViolation } from '../../../infrastructure/database/unique-violation';
import { CostCenterCodeTakenError, CostCenterDepartmentAlreadyLinkedError } from './cost-center.errors';
import { CostCenterBrief, CreateCostCenterInput } from '../public/organization.types';
import { CostCenterRecord } from './cost-center.types';
import { CostCenterKind, CostCenterStatus } from '../organization-structure.types';

interface CostCenterRow {
  id: string;
  code: string;
  name: string;
  kind: CostCenterKind;
  status: CostCenterStatus;
  created_at: Date;
  updated_at: Date;
  deactivated_at: Date | null;
  linked_at: Date | null;
  department_id: string | null;
  department_code: string | null;
  department_name: string | null;
}

const SELECT_WITH_DEPARTMENT = Prisma.sql`
  SELECT c.id, c.code, c.name, c.kind, c.status, c.created_at, c.updated_at, c.deactivated_at, c.linked_at,
         d.id AS department_id, d.code AS department_code, d.name AS department_name
    FROM cost_centers c LEFT JOIN departments d ON d.id = c.department_id`;

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
    linkedAt: row.linked_at,
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
   * The installation's cost center: always a UNIT, created as given, for the department that exists already. Unlike
   * `insert` it does not turn a taken code into CostCenterCodeTakenError: the installation command reports the database
   * error as it is.
   */
  async createCostCenter(tx: DbTx, input: CreateCostCenterInput): Promise<{ id: string }> {
    const now = new Date();

    return tx.costCenter.create({
      data: { ...input, kind: 'UNIT', createdAt: now, linkedAt: now },
      select: { id: true },
    });
  }

  /** Whether the operator has activated the Cost Center link (`ops:cost-center-direction activate`): one organization per installation. */
  async isDirectionActivated(tx?: DbTx): Promise<boolean> {
    return (await (tx ?? this.prisma).costCenterDirectionActivation.count()) > 0;
  }

  /** Active departments with no Cost Center in use yet (Finance creates one for each), in code order. */
  async departmentsWithoutCostCenter(tx?: DbTx): Promise<{ id: string; code: string; name: string }[]> {
    return (tx ?? this.prisma).$queryRaw<{ id: string; code: string; name: string }[]>`
      SELECT d.id, d.code, d.name FROM departments d
       WHERE d.status = 'ACTIVE'
         AND NOT EXISTS (SELECT 1 FROM cost_centers c WHERE c.department_id = d.id AND c.status = 'ACTIVE')
       ORDER BY d.code, d.id`;
  }

  /**
   * The activation of the Cost Center link of a NEW local database (`pnpm dev:seed`, in the seed's own transaction): it has no
   * previous release to be recovered, so nothing waits for the host. The only write of this table outside
   * `pnpm ops:cost-center-direction activate`; the values are the fixed `LOCAL_TEST` ones. False when it was already recorded.
   */
  async recordLocalSeedActivation(tx: DbTx, organizationId: string): Promise<boolean> {
    if ((await tx.costCenterDirectionActivation.count({ where: { organizationId } })) > 0) return false;
    await tx.costCenterDirectionActivation.create({
      data: {
        organizationId,
        releaseEvidence: 'local development seed',
        approverRef: 'LOCAL_SEED',
        operatorRef: 'LOCAL_SEED',
        environment: 'LOCAL_TEST',
      },
    });

    return true;
  }

  /**
   * A Cost Center for a department, linked in the same statement: the link begins when the Cost Center is created, so
   * `linkedAt` is the same moment as `createdAt` and never before the department's own. Throws
   * CostCenterCodeTakenError, or CostCenterDepartmentAlreadyLinkedError when the department already has one in use.
   */
  async insert(
    tx: DbTx,
    input: { organizationId: string; code: string; name: string; kind: CostCenterKind; departmentId: string },
  ): Promise<CostCenterRecord> {
    const now = new Date();
    try {
      const created = await tx.costCenter.create({
        data: { ...input, createdAt: now, linkedAt: now },
        select: { id: true },
      });

      return (await this.findById(created.id, tx)) as CostCenterRecord;
    } catch (error) {
      if (isUniqueViolation(error, 'cost_centers_one_active_per_department', 'department_id')) {
        throw new CostCenterDepartmentAlreadyLinkedError(input.departmentId);
      }
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

  /** The Cost Centers with these ids, as far as they exist, without their department. */
  async findBriefs(ids: readonly string[], tx?: DbTx): Promise<CostCenterBrief[]> {
    if (ids.length === 0) return [];

    return (tx ?? this.prisma).costCenter.findMany({
      where: { id: { in: [...ids] } },
      select: { id: true, code: true, name: true, kind: true, status: true, departmentId: true },
    });
  }

  /** The Cost Centers with these codes, as far as they exist, without their department. */
  async findBriefsByCodes(codes: readonly string[], tx?: DbTx): Promise<CostCenterBrief[]> {
    if (codes.length === 0) return [];

    return (tx ?? this.prisma).costCenter.findMany({
      where: { code: { in: [...codes] } },
      select: { id: true, code: true, name: true, kind: true, status: true, departmentId: true },
    });
  }

  /**
   * Takes `FOR SHARE` on the Cost Centers with these ids, in the order of the ids so two writers never wait on each
   * other in a circle, then reads them in a separate statement: a Cost Center cannot be made inactive until the
   * transaction ends. Those that do not exist are absent from the answer.
   */
  async lockSharedBriefs(tx: DbTx, ids: readonly string[]): Promise<CostCenterBrief[]> {
    if (ids.length === 0) return [];
    await tx.$queryRaw`SELECT id FROM cost_centers WHERE id = ANY(${[...ids]}::uuid[]) ORDER BY id FOR SHARE`;

    return this.findBriefs(ids, tx);
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

  /**
   * Takes the row lock of the department a Cost Center is to be created for, then reads what the creation judges it by: its
   * status and whether it already has a Cost Center in use (two statements, so the second reads what the lock protects).
   * Null when the department does not exist in the organization.
   */
  async lockDepartmentForCostCenter(
    tx: DbTx,
    organizationId: string,
    departmentId: string,
  ): Promise<{ id: string; active: boolean; hasCostCenterInUse: boolean } | null> {
    const rows = await tx.$queryRaw<{ id: string; status: string }[]>`
      SELECT id, status::text AS status FROM departments
       WHERE id = ${departmentId}::uuid AND organization_id = ${organizationId}::uuid FOR UPDATE`;
    if (rows.length === 0) return null;
    const held = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM cost_centers WHERE department_id = ${departmentId}::uuid AND status = 'ACTIVE'`;

    return { id: rows[0].id, active: rows[0].status === 'ACTIVE', hasCostCenterInUse: held.length > 0 };
  }

  /** The working people placed in the department on `onDate`, in code order: one page and the total, from one snapshot (`LD-11`). */
  async currentMembersOfDepartment(
    client: DbTx | undefined,
    departmentId: string,
    onDate: string,
    options: { skip: number; take: number },
  ): Promise<{ items: { employeeCode: string; fullName: string }[]; total: number }> {
    if (client) return this.readCurrentMembers(client, departmentId, onDate, options);

    return this.prisma.$transaction((tx) => this.readCurrentMembers(tx, departmentId, onDate, options), {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    });
  }

  private async readCurrentMembers(
    db: DbTx,
    departmentId: string,
    onDate: string,
    options: { skip: number; take: number },
  ): Promise<{ items: { employeeCode: string; fullName: string }[]; total: number }> {
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
}
