import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import { fromDateColumn, type BusinessDate } from '../../../../core/business-date';
import {
  OPEN_GRANT_TASK_STATUSES,
  type GrantCompletion,
  type GrantExecution,
  type GrantedSeatOfRequest,
  type K1AnnualChainDetail,
  type K1AnnualHolderSegment,
  type K1AnnualHolderTimeline,
  type K1AnnualPaidSeat,
  type PoolTopUpPurchase,
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
  /** The last completed grant task of each request: who completed it and when. */
  async grantCompletionsOf(requestIds: readonly string[], tx?: DbTx): Promise<Map<string, GrantCompletion>> {
    if (requestIds.length === 0) return new Map();
    const rows = await (tx ?? this.prisma).provisioningTask.findMany({
      where: {
        kind: 'GRANT',
        status: 'COMPLETED',
        requestId: { in: [...new Set(requestIds)] },
        completedAt: { not: null },
      },
      select: { requestId: true, completedByAppUserId: true, completedAt: true },
      orderBy: [{ requestId: 'asc' }, { completedAt: 'desc' }, { id: 'desc' }],
      distinct: ['requestId'],
    });

    return new Map(
      rows.flatMap((row) =>
        row.requestId === null || row.completedAt === null
          ? []
          : [[row.requestId, { completedByAppUserId: row.completedByAppUserId, completedAt: row.completedAt }]],
      ),
    );
  }

  /** Completed `POOL_TOP_UP` grant tasks for `requestId`, ordered deterministically. */
  async completedPoolTopUpPurchasesOf(requestId: string, tx?: DbTx): Promise<PoolTopUpPurchase[]> {
    const rows = await (tx ?? this.prisma).provisioningTask.findMany({
      where: {
        kind: 'GRANT',
        status: 'COMPLETED',
        requestId,
        purchaseKind: 'POOL_TOP_UP',
      },
      select: { id: true, purchasedAt: true },
      orderBy: [{ purchasedAt: 'asc' }, { id: 'asc' }],
    });

    return rows.map((row) => ({ taskId: row.id, purchasedAt: row.purchasedAt }));
  }

  /**
   * The grant tasks of these requests that were not cancelled, with the person each one is for, the newest first: one statement whatever
   * the number of requests. What the queue of grants reads to say where the grant of each person stands.
   */
  async grantExecutionsOf(requestIds: readonly string[], tx?: DbTx): Promise<GrantExecution[]> {
    if (requestIds.length === 0) return [];
    const rows = await (tx ?? this.prisma).provisioningTask.findMany({
      where: { kind: 'GRANT', status: { not: 'CANCELLED' }, requestId: { in: [...new Set(requestIds)] } },
      select: {
        id: true,
        requestId: true,
        status: true,
        channel: true,
        failureReason: true,
        claimedByAppUserId: true,
        createdAt: true,
        assignment: { select: { employeeId: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });

    return rows.flatMap((row) =>
      row.requestId === null
        ? []
        : [
            {
              requestId: row.requestId,
              employeeId: row.assignment.employeeId,
              taskId: row.id,
              status: row.status,
              channel: row.channel,
              failureReason: row.failureReason,
              claimedByAppUserId: row.claimedByAppUserId,
              createdAt: row.createdAt,
            },
          ],
    );
  }

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

  /** Resolves root assignment and downstream replacement/handover segments for a K1 annual request. */
  async k1AnnualHolderTimeline(
    requestId: string,
    renewedAssignmentId: string | null,
    tx?: DbTx,
  ): Promise<K1AnnualHolderTimeline | null> {
    const rows = await (tx ?? this.prisma).$queryRaw<(TimelineRow & { true_root_id: string | null })[]>`
      WITH RECURSIVE "start" AS (
        SELECT a."id"
          FROM "license_assignments" a
          LEFT JOIN "provisioning_tasks" t
                 ON t."assignment_id" = a."id" AND t."kind" = 'GRANT'
                AND t."status" NOT IN ('CANCELLED', 'CLOSED_FAILED')
         WHERE a."failed_at" IS NULL AND a."cancelled_at" IS NULL
           AND (t."request_id" = ${requestId}::uuid
                OR (${renewedAssignmentId}::uuid IS NOT NULL AND a."predecessor_id" = ${renewedAssignmentId}::uuid))
         ORDER BY a."valid_from" ASC, a."id" ASC LIMIT 1
      ),
      "anc" AS (
        SELECT a."id", a."predecessor_id", a."replaces_assignment_id", 0 AS "depth"
          FROM "license_assignments" a JOIN "start" s ON s."id" = a."id"
        UNION
        SELECT p."id", p."predecessor_id", p."replaces_assignment_id", anc."depth" + 1
          FROM "license_assignments" p
          JOIN "anc" ON p."id" = anc."predecessor_id" OR p."id" = anc."replaces_assignment_id"
         WHERE anc."depth" < ${MAX_CHAIN_DEPTH}
      ),
      "true_root" AS (
        SELECT "id" FROM "anc" ORDER BY "depth" DESC, "id" ASC LIMIT 1
      ),
      "chain" AS (
        SELECT a."id", a."predecessor_id", a."replaces_assignment_id", a."owning_department_id",
               a."billing_anchor_on", a."valid_until", a."valid_from", 0 AS "depth"
          FROM "license_assignments" a JOIN "start" s ON s."id" = a."id"
        UNION ALL
        SELECT n."id", n."predecessor_id", n."replaces_assignment_id", n."owning_department_id",
               n."billing_anchor_on", n."valid_until", n."valid_from", c."depth" + 1
          FROM "license_assignments" n
          JOIN "chain" c ON n."predecessor_id" = c."id" OR n."replaces_assignment_id" = c."id"
         WHERE n."failed_at" IS NULL AND n."cancelled_at" IS NULL AND c."depth" < ${MAX_CHAIN_DEPTH}
      )
      SELECT DISTINCT ON (c."depth", c."id")
             tr."id"::text AS "true_root_id",
             c."id"::text AS "assignment_id", t."request_id"::text AS "request_id",
             c."owning_department_id"::text AS "owning_department_id",
             to_char(c."billing_anchor_on", 'YYYY-MM-DD') AS "billing_anchor_on",
             to_char(c."valid_until", 'YYYY-MM-DD') AS "ended_on",
             c."replaces_assignment_id"::text AS "replaced_from_assignment_id"
        FROM "chain" c
        CROSS JOIN "true_root" tr
        LEFT JOIN "provisioning_tasks" t
               ON t."assignment_id" = c."id" AND t."kind" = 'GRANT'
              AND t."status" NOT IN ('CANCELLED', 'CLOSED_FAILED')
       ORDER BY c."depth" ASC, c."id" ASC`;
    if (rows.length === 0) return null;
    const segments = rows.map(toHolderSegment);

    return { rootAssignmentId: rows[0].true_root_id ?? segments[0].assignmentId, segments };
  }

  /** Maps each request id to its top-most ancestor assignment id for K1 Tier 0 locking. */
  async k1AnnualRootsOfRequests(roots: SeatRootsOfRequests, tx?: DbTx): Promise<Map<string, string>> {
    const details = await this.k1AnnualChainDetails(roots, tx);

    return new Map([...details].map(([reqId, detail]) => [reqId, detail.rootAssignmentId]));
  }

  /** Resolves root assignment id plus lineage assignments and GRANT request ids for K1 annual requests (`F-7`). */
  async k1AnnualChainDetails(roots: SeatRootsOfRequests, tx?: DbTx): Promise<Map<string, K1AnnualChainDetail>> {
    if (roots.grantRequestIds.length === 0 && roots.namedRoots.length === 0) return new Map();
    const rows = await this.queryK1ChainDetailRows(roots, tx);

    return new Map(
      rows.map((row) => [
        row.request_id,
        {
          rootAssignmentId: row.root_id,
          chainAssignmentIds: row.assignment_ids,
          chainRequestIds: [...new Set([row.request_id, ...row.grant_request_ids])],
        },
      ]),
    );
  }

  private queryK1ChainDetailRows(roots: SeatRootsOfRequests, tx?: DbTx) {
    const grantIds = [...roots.grantRequestIds];
    const namedRequests = roots.namedRoots.map((root) => root.requestId);
    const namedAssignments = roots.namedRoots.map((root) => root.assignmentId);

    return (tx ?? this.prisma).$queryRaw<
      { request_id: string; root_id: string; assignment_ids: string[]; grant_request_ids: string[] }[]
    >`
      WITH RECURSIVE "seed" AS (
        SELECT t."request_id", t."assignment_id"
          FROM "provisioning_tasks" t
          JOIN "license_assignments" a ON a."id" = t."assignment_id"
         WHERE t."kind" = 'GRANT' AND t."request_id" = ANY(${grantIds}::uuid[])
           AND t."status" NOT IN ('CANCELLED', 'CLOSED_FAILED')
           AND a."failed_at" IS NULL AND a."cancelled_at" IS NULL
        UNION ALL
        SELECT n."request_id", n."assignment_id"
          FROM unnest(${namedRequests}::uuid[], ${namedAssignments}::uuid[]) AS n("request_id", "assignment_id")
          JOIN "license_assignments" a ON a."id" = n."assignment_id"
         WHERE a."failed_at" IS NULL AND a."cancelled_at" IS NULL
      ),
      "anc" AS (
        SELECT s."request_id", a."id", a."predecessor_id", a."replaces_assignment_id", a."valid_from", 0 AS "depth"
          FROM "seed" s JOIN "license_assignments" a ON a."id" = s."assignment_id"
        UNION
        SELECT c."request_id", p."id", p."predecessor_id", p."replaces_assignment_id", p."valid_from", c."depth" + 1
          FROM "anc" c
          JOIN "license_assignments" p ON p."id" = c."predecessor_id" OR p."id" = c."replaces_assignment_id"
         WHERE c."depth" < ${MAX_CHAIN_DEPTH}
      ),
      "roots" AS (
        SELECT DISTINCT ON ("request_id") "request_id", "id" AS "root_id"
          FROM "anc"
         ORDER BY "request_id", "depth" DESC, "valid_from" ASC, "id" ASC
      ),
      "down" AS (
        SELECT r."request_id", r."root_id", r."root_id" AS "id", 0 AS "depth"
          FROM "roots" r
        UNION
        SELECT d."request_id", d."root_id", n."id", d."depth" + 1
          FROM "down" d
          JOIN "license_assignments" n ON n."predecessor_id" = d."id" OR n."replaces_assignment_id" = d."id"
         WHERE n."failed_at" IS NULL AND n."cancelled_at" IS NULL AND d."depth" < ${MAX_CHAIN_DEPTH}
      )
      SELECT d."request_id"::text AS "request_id",
             d."root_id"::text AS "root_id",
             ARRAY_AGG(DISTINCT d."id"::text) AS "assignment_ids",
             COALESCE(
               ARRAY_AGG(DISTINCT pt."request_id"::text) FILTER (WHERE pt."request_id" IS NOT NULL),
               ARRAY[]::text[]
             ) AS "grant_request_ids"
        FROM "down" d
        LEFT JOIN "provisioning_tasks" pt
               ON pt."assignment_id" = d."id" AND pt."kind" = 'GRANT'
              AND pt."status" NOT IN ('CANCELLED', 'CLOSED_FAILED')
       GROUP BY d."request_id", d."root_id"`;
  }

  /** Closed (not transfer-replaced) 12-month K1 seats whose `valid_until <= onDate`, for F9(c) year-start inclusion. */
  async listK1AnnualPaidSeatsOn(
    roots: SeatRootsOfRequests,
    onDate: BusinessDate,
    tx?: DbTx,
  ): Promise<K1AnnualPaidSeat[]> {
    if (roots.grantRequestIds.length === 0 && roots.namedRoots.length === 0) return [];
    const grantIds = [...roots.grantRequestIds];
    const namedRequests = roots.namedRoots.map((root) => root.requestId);
    const namedAssignments = roots.namedRoots.map((root) => root.assignmentId);
    const rows = await (tx ?? this.prisma).$queryRaw<(HeldSeatRow & { billing_anchor_on: string })[]>`
      WITH RECURSIVE "roots" AS (
        SELECT t."request_id", t."assignment_id" FROM "provisioning_tasks" t
         WHERE t."kind" = 'GRANT' AND t."request_id" = ANY(${grantIds}::uuid[])
           AND t."status" NOT IN ('CANCELLED', 'CLOSED_FAILED')
        UNION
        SELECT n."request_id", n."assignment_id"
          FROM unnest(${namedRequests}::uuid[], ${namedAssignments}::uuid[]) AS n("request_id", "assignment_id")
      ),
      "chain" AS (
        SELECT r."request_id", r."assignment_id" AS "root_id", a."id", 0 AS "depth", ARRAY[]::uuid[] AS "later"
          FROM "roots" r JOIN "license_assignments" a ON a."id" = r."assignment_id"
         WHERE a."failed_at" IS NULL AND a."cancelled_at" IS NULL
        UNION ALL
        SELECT c."request_id", c."root_id", n."id", c."depth" + 1, c."later" || n."id"
          FROM "chain" c JOIN "license_assignments" n ON n."predecessor_id" = c."id"
         WHERE n."failed_at" IS NULL AND n."cancelled_at" IS NULL AND c."depth" < ${MAX_CHAIN_DEPTH}
      ),
      "tails" AS (
        SELECT DISTINCT ON (c."request_id", c."root_id")
               c."request_id", c."root_id", c."later", a."id" AS "assignment_id", a."employee_id", a."plan_id",
               a."owning_department_id", a."expected_end_date", a."valid_until",
               a."personal_commitment_months", a."billing_anchor_on"
          FROM "chain" c JOIN "license_assignments" a ON a."id" = c."id"
         ORDER BY c."request_id", c."root_id", c."depth" DESC, a."valid_from" DESC, a."id" DESC
      )
      SELECT t."request_id", t."root_id", t."later", t."assignment_id", t."employee_id", t."plan_id",
             t."owning_department_id", t."expected_end_date", t."valid_until",
             to_char(t."billing_anchor_on", 'YYYY-MM-DD') AS "billing_anchor_on"
        FROM "tails" t
       WHERE t."personal_commitment_months" = 12 AND t."billing_anchor_on" IS NOT NULL
         AND t."valid_until" IS NOT NULL AND t."valid_until" <= ${onDate}::date
         AND NOT EXISTS (
           SELECT 1 FROM "license_assignments" rep
            WHERE rep."replaces_assignment_id" = t."assignment_id"
              AND rep."failed_at" IS NULL AND rep."cancelled_at" IS NULL
         )
       ORDER BY t."request_id", t."root_id"`;

    return rows.map(toPaidSeat);
  }
}

interface TimelineRow {
  assignment_id: string;
  request_id: string | null;
  owning_department_id: string | null;
  billing_anchor_on: string | null;
  ended_on: string | null;
  replaced_from_assignment_id: string | null;
}

const toHolderSegment = (row: TimelineRow): K1AnnualHolderSegment => ({
  assignmentId: row.assignment_id,
  requestId: row.request_id,
  owningDepartmentId: row.owning_department_id,
  billingAnchorOn: row.billing_anchor_on,
  endedOn: row.ended_on,
  replacedFromAssignmentId: row.replaced_from_assignment_id,
});

const toPaidSeat = (row: HeldSeatRow & { billing_anchor_on: string }): K1AnnualPaidSeat => ({
  requestId: row.request_id,
  rootAssignmentId: row.root_id,
  laterAssignmentIds: row.later,
  assignmentId: row.assignment_id,
  employeeId: row.employee_id,
  planId: row.plan_id,
  owningDepartmentId: row.owning_department_id,
  expectedEndDate: row.expected_end_date ? fromDateColumn(row.expected_end_date) : null,
  validUntil: row.valid_until ? fromDateColumn(row.valid_until) : null,
  personalCommitmentMonths: 12,
  billingAnchorOn: row.billing_anchor_on,
});
