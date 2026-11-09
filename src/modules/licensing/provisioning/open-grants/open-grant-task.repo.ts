import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import { fromDateColumn, type BusinessDate } from '../../../../core/business-date';
import {
  OPEN_GRANT_TASK_STATUSES,
  type GrantedSeatOfRequest,
  type SeatRootsOfRequests,
} from '../../public/licensing-open-grants.types';

/** A chain is never this long; the bound only keeps a walk finite if the data were ever wrong. */
const MAX_CHAIN_DEPTH = 64;

interface HeldSeatRow {
  request_id: string;
  root_id: string;
  later: string[];
  assignment_id: string;
  employee_id: string;
  plan_id: string;
  owning_department_id: string | null;
  expected_end_date: Date | null;
  valid_until: Date | null;
}

export interface OpenGrantTaskRow {
  taskId: string;
  status: (typeof OPEN_GRANT_TASK_STATUSES)[number];
  requestId: string | null;
  assignmentId: string;
  planId: string;
  createdAt: Date;
}

/**
 * The grants of a person that are not finished: a read of the tasks together with the assignment each is for, which no write goes
 * through (the writers are `AssignmentRepo` and `ProvisioningTaskRepo`). A page and its total are two statements, however many tasks.
 * It also reads the seats requests stand for along the chains of their records, for the commitment of 01/01.
 */
@Injectable()
export class OpenGrantTaskRepo {
  constructor(private readonly prisma: PrismaService) {}

  /** The open grant tasks of the person, oldest first, and how many there are in all. */
  async pageOf(
    employeeId: string,
    page: { skip: number; take: number },
    tx?: DbTx,
  ): Promise<{ items: OpenGrantTaskRow[]; total: number }> {
    const db = tx ?? this.prisma;
    const where = {
      kind: 'GRANT' as const,
      status: { in: [...OPEN_GRANT_TASK_STATUSES] },
      assignment: { employeeId },
    };
    const rows = await db.provisioningTask.findMany({
      where,
      select: {
        id: true,
        status: true,
        requestId: true,
        assignmentId: true,
        createdAt: true,
        assignment: { select: { planId: true } },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      skip: page.skip,
      take: page.take,
    });
    const total = await db.provisioningTask.count({ where });

    return {
      items: rows.map((row) => ({
        taskId: row.id,
        status: row.status as OpenGrantTaskRow['status'],
        requestId: row.requestId,
        assignmentId: row.assignmentId,
        planId: row.assignment.planId,
        createdAt: row.createdAt,
      })),
      total,
    };
  }

  /**
   * The seats of these requests that are still held on `onDate`, each read along its chain. The roots are the records of the grants of
   * `grantRequestIds` (not failed, not cancelled) and the records `namedRoots` names; from each, the records that follow it (`predecessor_id`,
   * neither failed nor cancelled) are walked to the last one, which is the record that runs now. The seat counts when that record is not
   * closed by the day (a period that closes after it, or none) and not expected to end before it. A request for a group has one for each
   * person granted. Read with the request rows locked by the caller; nothing here changes a seat. One statement.
   */
  async heldSeatsOfRequests(
    roots: SeatRootsOfRequests,
    onDate: BusinessDate,
    tx?: DbTx,
  ): Promise<GrantedSeatOfRequest[]> {
    if (roots.grantRequestIds.length === 0 && roots.namedRoots.length === 0) return [];
    const grantIds = [...roots.grantRequestIds];
    const namedRequests = roots.namedRoots.map((root) => root.requestId);
    const namedAssignments = roots.namedRoots.map((root) => root.assignmentId);
    const rows = await (tx ?? this.prisma).$queryRaw<HeldSeatRow[]>`
      WITH RECURSIVE "roots" AS (
        SELECT t."request_id", t."assignment_id"
          FROM "provisioning_tasks" t
         WHERE t."kind" = 'GRANT'
           AND t."request_id" = ANY(${grantIds}::uuid[])
           AND t."status" NOT IN ('CANCELLED', 'CLOSED_FAILED')
        UNION
        SELECT n."request_id", n."assignment_id"
          FROM unnest(${namedRequests}::uuid[], ${namedAssignments}::uuid[]) AS n("request_id", "assignment_id")
      ),
      "chain" AS (
        SELECT r."request_id", r."assignment_id" AS "root_id", a."id", 0 AS "depth", ARRAY[]::uuid[] AS "later"
          FROM "roots" r
          JOIN "license_assignments" a ON a."id" = r."assignment_id"
         WHERE a."failed_at" IS NULL AND a."cancelled_at" IS NULL
        UNION ALL
        SELECT c."request_id", c."root_id", n."id", c."depth" + 1, c."later" || n."id"
          FROM "chain" c
          JOIN "license_assignments" n ON n."predecessor_id" = c."id"
         WHERE n."failed_at" IS NULL AND n."cancelled_at" IS NULL AND c."depth" < ${MAX_CHAIN_DEPTH}
      ),
      "tails" AS (
        SELECT DISTINCT ON (c."request_id", c."root_id")
               c."request_id", c."root_id", c."later", a."id" AS "assignment_id", a."employee_id", a."plan_id",
               a."owning_department_id", a."expected_end_date", a."valid_until"
          FROM "chain" c
          JOIN "license_assignments" a ON a."id" = c."id"
         ORDER BY c."request_id", c."root_id", c."depth" DESC, a."valid_from" DESC, a."id" DESC
      )
      SELECT * FROM "tails"
       WHERE ("valid_until" IS NULL OR "valid_until" > ${onDate}::date)
         AND ("expected_end_date" IS NULL OR "expected_end_date" >= ${onDate}::date)
       ORDER BY "request_id", "root_id"`;

    return rows.map((row) => ({
      requestId: row.request_id,
      rootAssignmentId: row.root_id,
      laterAssignmentIds: row.later,
      assignmentId: row.assignment_id,
      employeeId: row.employee_id,
      planId: row.plan_id,
      owningDepartmentId: row.owning_department_id,
      expectedEndDate: row.expected_end_date ? fromDateColumn(row.expected_end_date) : null,
      validUntil: row.valid_until ? fromDateColumn(row.valid_until) : null,
    }));
  }
}
