import { Injectable } from '@nestjs/common';
import { fromDateColumn, toDateColumn, type BusinessDate } from '../../../core/business-date';
import type { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { RevocationTaskStanding, RuleSeat, RuleSeatRevocation } from '../public/licensing-ghost-seat.types';
import type { RevocationSource } from '../public/licensing.types';

/** What a rule reads of an open seat: its plan and, of its revocations not dropped, the reasons that still stand. */
const OPEN_SEAT_COLUMNS = {
  id: true,
  kind: true,
  planId: true,
  subscriptionId: true,
  employeeId: true,
  owningDepartmentId: true,
  expectedEndDate: true,
  validUntil: true,
  plan: { select: { applicationId: true, provisioningType: true, pricingModel: true } },
  provisioningTasks: {
    where: { kind: 'REVOKE', status: { notIn: ['CLOSED_FAILED', 'CANCELLED'] } },
    select: {
      id: true,
      status: true,
      accessState: true,
      reasons: { where: { withdrawnAt: null }, select: { source: true } },
    },
  },
} satisfies Prisma.LicenseAssignmentSelect;

/**
 * What the rules of wasted seats read of the open seats and of their revocation tasks: a fixed number of statements (the seats, the
 * root of each chain), however many seats there are. The seats are the ones that hold a seat on the day: begun, not ended, not failed,
 * not cancelled; the reasons read are the ones that still stand.
 */
@Injectable()
export class RuleSeatsRepo {
  constructor(private readonly prisma: PrismaService) {}

  async listOpen(
    filter: { asOf: BusinessDate; applicationIds?: readonly string[]; employeeIds?: readonly string[] },
    tx?: DbTx,
  ): Promise<RuleSeat[]> {
    const db = tx ?? this.prisma;
    const day = toDateColumn(filter.asOf);
    const rows = await db.licenseAssignment.findMany({
      where: {
        failedAt: null,
        cancelledAt: null,
        // A link of a chain that begins later (a renewal carried ahead) is not held yet: one chain is judged once.
        validFrom: { lte: day },
        OR: [{ validUntil: null }, { validUntil: { gt: day } }],
        ...(filter.employeeIds ? { employeeId: { in: [...filter.employeeIds] } } : {}),
        ...(filter.applicationIds ? { plan: { applicationId: { in: [...filter.applicationIds] } } } : {}),
      },
      select: OPEN_SEAT_COLUMNS,
      orderBy: { id: 'asc' },
    });
    const roots = await this.rootsOf(
      db,
      rows.map((row) => row.id),
    );

    return rows.map((row) => {
      const task = row.provisioningTasks.find((candidate) => candidate.status !== 'COMPLETED');
      const terminating = row.provisioningTasks.some(
        (candidate) => candidate.status === 'COMPLETED' && candidate.accessState === 'UNTIL_PAID_END',
      );
      const liveRevocation: RuleSeatRevocation | null = task
        ? { taskId: task.id, status: task.status, sources: [...new Set(task.reasons.map((reason) => reason.source))] }
        : null;

      return {
        assignmentId: row.id,
        chainRootId: roots.get(row.id) ?? row.id,
        kind: row.kind,
        planId: row.planId,
        applicationId: row.plan.applicationId,
        subscriptionId: row.subscriptionId,
        owningDepartmentId: row.owningDepartmentId,
        provisioningType: row.plan.provisioningType,
        pricingModel: row.plan.pricingModel,
        employeeId: row.employeeId,
        expectedEndDate: row.expectedEndDate ? fromDateColumn(row.expectedEndDate) : null,
        liveRevocation,
        terminatingUntil: terminating && row.validUntil ? fromDateColumn(row.validUntil) : null,
      };
    });
  }

  /** The first assignment of the chain each of these belongs to (itself when it has no predecessor), in one statement. */
  private async rootsOf(db: DbTx | PrismaService, ids: readonly string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const rows = await db.$queryRaw<{ seat_id: string; root_id: string }[]>`
      WITH RECURSIVE walk AS (
        SELECT a."id" AS seat_id, a."id" AS current_id, a."predecessor_id" AS next_id
          FROM "license_assignments" a
         WHERE a."id" = ANY(${[...ids]}::uuid[])
        UNION ALL
        SELECT w.seat_id, p."id", p."predecessor_id"
          FROM walk w JOIN "license_assignments" p ON p."id" = w.next_id
      )
      SELECT seat_id, current_id AS root_id FROM walk WHERE next_id IS NULL`;

    return new Map(rows.map((row) => [row.seat_id, row.root_id]));
  }

  /** How each of these revocation tasks stands now, and which sources and references asked for it, in one statement. */
  async taskStandings(taskIds: readonly string[], tx?: DbTx): Promise<Map<string, RevocationTaskStanding>> {
    if (taskIds.length === 0) return new Map();
    const rows = await (tx ?? this.prisma).provisioningTask.findMany({
      where: { id: { in: [...taskIds] }, kind: 'REVOKE' },
      // A reason its source took back no longer asked for the task: a recommendation it named is not what the task answered.
      select: {
        id: true,
        status: true,
        reasons: { where: { withdrawnAt: null }, select: { source: true, referenceId: true } },
      },
    });

    return new Map(
      rows.map((row) => [
        row.id,
        {
          status: row.status,
          referencedSources: [...new Set<RevocationSource>(row.reasons.map((reason) => reason.source))],
          referencedIds: row.reasons.flatMap((reason) => (reason.referenceId ? [reason.referenceId] : [])),
        },
      ]),
    );
  }
}
