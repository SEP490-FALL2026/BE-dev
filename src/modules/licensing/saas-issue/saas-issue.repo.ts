import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { fromDateColumn, toDateColumn, type BusinessDate } from '../../../core/business-date';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { LinkedWork, SaasIssueCategory, SaasIssueImpact, SaasIssueState } from './saas-issue.policy';

export type EntryKind = 'MESSAGE' | 'TRANSITION';
export type AuthorRole = 'REPORTER' | 'IT_ADMIN' | 'SYSTEM';

/** A report of an error in a SaaS right, as it is kept. */
export interface SaasIssueRecord {
  id: string;
  code: string;
  organizationId: string;
  reporterEmployeeId: string;
  assignmentId: string;
  grantTaskId: string | null;
  category: SaasIssueCategory;
  impact: SaasIssueImpact;
  description: string;
  occurredAt: Date;
  state: SaasIssueState;
  assignedItAdminEmployeeId: string;
  assignedByFallback: boolean;
  responseDueOn: BusinessDate;
  responseOverdueNoticedAt: Date | null;
  resolution: string | null;
  vendorTicketRef: string | null;
  duplicateOfId: string | null;
  duplicateReason: string | null;
  linkedWork: LinkedWork | null;
  resolvedAt: Date | null;
  reopenUntil: BusinessDate | null;
  closedAt: Date | null;
  reopenCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface EntryRecord {
  id: string;
  issueId: string;
  kind: EntryKind;
  authorEmployeeId: string | null;
  authorRole: AuthorRole;
  body: string | null;
  fromState: SaasIssueState | null;
  toState: SaasIssueState | null;
  onBehalfOfEmployeeId: string | null;
  createdAt: Date;
}

export interface NewSaasIssue {
  organizationId: string;
  reporterEmployeeId: string;
  assignmentId: string;
  grantTaskId: string | null;
  category: SaasIssueCategory;
  impact: SaasIssueImpact;
  description: string;
  occurredAt: Date;
  assignedItAdminEmployeeId: string;
  assignedByFallback: boolean;
  responseDueOn: BusinessDate;
}

export interface NewEntry {
  issueId: string;
  kind: EntryKind;
  authorEmployeeId: string | null;
  authorRole: AuthorRole;
  body: string | null;
  fromState: SaasIssueState | null;
  toState: SaasIssueState | null;
  onBehalfOfEmployeeId: string | null;
}

/** What a handling or a reopening changes on a report; a field left out stays as it is. */
export interface IssuePatch {
  state: SaasIssueState;
  resolution?: string;
  vendorTicketRef?: string;
  linkedWork?: LinkedWork;
  duplicateOfId?: string;
  duplicateReason?: string;
  resolvedAt?: Date;
  reopenUntil?: BusinessDate;
  closedAt?: Date;
  reopenCount?: number;
}

export interface IssueFilter {
  reporterEmployeeId?: string;
  assignedItAdminEmployeeId?: string;
  state?: SaasIssueState;
  /** Only the new reports whose first answer was due before this day. */
  overdueBefore?: BusinessDate;
  skip: number;
  take: number;
}

type Row = Prisma.SaasIssueGetPayload<object>;

const toRecord = (row: Row): SaasIssueRecord => ({
  id: row.id,
  code: row.code,
  organizationId: row.organizationId,
  reporterEmployeeId: row.reporterEmployeeId,
  assignmentId: row.assignmentId,
  grantTaskId: row.grantTaskId,
  category: row.category,
  impact: row.impact,
  description: row.description,
  occurredAt: row.occurredAt,
  state: row.state,
  assignedItAdminEmployeeId: row.assignedItAdminEmployeeId,
  assignedByFallback: row.assignedByFallback,
  responseDueOn: fromDateColumn(row.responseDueOn),
  responseOverdueNoticedAt: row.responseOverdueNoticedAt,
  resolution: row.resolution,
  vendorTicketRef: row.vendorTicketRef,
  duplicateOfId: row.duplicateOfId,
  duplicateReason: row.duplicateReason,
  linkedWork: (row.linkedWork as LinkedWork | null) ?? null,
  resolvedAt: row.resolvedAt,
  reopenUntil: row.reopenUntil ? fromDateColumn(row.reopenUntil) : null,
  closedAt: row.closedAt,
  reopenCount: row.reopenCount,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

/**
 * The one writer of `saas_issues` and `saas_issue_entries`, and the reads of them. A report is written once and moves only through its
 * states (the database refuses every other change); an entry is written once and never changed or deleted. Each read is a fixed number
 * of statements, however many reports it covers.
 */
@Injectable()
export class SaasIssueRepo {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The next code for `year`: `BM11-<year>-<six digits>`, numbered again from 1 every year (F48, spec K and L.10). The number is taken
   * under the lock of the row of the year in `saas_issue_counters`: one more than the greater of the counter and the highest number
   * already in a code of that year (so a number the compatibility image drew from the old sequence is never issued again), and the old
   * sequence is lifted to it in the same transaction (never lowered), so that image never draws one the counter has issued either.
   */
  async nextCode(tx: DbTx, year: string): Promise<string> {
    const yearNumber = Number(year);
    await tx.$executeRaw`
      INSERT INTO saas_issue_counters (year, last_value) VALUES (${yearNumber}::int, 0) ON CONFLICT (year) DO NOTHING`;
    const counter = await tx.$queryRaw<{ last_value: number }[]>`
      SELECT last_value FROM saas_issue_counters WHERE year = ${yearNumber}::int FOR UPDATE`;
    const used = await tx.$queryRaw<{ highest: number }[]>`
      SELECT COALESCE(MAX(substring(code FROM 11 FOR 6)::int), 0)::int AS highest
        FROM saas_issues WHERE code LIKE ${`BM11-${year}-%`}`;
    const next = Math.max(counter[0].last_value, used[0].highest) + 1;
    await tx.$executeRaw`UPDATE saas_issue_counters SET last_value = ${next}::int WHERE year = ${yearNumber}::int`;
    await tx.$executeRaw`
      SELECT setval('saas_issue_seq', ${next}::bigint, true)
       WHERE (SELECT CASE WHEN is_called THEN last_value ELSE last_value - 1 END FROM saas_issue_seq) < ${next}::bigint`;

    return `BM11-${year}-${String(next).padStart(6, '0')}`;
  }

  async insert(tx: DbTx, code: string, input: NewSaasIssue): Promise<SaasIssueRecord> {
    const row = await tx.saasIssue.create({
      data: {
        id: randomUUID(),
        code,
        organizationId: input.organizationId,
        reporterEmployeeId: input.reporterEmployeeId,
        assignmentId: input.assignmentId,
        grantTaskId: input.grantTaskId,
        category: input.category,
        impact: input.impact,
        description: input.description,
        occurredAt: input.occurredAt,
        assignedItAdminEmployeeId: input.assignedItAdminEmployeeId,
        assignedByFallback: input.assignedByFallback,
        responseDueOn: toDateColumn(input.responseDueOn),
      },
    });

    return toRecord(row);
  }

  async find(id: string, tx?: DbTx): Promise<SaasIssueRecord | null> {
    const row = await (tx ?? this.prisma).saasIssue.findUnique({ where: { id } });

    return row ? toRecord(row) : null;
  }

  /** The reports with these ids, in one statement. */
  async findMany(ids: readonly string[], tx?: DbTx): Promise<SaasIssueRecord[]> {
    if (ids.length === 0) return [];
    const rows = await (tx ?? this.prisma).saasIssue.findMany({ where: { id: { in: [...ids] } } });

    return rows.map(toRecord);
  }

  /** The report, locked `FOR UPDATE` for the rest of the transaction, or null. */
  async lock(tx: DbTx, id: string): Promise<SaasIssueRecord | null> {
    const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM saas_issues WHERE id = ${id}::uuid FOR UPDATE`;

    return locked.length === 0 ? null : this.find(id, tx);
  }

  async update(tx: DbTx, id: string, patch: IssuePatch): Promise<SaasIssueRecord> {
    const row = await tx.saasIssue.update({
      where: { id },
      data: {
        state: patch.state,
        ...(patch.resolution !== undefined ? { resolution: patch.resolution } : {}),
        ...(patch.vendorTicketRef !== undefined ? { vendorTicketRef: patch.vendorTicketRef } : {}),
        ...(patch.linkedWork !== undefined ? { linkedWork: { ...patch.linkedWork } } : {}),
        ...(patch.duplicateOfId !== undefined ? { duplicateOfId: patch.duplicateOfId } : {}),
        ...(patch.duplicateReason !== undefined ? { duplicateReason: patch.duplicateReason } : {}),
        ...(patch.resolvedAt !== undefined ? { resolvedAt: patch.resolvedAt } : {}),
        ...(patch.reopenUntil !== undefined ? { reopenUntil: toDateColumn(patch.reopenUntil) } : {}),
        ...(patch.closedAt !== undefined ? { closedAt: patch.closedAt } : {}),
        ...(patch.reopenCount !== undefined ? { reopenCount: patch.reopenCount } : {}),
      },
    });

    return toRecord(row);
  }

  async insertEntry(tx: DbTx, input: NewEntry): Promise<EntryRecord> {
    const row = await tx.saasIssueEntry.create({ data: { id: randomUUID(), ...input } });

    return row;
  }

  /** One page of reports, the newest first, and the total for the same filter, from one snapshot. */
  async page(filter: IssueFilter): Promise<{ items: SaasIssueRecord[]; total: number }> {
    const where: Prisma.SaasIssueWhereInput = {
      ...(filter.reporterEmployeeId ? { reporterEmployeeId: filter.reporterEmployeeId } : {}),
      ...(filter.assignedItAdminEmployeeId ? { assignedItAdminEmployeeId: filter.assignedItAdminEmployeeId } : {}),
      ...(filter.overdueBefore
        ? { state: 'NEW', responseDueOn: { lt: toDateColumn(filter.overdueBefore) } }
        : filter.state
          ? { state: filter.state }
          : {}),
    };

    return this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.saasIssue.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          skip: filter.skip,
          take: filter.take,
        });

        return { items: rows.map(toRecord), total: await tx.saasIssue.count({ where }) };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  /** One page of the exchange of a report, oldest first, and the total, from one snapshot. */
  async entriesPage(
    issueId: string,
    page: { skip: number; take: number },
  ): Promise<{ items: EntryRecord[]; total: number }> {
    return this.prisma.$transaction(
      async (tx) => ({
        items: await tx.saasIssueEntry.findMany({
          where: { issueId },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          skip: page.skip,
          take: page.take,
        }),
        total: await tx.saasIssueEntry.count({ where: { issueId } }),
      }),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  /** The resolved reports whose last day to reopen has passed, the oldest first. */
  async listLapsed(today: BusinessDate, limit: number): Promise<SaasIssueRecord[]> {
    const rows = await this.prisma.saasIssue.findMany({
      where: { state: 'RESOLVED', reopenUntil: { lt: toDateColumn(today) } },
      orderBy: [{ reopenUntil: 'asc' }, { id: 'asc' }],
      take: limit,
    });

    return rows.map(toRecord);
  }

  /** The new reports that waited past the day they were due and have not been told about, the oldest day first. */
  async listOverdueUnnoticed(today: BusinessDate, limit: number): Promise<SaasIssueRecord[]> {
    const rows = await this.prisma.saasIssue.findMany({
      where: { state: 'NEW', responseDueOn: { lt: toDateColumn(today) }, responseOverdueNoticedAt: null },
      orderBy: [{ responseDueOn: 'asc' }, { id: 'asc' }],
      take: limit,
    });

    return rows.map(toRecord);
  }

  /** Marks that the reminder was written; false when it already was or the report was taken up meanwhile. */
  async markOverdueNoticed(tx: DbTx, id: string): Promise<boolean> {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      UPDATE saas_issues SET response_overdue_noticed_at = now()
       WHERE id = ${id}::uuid AND state = 'NEW' AND response_overdue_noticed_at IS NULL
       RETURNING id`;

    return rows.length > 0;
  }
}
