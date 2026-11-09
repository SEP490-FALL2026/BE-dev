import { Injectable } from '@nestjs/common';
import { fromDateColumn, type BusinessDate } from '../../../core/business-date';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { FindingRecord } from './identity.types';

/** The one writer of `usage_no_assignment_findings`: activity of a person who holds no seat of the application (`FR-4.8`, Q-84). */
@Injectable()
export class NoAssignmentFindingRepo {
  constructor(private readonly prisma: PrismaService) {}

  /** Opens the finding of the person, or widens the one open to the days now seen; true when it was opened. */
  async openOrWiden(
    tx: DbTx,
    input: {
      organizationId: string;
      applicationId: string;
      employeeId: string;
      firstActivityDate: BusinessDate;
      lastActivityDate: BusinessDate;
      importId: string;
    },
  ): Promise<boolean> {
    const rows = await tx.$queryRaw<{ inserted: boolean }[]>`
      INSERT INTO usage_no_assignment_findings (organization_id, application_id, employee_id, first_activity_date, last_activity_date,
        last_import_id, status)
      VALUES (${input.organizationId}::uuid, ${input.applicationId}::uuid, ${input.employeeId}::uuid,
        ${input.firstActivityDate}::date, ${input.lastActivityDate}::date, ${input.importId}::uuid, 'OPEN')
      ON CONFLICT (organization_id, application_id, employee_id) WHERE status = 'OPEN'
      DO UPDATE SET first_activity_date = LEAST(usage_no_assignment_findings.first_activity_date, EXCLUDED.first_activity_date),
        last_activity_date = GREATEST(usage_no_assignment_findings.last_activity_date, EXCLUDED.last_activity_date),
        last_import_id = EXCLUDED.last_import_id
      RETURNING (xmax = 0) AS inserted`;

    return rows[0]?.inserted ?? false;
  }

  /** Closes the open findings of these people: a seat covers the days now. Returns how many were closed. */
  async closeCovered(
    tx: DbTx,
    input: { applicationId: string; employeeIds: readonly string[]; at: Date; reason: string },
  ): Promise<number> {
    if (input.employeeIds.length === 0) return 0;
    const result = await tx.usageNoAssignmentFinding.updateMany({
      where: { applicationId: input.applicationId, employeeId: { in: [...input.employeeIds] }, status: 'OPEN' },
      data: { status: 'CLOSED', closedAt: input.at, closedReason: input.reason },
    });

    return result.count;
  }

  /** The people of these who have an open finding. */
  async employeesWithOpen(applicationId: string, employeeIds: readonly string[], tx?: DbTx): Promise<Set<string>> {
    if (employeeIds.length === 0) return new Set();
    const rows = await (tx ?? this.prisma).usageNoAssignmentFinding.findMany({
      where: { applicationId, employeeId: { in: [...employeeIds] }, status: 'OPEN' },
      select: { employeeId: true },
    });

    return new Set(rows.map((row) => row.employeeId));
  }

  async page(filter: {
    applicationId?: string;
    status: 'OPEN' | 'CLOSED';
    skip: number;
    take: number;
  }): Promise<{ items: FindingRecord[]; total: number }> {
    const where = { status: filter.status, ...(filter.applicationId ? { applicationId: filter.applicationId } : {}) };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.usageNoAssignmentFinding.findMany({
        where,
        orderBy: [{ lastActivityDate: 'desc' }, { id: 'asc' }],
        skip: filter.skip,
        take: filter.take,
      }),
      this.prisma.usageNoAssignmentFinding.count({ where }),
    ]);

    return {
      items: rows.map((row) => ({
        ...row,
        firstActivityDate: fromDateColumn(row.firstActivityDate),
        lastActivityDate: fromDateColumn(row.lastActivityDate),
      })),
      total,
    };
  }

  /** How many findings are open: the figure of the IT Admin dashboard (Q-84). */
  countOpen(tx?: DbTx): Promise<number> {
    return (tx ?? this.prisma).usageNoAssignmentFinding.count({ where: { status: 'OPEN' } });
  }
}
