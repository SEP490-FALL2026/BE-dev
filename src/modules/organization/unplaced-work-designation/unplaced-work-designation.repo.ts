import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { isUniqueViolation } from '../../../infrastructure/database/unique-violation';
import type {
  ActiveUnplacedWorkDesignation,
  EmployeeStatus,
  UnplacedWorkDesignationEndCause,
  UnplacedWorkKind,
  UnplacedWorkRef,
} from '../public/organization.types';
import {
  UnplacedWorkDesignationAlreadyActiveError,
  UnplacedWorkDesignationAlreadyEndedError,
} from './unplaced-work-designation.errors';
import type { UnplacedWorkDesignationRecord } from './unplaced-work-designation.mapper';

interface DesignationRow {
  id: string;
  organization_id: string;
  work_kind: UnplacedWorkKind;
  work_id: string;
  employee_id: string;
  employee_full_name: string;
  designee_employee_id: string;
  designee_full_name: string;
  designee_status: EmployeeStatus;
  reason: string;
  appointed_at: Date;
  appointed_by_app_user_id: string;
  ended_at: Date | null;
  ended_by_app_user_id: string | null;
  end_cause: UnplacedWorkDesignationEndCause | null;
}

export interface ActiveResolutionRow {
  workKind: UnplacedWorkKind;
  workId: string;
  employeeId: string;
  designeeEmployeeId: string;
  designeeStatus: EmployeeStatus;
  employeeHasAnyPlacement: boolean;
}

const SELECT_DESIGNATION = Prisma.sql`
  SELECT u.id, u.organization_id, u.work_kind, u.work_id,
         u.employee_id, e.full_name AS employee_full_name,
         u.designee_employee_id, d.full_name AS designee_full_name, d.status AS designee_status,
         u.reason, u.appointed_at, u.appointed_by_app_user_id,
         u.ended_at, u.ended_by_app_user_id, u.end_cause
    FROM unplaced_work_it_designations u
    JOIN employees e ON e.id = u.employee_id
    JOIN employees d ON d.id = u.designee_employee_id`;

function toRecord(row: DesignationRow): UnplacedWorkDesignationRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    workKind: row.work_kind,
    workId: row.work_id,
    employee: { id: row.employee_id, fullName: row.employee_full_name },
    designee: { id: row.designee_employee_id, fullName: row.designee_full_name },
    designeeStatus: row.designee_status,
    reason: row.reason,
    appointedAt: row.appointed_at,
    appointedByAppUserId: row.appointed_by_app_user_id,
    endedAt: row.ended_at,
    endedByAppUserId: row.ended_by_app_user_id,
    endCause: row.end_cause,
  };
}

export interface UnplacedWorkDesignationListFilter {
  state: 'ACTIVE' | 'ENDED' | 'ALL';
  workKind?: UnplacedWorkKind;
  employeeId?: string;
  designeeEmployeeId?: string;
  skip: number;
  take: number;
}

function uniqueWorkTargets(works: readonly { workKind: UnplacedWorkKind; workId: string }[]): {
  kinds: UnplacedWorkKind[];
  ids: string[];
} {
  const seen = new Set<string>();
  const kinds: UnplacedWorkKind[] = [];
  const ids: string[] = [];
  for (const work of works) {
    const key = `${work.workKind}:${work.workId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    kinds.push(work.workKind);
    ids.push(work.workId);
  }

  return { kinds, ids };
}

@Injectable()
export class UnplacedWorkDesignationRepo {
  constructor(private readonly prisma: PrismaService) {}

  /** Tier 1 lock: locks the given employee rows in one query ordered by id ASC to prevent deadlocks. */
  async lockEmployeesForUpdate(tx: DbTx, employeeIds: readonly string[]): Promise<string[]> {
    const uniqueIds = [...new Set(employeeIds)];
    if (uniqueIds.length === 0) return [];
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM employees WHERE id = ANY(${uniqueIds}::uuid[]) ORDER BY id ASC FOR UPDATE`;

    return rows.map((row) => row.id);
  }

  async findById(id: string, tx?: DbTx): Promise<UnplacedWorkDesignationRecord | null> {
    const rows = await (tx ?? this.prisma).$queryRaw<DesignationRow[]>`
      ${SELECT_DESIGNATION} WHERE u.id = ${id}::uuid`;

    return rows[0] ? toRecord(rows[0]) : null;
  }

  async findActiveByWorks(
    tx: DbTx,
    works: readonly { workKind: UnplacedWorkKind; workId: string }[],
  ): Promise<{ workKind: UnplacedWorkKind; workId: string }[]> {
    const { kinds, ids } = uniqueWorkTargets(works);
    if (ids.length === 0) return [];
    const rows = await tx.$queryRaw<{ work_kind: UnplacedWorkKind; work_id: string }[]>`
      SELECT u.work_kind, u.work_id
        FROM UNNEST(${kinds}::"UnplacedWorkKind"[], ${ids}::uuid[]) AS w(work_kind, work_id)
        JOIN unplaced_work_it_designations u
          ON u.work_kind = w.work_kind AND u.work_id = w.work_id AND u.ended_at IS NULL`;

    return rows.map((row) => ({ workKind: row.work_kind, workId: row.work_id }));
  }

  async insertMany(
    tx: DbTx,
    input: {
      organizationId: string;
      employeeId: string;
      designeeEmployeeId: string;
      reason: string;
      appointedAt: Date;
      appointedByAppUserId: string;
      works: readonly { workKind: UnplacedWorkKind; workId: string }[];
    },
  ): Promise<UnplacedWorkDesignationRecord[]> {
    const createdIds: string[] = [];
    try {
      for (const work of input.works) {
        const created = await tx.unplacedWorkItDesignation.create({
          data: {
            organizationId: input.organizationId,
            workKind: work.workKind,
            workId: work.workId,
            employeeId: input.employeeId,
            designeeEmployeeId: input.designeeEmployeeId,
            reason: input.reason,
            appointedAt: input.appointedAt,
            appointedByAppUserId: input.appointedByAppUserId,
          },
          select: { id: true },
        });
        createdIds.push(created.id);
      }
    } catch (error) {
      if (isUniqueViolation(error, 'unplaced_work_it_designations_one_active')) {
        throw new UnplacedWorkDesignationAlreadyActiveError();
      }
      throw error;
    }

    const rows = await tx.$queryRaw<DesignationRow[]>`
      ${SELECT_DESIGNATION} WHERE u.id = ANY(${createdIds}::uuid[])`;
    const byId = new Map(rows.map((row) => [row.id, toRecord(row)]));

    return createdIds.map((id) => byId.get(id) as UnplacedWorkDesignationRecord);
  }

  async endById(
    tx: DbTx,
    input: { id: string; endedAt: Date; endedByAppUserId: string; endCause: UnplacedWorkDesignationEndCause },
  ): Promise<UnplacedWorkDesignationRecord> {
    const updated = await tx.unplacedWorkItDesignation.updateMany({
      where: { id: input.id, endedAt: null },
      data: {
        endedAt: input.endedAt,
        endedByAppUserId: input.endedByAppUserId,
        endCause: input.endCause,
      },
    });
    if (updated.count === 0) throw new UnplacedWorkDesignationAlreadyEndedError();

    return (await this.findById(input.id, tx)) as UnplacedWorkDesignationRecord;
  }

  async endActiveByWork(
    tx: DbTx,
    input: {
      workKind: UnplacedWorkKind;
      workId: string;
      endedByAppUserId?: string | null;
      endedAt?: Date;
    },
  ): Promise<number> {
    const result = await tx.unplacedWorkItDesignation.updateMany({
      where: { workKind: input.workKind, workId: input.workId, endedAt: null },
      data: {
        endedAt: input.endedAt ?? new Date(),
        endedByAppUserId: input.endedByAppUserId ?? null,
        endCause: 'WORK_CLOSED',
      },
    });

    return result.count;
  }

  async findActiveForResolution(works: readonly UnplacedWorkRef[], tx?: DbTx): Promise<ActiveResolutionRow[]> {
    const { kinds, ids } = uniqueWorkTargets(works);
    if (ids.length === 0) return [];
    const rows = await (tx ?? this.prisma).$queryRaw<
      {
        work_kind: UnplacedWorkKind;
        work_id: string;
        employee_id: string;
        designee_employee_id: string;
        designee_status: EmployeeStatus;
        employee_has_any_placement: boolean;
      }[]
    >`
      SELECT u.work_kind, u.work_id, u.employee_id, u.designee_employee_id,
             d.status AS designee_status,
             EXISTS (SELECT 1 FROM employee_placements p WHERE p.employee_id = u.employee_id) AS employee_has_any_placement
        FROM UNNEST(${kinds}::"UnplacedWorkKind"[], ${ids}::uuid[]) AS w(work_kind, work_id)
        JOIN unplaced_work_it_designations u
          ON u.work_kind = w.work_kind AND u.work_id = w.work_id AND u.ended_at IS NULL
        JOIN employees d ON d.id = u.designee_employee_id`;

    return rows.map((row) => ({
      workKind: row.work_kind,
      workId: row.work_id,
      employeeId: row.employee_id,
      designeeEmployeeId: row.designee_employee_id,
      designeeStatus: row.designee_status,
      employeeHasAnyPlacement: row.employee_has_any_placement,
    }));
  }

  async findActiveWorkIdsForDesignee(
    designeeEmployeeId: string,
    workKind: UnplacedWorkKind,
    tx?: DbTx,
  ): Promise<string[]> {
    const rows = await (tx ?? this.prisma).$queryRaw<{ work_id: string }[]>`
      SELECT DISTINCT u.work_id
        FROM unplaced_work_it_designations u
        JOIN employees d ON d.id = u.designee_employee_id
       WHERE u.designee_employee_id = ${designeeEmployeeId}::uuid
         AND u.work_kind = ${workKind}::"UnplacedWorkKind"
         AND u.ended_at IS NULL
         AND d.status = 'ACTIVE'
         AND NOT EXISTS (SELECT 1 FROM employee_placements p WHERE p.employee_id = u.employee_id)
       ORDER BY u.work_id ASC`;

    return rows.map((row) => row.work_id);
  }

  async listActiveForUnplacedEmployees(tx?: DbTx): Promise<ActiveUnplacedWorkDesignation[]> {
    const rows = await (tx ?? this.prisma).$queryRaw<
      {
        id: string;
        organization_id: string;
        work_kind: UnplacedWorkKind;
        work_id: string;
        employee_id: string;
        designee_employee_id: string;
        designee_status: EmployeeStatus;
      }[]
    >`
      SELECT u.id, u.organization_id, u.work_kind, u.work_id, u.employee_id,
             u.designee_employee_id, d.status AS designee_status
        FROM unplaced_work_it_designations u
        JOIN employees d ON d.id = u.designee_employee_id
       WHERE u.ended_at IS NULL
         AND NOT EXISTS (SELECT 1 FROM employee_placements p WHERE p.employee_id = u.employee_id)
       ORDER BY u.appointed_at ASC, u.id ASC`;

    return rows.map((row) => ({
      id: row.id,
      organizationId: row.organization_id,
      workKind: row.work_kind,
      workId: row.work_id,
      employeeId: row.employee_id,
      designeeEmployeeId: row.designee_employee_id,
      designeeStatus: row.designee_status,
    }));
  }

  async list(
    filter: UnplacedWorkDesignationListFilter,
  ): Promise<{ items: UnplacedWorkDesignationRecord[]; total: number }> {
    const conditions = [
      ...(filter.state === 'ACTIVE'
        ? [Prisma.sql`u.ended_at IS NULL`]
        : filter.state === 'ENDED'
          ? [Prisma.sql`u.ended_at IS NOT NULL`]
          : []),
      ...(filter.workKind ? [Prisma.sql`u.work_kind = ${filter.workKind}::"UnplacedWorkKind"`] : []),
      ...(filter.employeeId ? [Prisma.sql`u.employee_id = ${filter.employeeId}::uuid`] : []),
      ...(filter.designeeEmployeeId ? [Prisma.sql`u.designee_employee_id = ${filter.designeeEmployeeId}::uuid`] : []),
    ];
    const where = conditions.length > 0 ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}` : Prisma.empty;

    return this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<DesignationRow[]>`
          ${SELECT_DESIGNATION} ${where} ORDER BY u.appointed_at DESC, u.id ASC LIMIT ${filter.take} OFFSET ${filter.skip}`;
        const counted = await tx.$queryRaw<{ total: number }[]>`
          SELECT count(*)::int AS total FROM unplaced_work_it_designations u ${where}`;

        return { items: rows.map(toRecord), total: counted[0].total };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
}
