import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { fromDateColumn, toDateColumn, type BusinessDate } from '../../../core/business-date';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { offboardingChangeDetailJson, type ChangeDetail } from '../personnel-change-detail.json';

/** A departure a pass may act on, named by its id and the employee, whom the pass locks before the case. */
export interface DepartureRef {
  id: string;
  employeeId: string;
}

/** A departure that is not cancelled or closed, as the sweepers of the block moment read it. */
export interface OpenDeparture {
  id: string;
  organizationId: string;
  employeeId: string;
  departmentId: string | null;
  state: 'HANDING_OVER' | 'LEFT';
  accessBlockMode: 'WITH_LAST_DAY' | 'BLOCK_NOW';
  lastWorkingDay: BusinessDate;
  leftOn: BusinessDate | null;
  revocationDueOn: BusinessDate | null;
  blockAnnouncedAt: Date | null;
  accountLocked: boolean;
  recordedAt: Date;
}

const SELECT = {
  id: true,
  organizationId: true,
  employeeId: true,
  departmentId: true,
  state: true,
  accessBlockMode: true,
  lastWorkingDay: true,
  leftOn: true,
  revocationDueOn: true,
  blockAnnouncedAt: true,
  accountLockAt: true,
  recordedAt: true,
} as const;

type Row = {
  id: string;
  organizationId: string;
  employeeId: string;
  departmentId: string | null;
  state: string;
  accessBlockMode: 'WITH_LAST_DAY' | 'BLOCK_NOW';
  lastWorkingDay: Date;
  leftOn: Date | null;
  revocationDueOn: Date | null;
  blockAnnouncedAt: Date | null;
  accountLockAt: Date | null;
  recordedAt: Date;
};

const toDeparture = (row: Row): OpenDeparture => ({
  id: row.id,
  organizationId: row.organizationId,
  employeeId: row.employeeId,
  departmentId: row.departmentId,
  // The filters of this repo leave out a cancelled case, so what is read is what the type says.
  state: row.state as OpenDeparture['state'],
  accessBlockMode: row.accessBlockMode,
  lastWorkingDay: fromDateColumn(row.lastWorkingDay),
  leftOn: row.leftOn ? fromDateColumn(row.leftOn) : null,
  revocationDueOn: row.revocationDueOn ? fromDateColumn(row.revocationDueOn) : null,
  blockAnnouncedAt: row.blockAnnouncedAt,
  accountLocked: row.accountLockAt !== null,
  recordedAt: row.recordedAt,
});

/**
 * The reads and writes of the sweepers of the block moment (`QĐ-110b`, `QĐ-110d`) on `offboarding_cases`, a table of this module. A pass reads
 * the ids of the departures that may be due without a lock; the one that acts on a case takes its row `FOR UPDATE` and reads it again, so
 * a case cancelled, closed or announced meanwhile is seen as it is.
 */
@Injectable()
export class BlockMomentRepo {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * One page, by id after `afterId`, of the open departures nobody announced whose block may be in force on `today`: a person marked as
   * left, a departure blocked now, or a last working day before today. Whether the block is really in force is the block's to say
   * (`identity_access`), so the caller asks it under the lock of the case.
   */
  async pageUnannounced(today: BusinessDate, page: { afterId: string | null; take: number }): Promise<DepartureRef[]> {
    const rows = await this.prisma.offboardingCase.findMany({
      where: {
        state: { in: ['HANDING_OVER', 'LEFT'] },
        closedAt: null,
        blockAnnouncedAt: null,
        OR: [{ state: 'LEFT' }, { accessBlockMode: 'BLOCK_NOW' }, { lastWorkingDay: { lt: toDateColumn(today) } }],
        ...(page.afterId ? { id: { gt: page.afterId } } : {}),
      },
      orderBy: { id: 'asc' },
      take: page.take,
      select: { id: true, employeeId: true },
    });

    return rows;
  }

  /** One page, by id after `afterId`, of the open departures blocked now whose lock of the company account is not written. */
  async pageLockMissing(page: { afterId: string | null; take: number }): Promise<DepartureRef[]> {
    const rows = await this.prisma.offboardingCase.findMany({
      where: {
        state: { in: ['HANDING_OVER', 'LEFT'] },
        closedAt: null,
        accessBlockMode: 'BLOCK_NOW',
        accountLockAt: null,
        accountLockOverdueAt: null,
        ...(page.afterId ? { id: { gt: page.afterId } } : {}),
      },
      orderBy: { id: 'asc' },
      take: page.take,
      select: { id: true, employeeId: true },
    });

    return rows;
  }

  /** The row held `FOR UPDATE` until the transaction ends and read after the lock; null when it is gone, cancelled or closed. */
  async lockOpen(tx: DbTx, id: string): Promise<OpenDeparture | null> {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM offboarding_cases
       WHERE id = ${id}::uuid AND state IN ('HANDING_OVER', 'LEFT') AND closed_at IS NULL FOR UPDATE`;
    if (locked.length === 0) return null;
    const row = await tx.offboardingCase.findUnique({ where: { id }, select: SELECT });

    return row && toDeparture(row);
  }

  /**
   * Marks the departure as announced and, when it has no deadline of revocation yet, gives it `dueOn`. A deadline already on the case is
   * never changed: the day the IT Admin was promised when the case was written stands (D-47). False when it was announced meanwhile.
   */
  async markAnnounced(tx: DbTx, id: string, at: Date, dueOn: BusinessDate): Promise<boolean> {
    const done = await tx.offboardingCase.updateMany({
      where: { id, blockAnnouncedAt: null },
      data: { blockAnnouncedAt: at },
    });
    if (done.count !== 1) return false;
    await tx.offboardingCase.updateMany({
      where: { id, revocationDueOn: null },
      data: { revocationDueOn: toDateColumn(dueOn) },
    });

    return true;
  }

  /** Marks that the lock of the account was told as late, once for the case whoever was told; false when it was marked meanwhile. */
  async markLockOverdueTold(tx: DbTx, id: string, at: Date): Promise<boolean> {
    const done = await tx.offboardingCase.updateMany({
      where: { id, accountLockOverdueAt: null },
      data: { accountLockOverdueAt: at },
    });

    return done.count === 1;
  }

  /** The line of the log of the case that says the system blocked the access: no account and no ticket wrote it. */
  async insertAccessBlocked(tx: DbTx, caseId: string, detail: ChangeDetail): Promise<void> {
    await tx.offboardingCaseChange.create({
      data: {
        id: randomUUID(),
        caseId,
        kind: 'ACCESS_BLOCKED',
        detail: offboardingChangeDetailJson.encode(detail),
        changedByAppUserId: null,
        changedByTicketId: null,
      },
    });
  }
}
