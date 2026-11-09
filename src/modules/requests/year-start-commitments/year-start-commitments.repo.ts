import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { fromDateColumn, type BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { YEAR_START_REQUEST_STATES } from './year-start-commitments.policy';

/** A request the pass may commit for, as it stands now (its row is locked until the transaction ends). */
export interface YearStartCandidate {
  id: string;
  type: 'GRANT' | 'SERVICE_ACCOUNT' | 'GROUP_GRANT' | 'RENEWAL';
  state: (typeof YEAR_START_REQUEST_STATES)[number];
  planId: string;
  departmentId: string;
  /** The day the right the request is for ends, when it names one (a single request; a group names it for each person). */
  expectedEndDate: BusinessDate | null;
}

interface CandidateRow {
  id: string;
  type: YearStartCandidate['type'];
  state: YearStartCandidate['state'];
  plan_id: string;
  department_id: string;
  expected_end_date: Date | null;
}

/**
 * The reads and writes of the pass of 01/01 on the requests side: the mark of the pass (`year_start_commitment_runs`) and the requests it may
 * commit for. It is the only code that writes the mark. The requests it reads are locked `FOR UPDATE` in order of id, the first lock of the
 * order of this context (the request, then the year, `budgets.extension-points.ts`), so a request that is withdrawn, refused or granted at
 * the same moment is either read in its new state or waits for the pass.
 */
@Injectable()
export class YearStartCommitmentsRepo {
  /**
   * Takes the lock of the pass of the organization and the year until the transaction ends, if nobody holds it: false when another
   * instance is in a step of the same pass, which this one then leaves to it. It is the first lock of every step of the pass.
   */
  async tryLockPass(tx: DbTx, organizationId: string, year: number): Promise<boolean> {
    const key = `year-start-commitments:${organizationId}:${year}`;
    const rows = await tx.$queryRaw<Array<{ locked: boolean }>>`
      SELECT pg_try_advisory_xact_lock(hashtextextended(${key}, 0)) AS "locked"`;

    return rows[0]?.locked === true;
  }

  /** The mark of the pass of the year: null when none was begun, else whether it is complete and the last request it went through. */
  async findRun(
    tx: DbTx,
    organizationId: string,
    year: number,
  ): Promise<{ completed: boolean; resumeAfterId: string | null } | null> {
    const row = await tx.yearStartCommitmentRun.findUnique({
      where: { organizationId_year: { organizationId, year } },
      select: { completedAt: true, resumeAfterId: true },
    });

    return row ? { completed: row.completedAt !== null, resumeAfterId: row.resumeAfterId } : null;
  }

  /** The years before `year` the organization has a mark of, newest first: one that has none is new, and a gap is a year no pass was made for. */
  async earlierRunYears(tx: DbTx, organizationId: string, year: number): Promise<number[]> {
    const rows = await tx.yearStartCommitmentRun.findMany({
      where: { organizationId, year: { lt: year } },
      select: { year: true },
      orderBy: { year: 'desc' },
    });

    return rows.map((row) => row.year);
  }

  /** When the first request of the organization was sent: null when it has sent none. */
  async firstRequestAt(tx: DbTx, organizationId: string): Promise<Date | null> {
    const first = await tx.accessRequest.findFirst({
      where: { organizationId, submittedAt: { not: null } },
      select: { submittedAt: true },
      orderBy: { submittedAt: 'asc' },
    });

    return first?.submittedAt ?? null;
  }

  /** Marks the year done with nothing made, for an organization that has no earlier pass and no request of an earlier year. */
  async markBaseline(tx: DbTx, organizationId: string, year: number, now: Date): Promise<void> {
    await tx.$executeRaw`
      INSERT INTO "year_start_commitment_runs" ("organization_id", "year", "started_at", "completed_at", "run_count")
      VALUES (${organizationId}::uuid, ${year}, ${now}, ${now}, 1)
      ON CONFLICT ("organization_id", "year") DO NOTHING`;
  }

  /**
   * Begins a pass: makes the mark, or counts another pass on a mark that is still open. Returns false when the mark is complete already (a pass
   * that finished while this one was deciding to begin), in which case nothing is to be done.
   */
  async begin(tx: DbTx, organizationId: string, year: number, now: Date): Promise<boolean> {
    const rows = await tx.$queryRaw<Array<{ run_count: number }>>`
      INSERT INTO "year_start_commitment_runs" ("organization_id", "year", "started_at")
      VALUES (${organizationId}::uuid, ${year}, ${now})
      ON CONFLICT ("organization_id", "year")
      DO UPDATE SET "run_count" = "year_start_commitment_runs"."run_count" + 1
      WHERE "year_start_commitment_runs"."completed_at" IS NULL
      RETURNING "run_count"`;

    return rows.length > 0;
  }

  /**
   * Records, in the transaction of a batch, the last request the batch went through and what it made and left out: the next batch, of this
   * pass or of one after a failure, begins after it, so no request is judged twice and the counts are those of the whole year.
   */
  async advance(
    tx: DbTx,
    input: { organizationId: string; year: number; lastId: string; created: number; skipped: number },
  ): Promise<void> {
    await tx.$executeRaw`
      UPDATE "year_start_commitment_runs"
         SET "resume_after_id" = ${input.lastId}::uuid,
             "created_count" = "created_count" + ${input.created},
             "skipped_count" = "skipped_count" + ${input.skipped}
       WHERE "organization_id" = ${input.organizationId}::uuid AND "year" = ${input.year} AND "completed_at" IS NULL`;
  }

  /** Completes the mark, once. Returns the passes counted and what the whole year made and left out, or null when it was complete already. */
  async complete(
    tx: DbTx,
    input: { organizationId: string; year: number; now: Date },
  ): Promise<{ runCount: number; created: number; skipped: number } | null> {
    const rows = await tx.$queryRaw<Array<{ run_count: number; created_count: number; skipped_count: number }>>`
      UPDATE "year_start_commitment_runs"
         SET "completed_at" = ${input.now}
       WHERE "organization_id" = ${input.organizationId}::uuid AND "year" = ${input.year} AND "completed_at" IS NULL
      RETURNING "run_count", "created_count", "skipped_count"`;
    const [row] = rows;

    return row ? { runCount: row.run_count, created: row.created_count, skipped: row.skipped_count } : null;
  }

  /**
   * The next requests after `afterId`, in order of id, that could hold a commitment on 01/01 — a paid request (one person, a service account,
   * a group, or the renewal of a right, whose approval made the record that follows the old one) that was approved as spend and is neither
   * refused, withdrawn, failed nor cancelled — with their rows locked. Which of them are paid, of which kind of provisioning and with what seats
   * is for the caller to judge.
   */
  async lockBatch(
    tx: DbTx,
    organizationId: string,
    afterId: string | null,
    limit: number,
  ): Promise<YearStartCandidate[]> {
    const after = afterId === null ? Prisma.empty : Prisma.sql`AND r."id" > ${afterId}::uuid`;
    const rows = await tx.$queryRaw<CandidateRow[]>`
      SELECT r."id", r."type"::text AS "type", r."state"::text AS "state", r."plan_id", r."department_id", r."expected_end_date"
        FROM "access_requests" r
       WHERE r."organization_id" = ${organizationId}::uuid
         AND r."type" IN ('GRANT', 'SERVICE_ACCOUNT', 'GROUP_GRANT', 'RENEWAL')
         AND r."branch" IN ('PAID_IN_CATALOG', 'NEW_SOFTWARE')
         AND r."state"::text IN (${Prisma.join([...YEAR_START_REQUEST_STATES])})
         AND r."plan_id" IS NOT NULL ${after}
       ORDER BY r."id"
       LIMIT ${limit}
         FOR UPDATE OF r`;

    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      state: row.state,
      planId: row.plan_id,
      departmentId: row.department_id,
      expectedEndDate: row.expected_end_date ? fromDateColumn(row.expected_end_date) : null,
    }));
  }

  /**
   * The seats of the candidates that nobody has been given yet: the one person of a request that waits for the IT Admin, and the people of a
   * group whose line is approved as spend and not yet carried out. Each is a seat the company will pay for once granted, so it counts on 01/01
   * as one that runs (`BR-MF1-09e`). A request that is being carried out or is done has its seats in the grants, not here. A renewal has none:
   * its seat is the record that follows the renewed one, and one approved that no record follows yet waits for it.
   */
  async unclaimedSeats(
    tx: DbTx,
    candidates: readonly YearStartCandidate[],
  ): Promise<Map<string, { expectedEndDate: BusinessDate | null }[]>> {
    const seats = new Map<string, { expectedEndDate: BusinessDate | null }[]>();
    const add = (requestId: string, expectedEndDate: BusinessDate | null): void => {
      seats.set(requestId, [...(seats.get(requestId) ?? []), { expectedEndDate }]);
    };
    for (const candidate of candidates) {
      const single = candidate.type === 'GRANT' || candidate.type === 'SERVICE_ACCOUNT';
      if (single && candidate.state === 'AWAITING_EXECUTION') {
        add(candidate.id, candidate.expectedEndDate);
      }
    }
    const groupIds = candidates
      .filter((candidate) => candidate.type === 'GROUP_GRANT')
      .map((candidate) => candidate.id);
    if (groupIds.length > 0) {
      const lines = await tx.accessRequestLine.findMany({
        where: { requestId: { in: groupIds }, state: 'APPROVED' },
        select: { requestId: true, expectedEndDate: true },
        orderBy: [{ requestId: 'asc' }, { employeeId: 'asc' }],
      });
      for (const line of lines) add(line.requestId, line.expectedEndDate ? fromDateColumn(line.expectedEndDate) : null);
    }

    return seats;
  }

  /** The record that follows the renewed one, for each of these renewals that was applied: the seat the renewal stands for. */
  async renewalSuccessors(
    tx: DbTx,
    candidates: readonly YearStartCandidate[],
  ): Promise<{ requestId: string; assignmentId: string }[]> {
    const ids = candidates.filter((candidate) => candidate.type === 'RENEWAL').map((candidate) => candidate.id);
    if (ids.length === 0) return [];
    const rows = await tx.accessRequestRenewal.findMany({
      where: { requestId: { in: ids }, successorAssignmentId: { not: null } },
      select: { requestId: true, successorAssignmentId: true },
      orderBy: { requestId: 'asc' },
    });

    return rows.flatMap((row) =>
      row.successorAssignmentId === null ? [] : [{ requestId: row.requestId, assignmentId: row.successorAssignmentId }],
    );
  }

  /**
   * Which of these records a renewal began, and the renewal, for the renewals that still stand (approved as spend and not ended): the
   * request that extended a right is the one whose commitment holds it from then on.
   */
  async renewalsThatBegan(tx: DbTx, assignmentIds: readonly string[]): Promise<Map<string, string>> {
    if (assignmentIds.length === 0) return new Map();
    const rows = await tx.accessRequestRenewal.findMany({
      where: {
        successorAssignmentId: { in: [...new Set(assignmentIds)] },
        request: { state: { in: [...YEAR_START_REQUEST_STATES] } },
      },
      select: { requestId: true, successorAssignmentId: true },
    });
    const began = new Map<string, string>();
    for (const row of rows) if (row.successorAssignmentId !== null) began.set(row.successorAssignmentId, row.requestId);

    return began;
  }
}
