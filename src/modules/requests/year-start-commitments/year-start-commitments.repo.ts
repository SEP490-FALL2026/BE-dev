import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { fromDateColumn, type BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { YEAR_START_REQUEST_STATES } from './year-start-commitments.policy';

/** A request the pass may commit for, as it stands now (its row is locked until the transaction ends). */
export interface YearStartCandidate {
  id: string;
  type: 'GRANT' | 'SERVICE_ACCOUNT' | 'GROUP_GRANT';
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
  /** The mark of the pass of the year: null when none was begun, else whether it is complete. */
  async findRun(tx: DbTx, organizationId: string, year: number): Promise<{ completed: boolean } | null> {
    const row = await tx.yearStartCommitmentRun.findUnique({
      where: { organizationId_year: { organizationId, year } },
      select: { completedAt: true },
    });

    return row ? { completed: row.completedAt !== null } : null;
  }

  /** Whether the organization has a mark of an earlier year: one that has none is new, and a first pass makes nothing backwards. */
  async hasEarlierRun(tx: DbTx, organizationId: string, year: number): Promise<boolean> {
    return (await tx.yearStartCommitmentRun.count({ where: { organizationId, year: { lt: year } } })) > 0;
  }

  /** Marks the year done with nothing made, for an organization that has no earlier pass (a first pass makes nothing backwards). */
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
   * Completes the mark with what the pass made and left, once: the pass that completes it is the one that reports (the same pass run by two instances
   * writes one report). Returns the passes counted, or null when another pass had completed it.
   */
  async complete(
    tx: DbTx,
    input: { organizationId: string; year: number; created: number; skipped: number; now: Date },
  ): Promise<{ runCount: number } | null> {
    const rows = await tx.$queryRaw<Array<{ run_count: number }>>`
      UPDATE "year_start_commitment_runs"
         SET "completed_at" = ${input.now}, "created_count" = ${input.created}, "skipped_count" = ${input.skipped}
       WHERE "organization_id" = ${input.organizationId}::uuid AND "year" = ${input.year} AND "completed_at" IS NULL
      RETURNING "run_count"`;

    return rows.length > 0 ? { runCount: rows[0].run_count } : null;
  }

  /**
   * The next requests after `afterId`, in order of id, that could hold a commitment on 01/01 — the grant of a paid request (one person, a service
   * account or a group) that was approved as spend and is neither refused, withdrawn, failed nor cancelled — with their rows locked. A renewal is
   * not among them (its approval makes the record that follows the old one). Which of them are paid, of which kind of provisioning and
   * with what seats is for the caller to judge.
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
         AND r."type" IN ('GRANT', 'SERVICE_ACCOUNT', 'GROUP_GRANT')
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
   * as one that runs (`BR-MF1-09e`). A request that is being carried out or is done has its seats in the grants, not here.
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
      if (candidate.type !== 'GROUP_GRANT' && candidate.state === 'AWAITING_EXECUTION') {
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
}
