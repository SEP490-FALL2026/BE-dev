import { Injectable } from '@nestjs/common';
import { fromDateColumn, type BusinessDate } from '../../../../core/business-date';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import type { AssignmentFacts } from '../../public/licensing-renewal.types';

/**
 * What the return and the renewal of a seat read of an assignment together with its tasks and its chain: a read of two tables
 * that no write goes through (the writers are `AssignmentRepo` and `ProvisioningTaskRepo`). A fixed number of statements.
 */
@Injectable()
export class AssignmentFactsRepo {
  constructor(private readonly prisma: PrismaService) {}

  async find(assignmentId: string, tx?: DbTx): Promise<AssignmentFacts | null> {
    const db = tx ?? this.prisma;
    const row = await db.licenseAssignment.findUnique({
      where: { id: assignmentId },
      select: {
        id: true,
        employeeId: true,
        planId: true,
        subscriptionId: true,
        kind: true,
        source: true,
        validFrom: true,
        validUntil: true,
        expectedEndDate: true,
        failedAt: true,
        cancelledAt: true,
        provisioningTasks: { select: { kind: true, status: true, requestId: true }, orderBy: { createdAt: 'asc' } },
        successors: { select: { id: true }, take: 1 },
      },
    });
    if (!row) return null;

    // A grant task can follow one that ended (completed, closed as failed or cancelled, F07): the one that counts is the one that
    // is not over, and otherwise the latest.
    const grants = row.provisioningTasks.filter((task) => task.kind === 'GRANT');
    const grant =
      grants.find((task) => task.status !== 'CLOSED_FAILED' && task.status !== 'CANCELLED') ??
      grants[grants.length - 1];

    return {
      assignmentId: row.id,
      employeeId: row.employeeId,
      planId: row.planId,
      subscriptionId: row.subscriptionId,
      kind: row.kind,
      source: row.source,
      effectiveFrom: fromDateColumn(row.validFrom),
      validUntil: row.validUntil ? fromDateColumn(row.validUntil) : null,
      expectedEndDate: row.expectedEndDate ? fromDateColumn(row.expectedEndDate) : null,
      open: row.validUntil === null && row.failedAt === null && row.cancelledAt === null,
      chainStartsOn: await this.chainStart(assignmentId, db),
      grant: grant === undefined ? 'NONE' : grant.status === 'COMPLETED' ? 'COMPLETED' : 'NOT_COMPLETED',
      grantRequestId: grant?.requestId ?? null,
      revocationLive: row.provisioningTasks.some(
        (task) => task.kind === 'REVOKE' && task.status !== 'CLOSED_FAILED' && task.status !== 'CANCELLED',
      ),
      hasSuccessor: row.successors.length > 0,
    };
  }

  /**
   * The first day of the records that follow one another without a break up to this one: each names the one before it and
   * begins the day that one ended. A record that follows none, or whose predecessor ended earlier, starts its own chain.
   */
  private async chainStart(assignmentId: string, db: DbTx | PrismaService): Promise<BusinessDate> {
    const rows = await db.$queryRaw<{ starts_on: string }[]>`
      WITH RECURSIVE chain AS (
        SELECT a.id, a.predecessor_id, a.valid_from FROM license_assignments a WHERE a.id = ${assignmentId}::uuid
        UNION ALL
        SELECT p.id, p.predecessor_id, p.valid_from
          FROM license_assignments p JOIN chain c ON p.id = c.predecessor_id AND p.valid_until = c.valid_from
      )
      SELECT to_char(min(valid_from), 'YYYY-MM-DD') AS starts_on FROM chain`;

    return rows[0].starts_on;
  }
}
