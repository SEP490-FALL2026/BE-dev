import { Injectable } from '@nestjs/common';
import { fromDateColumn, toDateColumn, type BusinessDate } from '../../../../core/business-date';
import { Prisma } from '../../../../generated/prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';

export interface CommitmentMonthRecord {
  commitmentId: string;
  month: BusinessDate;
  seatCount: number;
  shareMinor: bigint;
  appliedMinor: bigint;
  releasedMinor: bigint;
  settledAt: Date | null;
}

export interface NewCommitmentMonth {
  commitmentId: string;
  month: BusinessDate;
  seatCount: number;
  shareMinor: bigint;
}

export interface CommitmentMonthKey {
  commitmentId: string;
  month: BusinessDate;
}

export interface HeldCommitmentMonthCandidate {
  commitmentId: string;
  requestId: string;
  costCenterId: string;
  year: number;
  currency: string;
  month: BusinessDate;
  seatCount: number;
  shareMinor: bigint;
  appliedMinor: bigint;
  releasedMinor: bigint;
  settledAt: Date | null;
}

interface RawMonthRow {
  commitment_id: string;
  month: string;
  seat_count: number;
  share_minor: bigint | string;
  applied_minor: bigint | string;
  released_minor: bigint | string;
  settled_at: Date | null;
}

interface RawCandidateRow extends RawMonthRow {
  request_id: string;
  cost_center_id: string;
  year: number;
  currency: string;
}

const toRecord = (row: Prisma.BudgetCommitmentMonthGetPayload<object>): CommitmentMonthRecord => ({
  commitmentId: row.commitmentId,
  month: fromDateColumn(row.month),
  seatCount: row.seatCount,
  shareMinor: row.shareMinor,
  appliedMinor: row.appliedMinor,
  releasedMinor: row.releasedMinor,
  settledAt: row.settledAt,
});

const toRawRecord = (row: RawMonthRow): CommitmentMonthRecord => ({
  commitmentId: row.commitment_id,
  month: row.month,
  seatCount: Number(row.seat_count),
  shareMinor: BigInt(row.share_minor),
  appliedMinor: BigInt(row.applied_minor),
  releasedMinor: BigInt(row.released_minor),
  settledAt: row.settled_at,
});

const toCandidate = (row: RawCandidateRow): HeldCommitmentMonthCandidate => ({
  ...toRawRecord(row),
  requestId: row.request_id,
  costCenterId: row.cost_center_id,
  year: Number(row.year),
  currency: row.currency,
});

/** Deduplicates and sorts `(commitmentId, month)` pairs strictly ascending so multi-row `FOR UPDATE` never deadlocks. */
function sortUniqueKeys(keys: readonly CommitmentMonthKey[]): CommitmentMonthKey[] {
  const seen = new Set<string>();
  const unique: CommitmentMonthKey[] = [];
  for (const key of keys) {
    const composite = `${key.commitmentId}|${key.month}`;
    if (!seen.has(composite)) {
      seen.add(composite);
      unique.push(key);
    }
  }
  return unique.sort((a, b) => {
    const byId = a.commitmentId.localeCompare(b.commitmentId);
    return byId !== 0 ? byId : a.month.localeCompare(b.month);
  });
}

/**
 * Reader and writer of `budget_commitment_months`: monthly slices of pooled-quota commitments.
 * `commitmentId`, `month`, `seatCount`, and `shareMinor` are immutable after insert; only `appliedMinor`,
 * `releasedMinor`, and `settledAt` move under lock order Tier 0 -> Tier 9 (`budget_commitments`) -> Tier 9b (`budget_commitment_months`).
 */
@Injectable()
export class CommitmentMonthRepo {
  constructor(private readonly prisma: PrismaService) {}

  async insertMany(tx: DbTx, rows: readonly NewCommitmentMonth[]): Promise<void> {
    if (rows.length === 0) return;
    await tx.budgetCommitmentMonth.createMany({
      data: rows.map((row) => ({
        commitmentId: row.commitmentId,
        month: toDateColumn(row.month),
        seatCount: row.seatCount,
        shareMinor: row.shareMinor,
      })),
    });
  }

  /** Tier 0 advisory lock serializing monthly pool settlement and year-end sweep for one organization and month. */
  async lockOrganizationMonth(tx: DbTx, organizationId: string, month: BusinessDate): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`commitment-month:${organizationId}:${month}`}, 0))`;
  }

  /** Locks all monthly slices of one commitment in ascending `month` order (Tier 9b). */
  async lockOfCommitment(tx: DbTx, commitmentId: string): Promise<CommitmentMonthRecord[]> {
    const rows = await tx.$queryRaw<RawMonthRow[]>`
      SELECT commitment_id, to_char(month, 'YYYY-MM-DD') AS month, seat_count,
             share_minor::text AS share_minor, applied_minor::text AS applied_minor,
             released_minor::text AS released_minor, settled_at
        FROM budget_commitment_months
       WHERE commitment_id = ${commitmentId}::uuid
       ORDER BY month ASC
         FOR UPDATE`;
    return rows.map(toRawRecord);
  }

  /** Locks the requested `(commitmentId, month)` slices in canonical `(commitmentId, month)` ascending order (Tier 9b). */
  async lockByCommitmentAndMonths(tx: DbTx, keys: readonly CommitmentMonthKey[]): Promise<CommitmentMonthRecord[]> {
    const ordered = sortUniqueKeys(keys);
    if (ordered.length === 0) return [];
    const commitmentIds = ordered.map((item) => item.commitmentId);
    const months = ordered.map((item) => item.month);
    const rows = await tx.$queryRaw<RawMonthRow[]>`
      SELECT m.commitment_id, to_char(m.month, 'YYYY-MM-DD') AS month, m.seat_count,
             m.share_minor::text AS share_minor, m.applied_minor::text AS applied_minor,
             m.released_minor::text AS released_minor, m.settled_at
        FROM budget_commitment_months m
        JOIN unnest(${commitmentIds}::uuid[], ${months}::date[]) AS k(commitment_id, month)
          ON m.commitment_id = k.commitment_id AND m.month = k.month
       ORDER BY m.commitment_id ASC, m.month ASC
         FOR UPDATE OF m`;
    return rows.map(toRawRecord);
  }

  async ofCommitment(commitmentId: string, tx?: DbTx): Promise<CommitmentMonthRecord[]> {
    const rows = await (tx ?? this.prisma).budgetCommitmentMonth.findMany({
      where: { commitmentId },
      orderBy: { month: 'asc' },
    });
    return rows.map(toRecord);
  }

  async addApplied(tx: DbTx, commitmentId: string, month: BusinessDate, deltaMinor: bigint): Promise<void> {
    if (deltaMinor === 0n) return;
    await tx.budgetCommitmentMonth.update({
      where: { commitmentId_month: { commitmentId, month: toDateColumn(month) } },
      data: { appliedMinor: { increment: deltaMinor } },
    });
  }

  /** Reverses previously applied seat-month spend and clears `settledAt` so month-end settlement can re-evaluate the slice. */
  async reverseApplied(tx: DbTx, commitmentId: string, month: BusinessDate, deltaMinor: bigint): Promise<void> {
    if (deltaMinor <= 0n) return;
    await tx.budgetCommitmentMonth.update({
      where: { commitmentId_month: { commitmentId, month: toDateColumn(month) } },
      data: { appliedMinor: { decrement: deltaMinor }, settledAt: null },
    });
  }

  async addReleased(
    tx: DbTx,
    commitmentId: string,
    month: BusinessDate,
    deltaMinor: bigint,
    settledAt?: Date,
  ): Promise<void> {
    if (deltaMinor === 0n && settledAt === undefined) return;
    await tx.budgetCommitmentMonth.update({
      where: { commitmentId_month: { commitmentId, month: toDateColumn(month) } },
      data: {
        ...(deltaMinor === 0n ? {} : { releasedMinor: { increment: deltaMinor } }),
        ...(settledAt === undefined ? {} : { settledAt }),
      },
    });
  }

  async markSettled(tx: DbTx, commitmentId: string, month: BusinessDate, settledAt: Date): Promise<void> {
    await tx.budgetCommitmentMonth.update({
      where: { commitmentId_month: { commitmentId, month: toDateColumn(month) } },
      data: { settledAt },
    });
  }

  async clearSettled(tx: DbTx, commitmentId: string, month: BusinessDate): Promise<void> {
    await tx.budgetCommitmentMonth.update({
      where: { commitmentId_month: { commitmentId, month: toDateColumn(month) } },
      data: { settledAt: null },
    });
  }

  /** Lists unsettled monthly slices of `HELD` commitments for one organization and month, ordered by `(year, commitmentId)`. */
  async listUnsettledForMonth(
    organizationId: string,
    month: BusinessDate,
    tx?: DbTx,
  ): Promise<HeldCommitmentMonthCandidate[]> {
    const rows = await (tx ?? this.prisma).$queryRaw<RawCandidateRow[]>`
      SELECT m.commitment_id, c.request_id, c.cost_center_id, c.year, c.currency,
             to_char(m.month, 'YYYY-MM-DD') AS month, m.seat_count,
             m.share_minor::text AS share_minor, m.applied_minor::text AS applied_minor,
             m.released_minor::text AS released_minor, m.settled_at
        FROM budget_commitment_months m
        JOIN budget_commitments c ON c.id = m.commitment_id
       WHERE c.organization_id = ${organizationId}::uuid
         AND c.state = 'HELD'
         AND m.month = ${month}::date
         AND m.settled_at IS NULL
       ORDER BY c.year ASC, c.id ASC`;
    return rows.map(toCandidate);
  }

  /** Lists all monthly slices belonging to `HELD` commitments of `year`, ordered by `(year, commitmentId, month)`. */
  async listPriorYearHeldByYear(
    organizationId: string,
    year: number,
    tx?: DbTx,
  ): Promise<HeldCommitmentMonthCandidate[]> {
    const rows = await (tx ?? this.prisma).$queryRaw<RawCandidateRow[]>`
      SELECT m.commitment_id, c.request_id, c.cost_center_id, c.year, c.currency,
             to_char(m.month, 'YYYY-MM-DD') AS month, m.seat_count,
             m.share_minor::text AS share_minor, m.applied_minor::text AS applied_minor,
             m.released_minor::text AS released_minor, m.settled_at
        FROM budget_commitment_months m
        JOIN budget_commitments c ON c.id = m.commitment_id
       WHERE c.organization_id = ${organizationId}::uuid
         AND c.state = 'HELD'
         AND c.year = ${year}::int
       ORDER BY c.year ASC, c.id ASC, m.month ASC`;
    return rows.map(toCandidate);
  }

  /** Counts `HELD` commitments with monthly slices in `year` alongside total and unsettled slice counts. */
  async countHeldByYear(
    organizationId: string,
    year: number,
    tx?: DbTx,
  ): Promise<{ commitments: number; months: number; unsettledMonths: number }> {
    const rows = await (tx ?? this.prisma).$queryRaw<
      { commitments: string; months: string; unsettled_months: string }[]
    >`
      SELECT COUNT(DISTINCT c.id)::text AS commitments,
             COUNT(*)::text AS months,
             COUNT(*) FILTER (WHERE m.settled_at IS NULL)::text AS unsettled_months
        FROM budget_commitment_months m
        JOIN budget_commitments c ON c.id = m.commitment_id
       WHERE c.organization_id = ${organizationId}::uuid
         AND c.state = 'HELD'
         AND c.year = ${year}::int`;
    const row = rows[0];
    return {
      commitments: Number(row?.commitments ?? '0'),
      months: Number(row?.months ?? '0'),
      unsettledMonths: Number(row?.unsettled_months ?? '0'),
    };
  }

  /** Years strictly before `beforeYear` that still have unsettled monthly slices of HELD commitments. */
  async listUnsettledYearsBefore(organizationId: string, beforeYear: number, tx?: DbTx): Promise<number[]> {
    const rows = await (tx ?? this.prisma).$queryRaw<{ year: number }[]>`
      SELECT DISTINCT c.year::int AS year
        FROM budget_commitment_months m
        JOIN budget_commitments c ON c.id = m.commitment_id
       WHERE c.organization_id = ${organizationId}::uuid
         AND c.state = 'HELD'
         AND c.year < ${beforeYear}::int
         AND m.settled_at IS NULL
       ORDER BY year ASC`;
    return rows.map((r) => Number(r.year));
  }

  /** Distinct unsettled slice months (`YYYY-MM-01`) of HELD commitments in `year`. */
  async listUnsettledMonthsInYear(organizationId: string, year: number, tx?: DbTx): Promise<BusinessDate[]> {
    const rows = await (tx ?? this.prisma).$queryRaw<{ month: string }[]>`
      SELECT DISTINCT to_char(m.month, 'YYYY-MM-DD') AS month
        FROM budget_commitment_months m
        JOIN budget_commitments c ON c.id = m.commitment_id
       WHERE c.organization_id = ${organizationId}::uuid
         AND c.state = 'HELD'
         AND c.year = ${year}::int
         AND m.settled_at IS NULL
       ORDER BY month ASC`;
    return rows.map((r) => r.month);
  }
}
