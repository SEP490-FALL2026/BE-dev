import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { BusinessDate, fromDateColumn, toDateColumn } from '../../../core/business-date';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { RevocationSource } from '../public/licensing.types';
import type { HandoverConfirmedRole, HandoverRole, HandoverValue } from './handover-confirmer.policy';

type DutyRow = Prisma.HandoverDutyGetPayload<Record<string, never>>;

/** A duty as it is kept: what is owed, by what role, until when, and what became of it. */
export interface DutyRecord {
  id: string;
  organizationId: string;
  assignmentId: string;
  employeeId: string;
  source: RevocationSource;
  caseRefId: string | null;
  departmentId: string | null;
  leaverIsHead: boolean;
  resolveOn: BusinessDate | null;
  confirmerRole: HandoverRole;
  confirmerEmployeeId: string | null;
  dataLoss: boolean;
  noticeText: string | null;
  dueOn: BusinessDate;
  confirmedValue: HandoverValue | null;
  confirmedByEmployeeId: string | null;
  confirmedRole: HandoverConfirmedRole | null;
  confirmedAt: Date | null;
  confirmedLate: boolean;
  overdueNoticedAt: Date | null;
  proceededUnconfirmedAt: Date | null;
  cancelledAt: Date | null;
  cancelReason: string | null;
  createdByAppUserId: string;
  createdAt: Date;
}

export interface NewDuty {
  organizationId: string;
  assignmentId: string;
  employeeId: string;
  source: RevocationSource;
  caseRefId: string | null;
  departmentId: string | null;
  leaverIsHead: boolean;
  resolveOn: BusinessDate | null;
  confirmerRole: HandoverRole;
  confirmerEmployeeId: string | null;
  dataLoss: boolean;
  noticeText: string | null;
  dueOn: BusinessDate;
  createdByAppUserId: string;
}

const date = (value: Date | null): BusinessDate | null => (value ? fromDateColumn(value) : null);

function toRecord(row: DutyRow): DutyRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    assignmentId: row.assignmentId,
    employeeId: row.employeeId,
    source: row.source,
    caseRefId: row.caseRefId,
    departmentId: row.departmentId,
    leaverIsHead: row.leaverIsHead,
    resolveOn: date(row.resolveOn),
    confirmerRole: row.confirmerRole,
    confirmerEmployeeId: row.confirmerEmployeeId,
    dataLoss: row.dataLoss,
    noticeText: row.noticeText,
    dueOn: fromDateColumn(row.dueOn),
    confirmedValue: row.confirmedValue,
    confirmedByEmployeeId: row.confirmedByEmployeeId,
    confirmedRole: row.confirmedRole,
    confirmedAt: row.confirmedAt,
    confirmedLate: row.confirmedLate,
    overdueNoticedAt: row.overdueNoticedAt,
    proceededUnconfirmedAt: row.proceededUnconfirmedAt,
    cancelledAt: row.cancelledAt,
    cancelReason: row.cancelReason,
    createdByAppUserId: row.createdByAppUserId,
    createdAt: row.createdAt,
  };
}

export const OPEN_DUTY: Prisma.HandoverDutyWhereInput = { confirmedAt: null, cancelledAt: null };

/**
 * The one writer of `handover_duties`: a duty for each seat that is owed a confirmation, written when it is opened and once more
 * when it is confirmed. A confirmed or cancelled duty is history; the database refuses to change it or to delete any.
 */
@Injectable()
export class HandoverRepo {
  constructor(private readonly prisma: PrismaService) {}

  async insert(tx: DbTx, input: NewDuty): Promise<DutyRecord> {
    return toRecord(
      await tx.handoverDuty.create({
        data: {
          id: randomUUID(),
          organizationId: input.organizationId,
          assignmentId: input.assignmentId,
          employeeId: input.employeeId,
          source: input.source,
          caseRefId: input.caseRefId,
          departmentId: input.departmentId,
          leaverIsHead: input.leaverIsHead,
          resolveOn: input.resolveOn ? toDateColumn(input.resolveOn) : null,
          confirmerRole: input.confirmerRole,
          confirmerEmployeeId: input.confirmerEmployeeId,
          dataLoss: input.dataLoss,
          noticeText: input.noticeText,
          dueOn: toDateColumn(input.dueOn),
          createdByAppUserId: input.createdByAppUserId,
        },
      }),
    );
  }

  async find(id: string, tx?: DbTx): Promise<DutyRecord | null> {
    const row = await (tx ?? this.prisma).handoverDuty.findUnique({ where: { id } });

    return row ? toRecord(row) : null;
  }

  /** The duty held until the caller transaction ends, so a confirmation and a cancellation cannot both win. */
  async lock(tx: DbTx, id: string): Promise<DutyRecord | null> {
    await tx.$queryRaw`SELECT id FROM handover_duties WHERE id = ${id}::uuid FOR UPDATE`;

    return this.find(id, tx);
  }

  /** The duty a seat still waits on, locked, or null. */
  async lockOpenOf(tx: DbTx, assignmentId: string): Promise<DutyRecord | null> {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM handover_duties
       WHERE assignment_id = ${assignmentId}::uuid AND confirmed_at IS NULL AND cancelled_at IS NULL FOR UPDATE`;

    return rows[0] ? this.find(rows[0].id, tx) : null;
  }

  /** The duties of a seat that were confirmed, newest first: what a later reason may rely on. */
  async confirmedOf(tx: DbTx, assignmentId: string): Promise<DutyRecord[]> {
    const rows = await tx.handoverDuty.findMany({
      where: { assignmentId, confirmedAt: { not: null } },
      orderBy: [{ confirmedAt: 'desc' }, { id: 'asc' }],
    });

    return rows.map(toRecord);
  }

  /** The duties of a case that still wait, locked: what a change or a cancellation of the case moves. */
  async lockOpenOfCase(tx: DbTx, caseRefId: string): Promise<DutyRecord[]> {
    const ids = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM handover_duties
       WHERE case_ref_id = ${caseRefId}::uuid AND confirmed_at IS NULL AND cancelled_at IS NULL ORDER BY id FOR UPDATE`;
    if (ids.length === 0) return [];
    const rows = await tx.handoverDuty.findMany({
      where: { id: { in: ids.map((row) => row.id) } },
      orderBy: { id: 'asc' },
    });

    return rows.map(toRecord);
  }

  /** The duty gives its seat to the role that now answers for it (a head who decided takes it from the IT Admin). */
  async retarget(
    tx: DbTx,
    id: string,
    input: {
      source: RevocationSource;
      role: HandoverRole;
      confirmerEmployeeId: string | null;
      departmentId: string | null;
      leaverIsHead: boolean;
      resolveOn: BusinessDate | null;
    },
  ): Promise<void> {
    await tx.handoverDuty.update({
      where: { id },
      data: {
        source: input.source,
        confirmerRole: input.role,
        confirmerEmployeeId: input.confirmerEmployeeId,
        departmentId: input.departmentId,
        leaverIsHead: input.leaverIsHead,
        resolveOn: input.resolveOn ? toDateColumn(input.resolveOn) : null,
      },
    });
  }

  async setDue(tx: DbTx, id: string, dueOn: BusinessDate, resolveOn: BusinessDate | null | undefined): Promise<void> {
    await tx.handoverDuty.update({
      where: { id },
      data: {
        dueOn: toDateColumn(dueOn),
        ...(resolveOn === undefined ? {} : { resolveOn: resolveOn ? toDateColumn(resolveOn) : null }),
        // A deadline that moved is a new one: the reminder for the old one is not the reminder for it.
        overdueNoticedAt: null,
      },
    });
  }

  /** Writes the confirmation; false when the duty was confirmed or cancelled meanwhile, so nothing is written twice. */
  async confirm(
    tx: DbTx,
    id: string,
    input: { value: HandoverValue; byEmployeeId: string; role: HandoverConfirmedRole; at: Date; late: boolean },
  ): Promise<boolean> {
    const done = await tx.handoverDuty.updateMany({
      where: { id, ...OPEN_DUTY },
      data: {
        confirmedValue: input.value,
        confirmedByEmployeeId: input.byEmployeeId,
        confirmedRole: input.role,
        confirmedAt: input.at,
        confirmedLate: input.late,
      },
    });

    return done.count === 1;
  }

  async cancel(tx: DbTx, id: string, reason: string, at: Date): Promise<boolean> {
    const done = await tx.handoverDuty.updateMany({
      where: { id, ...OPEN_DUTY },
      data: { cancelledAt: at, cancelReason: reason },
    });

    return done.count === 1;
  }

  /** Marks that the work went on without the confirmation, once: true only for the call that marked it. */
  async markProceeded(tx: DbTx, id: string, at: Date): Promise<boolean> {
    const done = await tx.handoverDuty.updateMany({
      where: { id, ...OPEN_DUTY, proceededUnconfirmedAt: null },
      data: { proceededUnconfirmedAt: at },
    });

    return done.count === 1;
  }

  /** Marks that the person was reminded the deadline passed, once: true only for the call that marked it. */
  async markOverdueNoticed(tx: DbTx, id: string, at: Date): Promise<boolean> {
    const done = await tx.handoverDuty.updateMany({
      where: { id, ...OPEN_DUTY, overdueNoticedAt: null },
      data: { overdueNoticedAt: at },
    });

    return done.count === 1;
  }

  /** The duties whose deadline passed and nobody was told, oldest first. */
  async listOverdueUnnoticed(today: BusinessDate, limit: number, tx?: DbTx): Promise<DutyRecord[]> {
    const rows = await (tx ?? this.prisma).handoverDuty.findMany({
      where: { ...OPEN_DUTY, overdueNoticedAt: null, dueOn: { lt: toDateColumn(today) } },
      orderBy: [{ dueOn: 'asc' }, { id: 'asc' }],
      take: limit,
    });

    return rows.map(toRecord);
  }

  /** The latest duty of each seat, a live one before a cancelled one (one statement for the ids, one for the rows). */
  async latestOfAssignments(assignmentIds: readonly string[], tx?: DbTx): Promise<DutyRecord[]> {
    if (assignmentIds.length === 0) return [];
    const client = tx ?? this.prisma;
    const ids = await client.$queryRaw<{ id: string }[]>`
      SELECT DISTINCT ON (assignment_id) id FROM handover_duties
       WHERE assignment_id = ANY(${[...assignmentIds]}::uuid[])
       ORDER BY assignment_id, (cancelled_at IS NULL) DESC, created_at DESC, id DESC`;
    const rows = await client.handoverDuty.findMany({
      where: { id: { in: ids.map((row) => row.id) } },
      orderBy: { id: 'asc' },
    });

    return rows.map(toRecord);
  }

  /** The seat of a duty, to name its plan in the detail. */
  async planOf(assignmentId: string, tx?: DbTx): Promise<string | null> {
    const row = await (tx ?? this.prisma).licenseAssignment.findUnique({
      where: { id: assignmentId },
      select: { planId: true },
    });

    return row?.planId ?? null;
  }
}
