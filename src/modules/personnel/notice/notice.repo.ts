import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { type BusinessDate, fromDateColumn, toDateColumn } from '../../../core/business-date';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type {
  NoticeEventRef,
  NoticeKind,
  NoticeListFilter,
  NoticeRecord,
  NoticeSummaryRecord,
  NoticeVerificationRecord,
  VerificationInput,
} from '../personnel-notice.types';

type NoticeRow = Prisma.PersonnelNoticeGetPayload<Record<string, never>>;

const SUMMARY = {
  id: true,
  code: true,
  employeeId: true,
  kind: true,
  proposedOn: true,
  status: true,
  dueOn: true,
  createdAt: true,
} as const;

function toRecord(row: NoticeRow): NoticeRecord {
  return {
    id: row.id,
    code: row.code,
    organizationId: row.organizationId,
    employeeId: row.employeeId,
    kind: row.kind,
    proposedOn: fromDateColumn(row.proposedOn),
    targetDepartmentId: row.targetDepartmentId,
    note: row.note,
    senderEmployeeId: row.senderEmployeeId,
    senderDepartmentId: row.senderDepartmentId,
    status: row.status,
    rejectReason: row.rejectReason,
    recordedEventKind: row.recordedEventKind,
    recordedEventId: row.recordedEventId,
    defaultItAdminEmployeeId: row.defaultItAdminEmployeeId,
    dueOn: fromDateColumn(row.dueOn),
    handledByAppUserId: row.handledByAppUserId,
    handledByTicketId: row.handledByTicketId,
    handledAt: row.handledAt,
    overdueNoticedAt: row.overdueNoticedAt,
    createdAt: row.createdAt,
  };
}

/** Who handled a notice: an account, or the ticket of the controlled procedure; exactly one of the two. */
export interface Handler {
  appUserId: string | null;
  ticketId: string | null;
}

export interface NewNotice {
  organizationId: string;
  employeeId: string;
  kind: NoticeKind;
  proposedOn: BusinessDate;
  targetDepartmentId: string | null;
  note: string | null;
  senderEmployeeId: string;
  senderDepartmentId: string;
  defaultItAdminEmployeeId: string | null;
  dueOn: BusinessDate;
}

/**
 * The one reader and writer of `personnel_notices` and `personnel_notice_verifications`. A notice moves only once, from waiting to
 * its outcome, and the mark of the reminder while it waits (a trigger); a verification is written with the recording and never again.
 */
@Injectable()
export class NoticeRepo {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The next code for `year`: `BM09-<year>-<six digits>`, numbered again from 1 every year. The number is
   * taken under the lock of the row of the year in `personnel_notice_counters`: one more than the greater of the counter and the
   * highest number already in a code of that year (so a number the compatibility image drew from the old sequence is never
   * issued again), and the old sequence is lifted to it in the same transaction (never lowered), so that image never draws one the
   * counter has issued either.
   */
  async nextCode(tx: DbTx, year: string): Promise<string> {
    const yearNumber = Number(year);
    await tx.$executeRaw`
      INSERT INTO personnel_notice_counters (year, last_value) VALUES (${yearNumber}::int, 0) ON CONFLICT (year) DO NOTHING`;
    const counter = await tx.$queryRaw<{ last_value: number }[]>`
      SELECT last_value FROM personnel_notice_counters WHERE year = ${yearNumber}::int FOR UPDATE`;
    const used = await tx.$queryRaw<{ highest: number }[]>`
      SELECT COALESCE(MAX(substring(code FROM 11 FOR 6)::int), 0)::int AS highest
        FROM personnel_notices WHERE code LIKE ${`BM09-${year}-%`}`;
    const next = Math.max(counter[0].last_value, used[0].highest) + 1;
    await tx.$executeRaw`UPDATE personnel_notice_counters SET last_value = ${next}::int WHERE year = ${yearNumber}::int`;
    await tx.$executeRaw`
      SELECT setval('personnel_notice_seq', ${next}::bigint, true)
       WHERE (SELECT CASE WHEN is_called THEN last_value ELSE last_value - 1 END FROM personnel_notice_seq) < ${next}::bigint`;

    return `BM09-${year}-${String(next).padStart(6, '0')}`;
  }

  async insert(tx: DbTx, code: string, input: NewNotice): Promise<NoticeRecord> {
    const created = await tx.personnelNotice.create({
      data: {
        id: randomUUID(),
        code,
        organizationId: input.organizationId,
        employeeId: input.employeeId,
        kind: input.kind,
        proposedOn: toDateColumn(input.proposedOn),
        targetDepartmentId: input.targetDepartmentId,
        note: input.note,
        senderEmployeeId: input.senderEmployeeId,
        senderDepartmentId: input.senderDepartmentId,
        defaultItAdminEmployeeId: input.defaultItAdminEmployeeId,
        dueOn: toDateColumn(input.dueOn),
      },
    });

    return toRecord(created);
  }

  async find(id: string, tx?: DbTx): Promise<NoticeRecord | null> {
    const row = await (tx ?? this.prisma).personnelNotice.findUnique({ where: { id } });

    return row && toRecord(row);
  }

  /** The row held `FOR UPDATE` until the transaction ends, read after the lock; null when there is none. */
  async lock(tx: DbTx, id: string): Promise<NoticeRecord | null> {
    const rows = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM personnel_notices WHERE id = ${id}::uuid FOR UPDATE`;

    return rows.length === 0 ? null : this.find(id, tx);
  }

  /** The code of the notice of this kind about this person that waits, if there is one. */
  async pendingCodeOf(tx: DbTx, employeeId: string, kind: NoticeKind): Promise<string | null> {
    const row = await tx.personnelNotice.findFirst({
      where: { employeeId, kind, status: 'PENDING_VERIFICATION' },
      select: { code: true },
    });

    return row?.code ?? null;
  }

  async markWithdrawn(tx: DbTx, id: string, byAppUserId: string): Promise<NoticeRecord> {
    const row = await tx.personnelNotice.update({
      where: { id },
      data: { status: 'WITHDRAWN', handledByAppUserId: byAppUserId, handledAt: new Date() },
    });

    return toRecord(row);
  }

  async markRejected(tx: DbTx, id: string, by: Handler, reason: string): Promise<NoticeRecord> {
    const row = await tx.personnelNotice.update({
      where: { id },
      data: {
        status: 'REJECTED',
        rejectReason: reason,
        handledByAppUserId: by.appUserId,
        handledByTicketId: by.ticketId,
        handledAt: new Date(),
      },
    });

    return toRecord(row);
  }

  /** The notice is recorded as the event it led to, which is a new one or one that was in force already. */
  async markRecorded(tx: DbTx, id: string, by: Handler, event: NoticeEventRef): Promise<NoticeRecord> {
    const row = await tx.personnelNotice.update({
      where: { id },
      data: {
        status: 'RECORDED',
        recordedEventKind: event.kind,
        recordedEventId: event.id,
        handledByAppUserId: by.appUserId,
        handledByTicketId: by.ticketId,
        handledAt: new Date(),
      },
    });

    return toRecord(row);
  }

  async insertVerification(
    tx: DbTx,
    noticeId: string,
    verification: VerificationInput,
    by: Handler,
  ): Promise<NoticeVerificationRecord> {
    const created = await tx.personnelNoticeVerification.create({
      data: {
        id: randomUUID(),
        noticeId,
        method: verification.method,
        reference: verification.reference.trim(),
        verifiedByAppUserId: by.appUserId,
        verifiedByTicketId: by.ticketId,
      },
    });

    return {
      method: created.method,
      reference: created.reference,
      verifiedByAppUserId: created.verifiedByAppUserId,
      verifiedByTicketId: created.verifiedByTicketId,
      verifiedAt: created.verifiedAt,
    };
  }

  async findVerification(noticeId: string): Promise<NoticeVerificationRecord | null> {
    const row = await this.prisma.personnelNoticeVerification.findUnique({ where: { noticeId } });

    return (
      row && {
        method: row.method,
        reference: row.reference,
        verifiedByAppUserId: row.verifiedByAppUserId,
        verifiedByTicketId: row.verifiedByTicketId,
        verifiedAt: row.verifiedAt,
      }
    );
  }

  /** One page of notices by the day they are due, and the total for the same filter, from one snapshot. */
  async list(filter: NoticeListFilter): Promise<{ items: NoticeSummaryRecord[]; total: number }> {
    const where: Prisma.PersonnelNoticeWhereInput = {
      ...(filter.employeeIds ? { AND: [{ employeeId: { in: [...filter.employeeIds] } }] } : {}),
      ...(filter.senderEmployeeId ? { senderEmployeeId: filter.senderEmployeeId } : {}),
      ...(filter.employeeId ? { employeeId: filter.employeeId } : {}),
      ...(filter.kind ? { kind: filter.kind } : {}),
      ...(filter.priority ? { kind: 'ABRUPT_DEPARTURE' } : {}),
      ...(filter.overdue
        ? { status: 'PENDING_VERIFICATION', dueOn: { lt: toDateColumn(filter.today) } }
        : filter.status
          ? { status: filter.status }
          : {}),
    };

    return this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.personnelNotice.findMany({
          where,
          select: SUMMARY,
          orderBy: [{ dueOn: 'asc' }, { id: 'asc' }],
          skip: (filter.page - 1) * filter.pageSize,
          take: filter.pageSize,
        });

        return {
          items: rows.map((row) => ({
            ...row,
            proposedOn: fromDateColumn(row.proposedOn),
            dueOn: fromDateColumn(row.dueOn),
          })),
          total: await tx.personnelNotice.count({ where }),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  /** The notices that still wait past their day and have not been told about, the oldest day first. */
  async listOverdueUnnoticed(today: BusinessDate, limit: number): Promise<NoticeRecord[]> {
    const rows = await this.prisma.personnelNotice.findMany({
      where: { status: 'PENDING_VERIFICATION', dueOn: { lt: toDateColumn(today) }, overdueNoticedAt: null },
      orderBy: [{ dueOn: 'asc' }, { id: 'asc' }],
      take: limit,
    });

    return rows.map(toRecord);
  }

  /** Marks that the reminder was written; false when it already was or the notice was handled meanwhile. */
  async markOverdueNoticed(tx: DbTx, id: string): Promise<boolean> {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      UPDATE personnel_notices SET overdue_noticed_at = now()
       WHERE id = ${id}::uuid AND status = 'PENDING_VERIFICATION' AND overdue_noticed_at IS NULL
       RETURNING id`;

    return rows.length > 0;
  }
}
