import { Injectable } from '@nestjs/common';
import { DepartmentItSubstituteEndCause, Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { isUniqueViolation } from '../../../infrastructure/database/unique-violation';
import type { DepartmentItSubstituteBrief } from '../department/department.types';
import { DepartmentItSubstituteAlreadyActiveError } from './department-it-substitute.errors';
import type { DepartmentItSubstituteRecord } from './department-it-substitute.mapper';

interface SubstituteRow {
  id: string;
  organization_id: string;
  department_id: string;
  department_name: string;
  substitute_employee_id: string;
  substitute_full_name: string;
  replaced_employee_id: string | null;
  replaced_full_name: string | null;
  reason: string;
  appointed_at: Date;
  appointed_by_app_user_id: string;
  ended_at: Date | null;
  ended_by_app_user_id: string | null;
  end_cause: DepartmentItSubstituteEndCause | null;
}

const SELECT_SUBSTITUTE = Prisma.sql`
  SELECT s.id, s.organization_id, s.department_id, d.name AS department_name,
         s.substitute_employee_id, e.full_name AS substitute_full_name,
         s.replaced_employee_id, r.full_name AS replaced_full_name,
         s.reason, s.appointed_at, s.appointed_by_app_user_id,
         s.ended_at, s.ended_by_app_user_id, s.end_cause
    FROM department_it_substitutes s
    JOIN departments d ON d.id = s.department_id
    JOIN employees e ON e.id = s.substitute_employee_id
    LEFT JOIN employees r ON r.id = s.replaced_employee_id`;

function toRecord(row: SubstituteRow): DepartmentItSubstituteRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    department: { id: row.department_id, name: row.department_name },
    substitute: { id: row.substitute_employee_id, fullName: row.substitute_full_name },
    replaced: row.replaced_employee_id
      ? { id: row.replaced_employee_id, fullName: row.replaced_full_name ?? '' }
      : null,
    reason: row.reason,
    appointedAt: row.appointed_at,
    appointedByAppUserId: row.appointed_by_app_user_id,
    endedAt: row.ended_at,
    endedByAppUserId: row.ended_by_app_user_id,
    endCause: row.end_cause,
  };
}

export interface DepartmentItSubstituteListFilter {
  departmentId?: string;
  state: 'ACTIVE' | 'ENDED' | 'ALL';
  readableDepartmentIds?: readonly string[];
  callerSubstituteEmployeeId?: string;
  skip: number;
  take: number;
}

@Injectable()
export class DepartmentItSubstituteRepo {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string, tx?: DbTx): Promise<DepartmentItSubstituteRecord | null> {
    const rows = await (tx ?? this.prisma).$queryRaw<SubstituteRow[]>`${SELECT_SUBSTITUTE} WHERE s.id = ${id}::uuid`;

    return rows[0] ? toRecord(rows[0]) : null;
  }

  async findActiveByDepartmentId(tx: DbTx, departmentId: string): Promise<DepartmentItSubstituteRecord | null> {
    const rows = await tx.$queryRaw<SubstituteRow[]>`
      ${SELECT_SUBSTITUTE} WHERE s.department_id = ${departmentId}::uuid AND s.ended_at IS NULL`;

    return rows[0] ? toRecord(rows[0]) : null;
  }

  /** Active temporary substitutes for a page of departments, keyed by departmentId (only ACTIVE substitute employees). */
  async activeByDepartmentIds(
    departmentIds: readonly string[],
    tx?: DbTx,
  ): Promise<Map<string, DepartmentItSubstituteBrief & { employeeStatus: 'ACTIVE' | 'TERMINATED' }>> {
    if (departmentIds.length === 0) return new Map();
    const rows = await (tx ?? this.prisma).$queryRaw<
      {
        id: string;
        department_id: string;
        substitute_employee_id: string;
        full_name: string;
        employee_status: 'ACTIVE' | 'TERMINATED';
        appointed_at: Date;
      }[]
    >`
      SELECT s.id, s.department_id, s.substitute_employee_id, e.full_name, e.status AS employee_status, s.appointed_at
        FROM department_it_substitutes s
        JOIN employees e ON e.id = s.substitute_employee_id
       WHERE s.ended_at IS NULL AND s.department_id = ANY(${[...departmentIds]}::uuid[])`;

    return new Map(
      rows.map((row) => [
        row.department_id,
        {
          id: row.id,
          employee: { id: row.substitute_employee_id, fullName: row.full_name },
          employeeStatus: row.employee_status,
          appointedAt: row.appointed_at,
        },
      ]),
    );
  }

  async insert(
    tx: DbTx,
    input: {
      organizationId: string;
      departmentId: string;
      substituteEmployeeId: string;
      replacedEmployeeId: string | null;
      reason: string;
      appointedAt: Date;
      appointedByAppUserId: string;
    },
  ): Promise<DepartmentItSubstituteRecord> {
    try {
      const created = await tx.departmentItSubstitute.create({
        data: input,
        select: { id: true },
      });

      return (await this.findById(created.id, tx)) as DepartmentItSubstituteRecord;
    } catch (error) {
      if (isUniqueViolation(error, 'department_it_substitutes_one_active')) {
        throw new DepartmentItSubstituteAlreadyActiveError();
      }
      throw error;
    }
  }

  async endById(
    tx: DbTx,
    input: { id: string; endedAt: Date; endedByAppUserId: string; endCause: DepartmentItSubstituteEndCause },
  ): Promise<DepartmentItSubstituteRecord> {
    await tx.departmentItSubstitute.update({
      where: { id: input.id },
      data: { endedAt: input.endedAt, endedByAppUserId: input.endedByAppUserId, endCause: input.endCause },
    });

    return (await this.findById(input.id, tx)) as DepartmentItSubstituteRecord;
  }

  async endActiveForDepartment(
    tx: DbTx,
    input: { departmentId: string; endedAt: Date; endedByAppUserId: string; endCause: DepartmentItSubstituteEndCause },
  ): Promise<DepartmentItSubstituteRecord | null> {
    const active = await tx.departmentItSubstitute.findFirst({
      where: { departmentId: input.departmentId, endedAt: null },
      select: { id: true },
    });
    if (!active) return null;

    return this.endById(tx, {
      id: active.id,
      endedAt: input.endedAt,
      endedByAppUserId: input.endedByAppUserId,
      endCause: input.endCause,
    });
  }

  async countActiveBySubstitute(tx: DbTx, employeeId: string): Promise<number> {
    return tx.departmentItSubstitute.count({
      where: { substituteEmployeeId: employeeId, endedAt: null },
    });
  }

  async list(
    filter: DepartmentItSubstituteListFilter,
  ): Promise<{ items: DepartmentItSubstituteRecord[]; total: number }> {
    const conditions = [
      ...(filter.departmentId ? [Prisma.sql`s.department_id = ${filter.departmentId}::uuid`] : []),
      ...(filter.state === 'ACTIVE'
        ? [Prisma.sql`s.ended_at IS NULL`]
        : filter.state === 'ENDED'
          ? [Prisma.sql`s.ended_at IS NOT NULL`]
          : []),
      ...(filter.callerSubstituteEmployeeId !== undefined
        ? [
            Prisma.sql`(s.department_id = ANY(${[...(filter.readableDepartmentIds ?? [])]}::uuid[])
                        OR s.substitute_employee_id = ${filter.callerSubstituteEmployeeId}::uuid)`,
          ]
        : []),
    ];
    const where = conditions.length > 0 ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}` : Prisma.empty;

    return this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<SubstituteRow[]>`
          ${SELECT_SUBSTITUTE} ${where} ORDER BY s.appointed_at DESC, s.id ASC LIMIT ${filter.take} OFFSET ${filter.skip}`;
        const counted = await tx.$queryRaw<{ total: number }[]>`
          SELECT count(*)::int AS total FROM department_it_substitutes s ${where}`;

        return { items: rows.map(toRecord), total: counted[0].total };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
}
