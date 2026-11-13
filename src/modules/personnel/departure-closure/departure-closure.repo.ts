import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { toRecord } from '../offboarding/offboarding.repo';
import type { OffboardingRecord } from '../offboarding/offboarding.types';

/**
 * The writes of the end of a departure on `offboarding_cases`, a table of this module: item (1b) of `BM-08`, the lock of the mailbox for good,
 * and the closing of the case by the system. The case is read and locked by the frame of the commands, by the listener of the last revocation
 * or by the sweeper before any write runs.
 */
@Injectable()
export class DepartureClosureRepo {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The open departure of a person (a handover under way or a departure that is not closed), held `FOR UPDATE SKIP LOCKED`: the caller already
   * holds the lock of a task of revocation (the order of locks of the IT Admin who works it), so it never waits for the case, which another
   * command may hold while it asks for that task. Null when the person has none or the case is held by someone else, which the hourly pass
   * settles later.
   */
  async lockOpenOfEmployee(tx: DbTx, employeeId: string): Promise<OffboardingRecord | null> {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM offboarding_cases
       WHERE employee_id = ${employeeId}::uuid AND state IN ('HANDING_OVER', 'LEFT') AND closed_at IS NULL
       ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED`;
    if (locked.length === 0) return null;
    const row = await tx.offboardingCase.findUnique({ where: { id: locked[0].id } });

    return row && toRecord(row);
  }

  /**
   * One page, by id after `afterId`, of the departures that are not closed, have (1a) written and not (1b): the ones the system may still write
   * (1b) for, from the checklist a K1 revocation kept (D-72). Whether one is due is asked of `licensing` for the whole page.
   */
  async pageAwaitingMailboxLock(page: {
    afterId: string | null;
    take: number;
  }): Promise<{ id: string; employeeId: string }[]> {
    return this.prisma.offboardingCase.findMany({
      where: {
        state: { in: ['HANDING_OVER', 'LEFT'] },
        closedAt: null,
        accountLockAt: { not: null },
        mailboxLockAt: null,
        ...(page.afterId ? { id: { gt: page.afterId } } : {}),
      },
      orderBy: { id: 'asc' },
      take: page.take,
      select: { id: true, employeeId: true },
    });
  }

  /** One page, by id after `afterId`, of the departures that have left, are not closed and have (1b) written: the ones the pass may close. */
  async pageClosable(page: { afterId: string | null; take: number }): Promise<{ id: string; employeeId: string }[]> {
    return this.prisma.offboardingCase.findMany({
      where: {
        state: 'LEFT',
        closedAt: null,
        mailboxLockAt: { not: null },
        ...(page.afterId ? { id: { gt: page.afterId } } : {}),
      },
      orderBy: { id: 'asc' },
      take: page.take,
      select: { id: true, employeeId: true },
    });
  }

  /** The departure held `FOR UPDATE` until the transaction ends (the caller holds the employee first), read after the lock; null when it is gone, cancelled or closed. */
  async lockOpen(tx: DbTx, id: string): Promise<OffboardingRecord | null> {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM offboarding_cases WHERE id = ${id}::uuid AND state IN ('HANDING_OVER', 'LEFT') AND closed_at IS NULL FOR UPDATE`;
    if (locked.length === 0) return null;
    const row = await tx.offboardingCase.findUnique({ where: { id } });

    return row && toRecord(row);
  }

  /** Closes the case once, for the system (no account): false when it was closed meanwhile or still lacks a lock. */
  async closeBySystem(tx: DbTx, id: string, at: Date): Promise<boolean> {
    const done = await tx.offboardingCase.updateMany({
      where: {
        id,
        state: 'LEFT',
        closedAt: null,
        accountLockAt: { not: null },
        mailboxLockAt: { not: null },
      },
      data: { closedAt: at, closedByAppUserId: null },
    });

    return done.count === 1;
  }

  /**
   * Writes (1b) once, after (1a), for a case that is not closed; `appUserId` is null when the system writes it. False when it was written
   * meanwhile, or the case is not in the state that takes it.
   */
  async recordMailboxLock(
    tx: DbTx,
    id: string,
    by: { appUserId: string | null; note: string | null; at: Date },
  ): Promise<boolean> {
    const done = await tx.offboardingCase.updateMany({
      where: {
        id,
        state: { in: ['HANDING_OVER', 'LEFT'] },
        accountLockAt: { not: null },
        mailboxLockAt: null,
        closedAt: null,
      },
      data: { mailboxLockAt: by.at, mailboxLockByAppUserId: by.appUserId, mailboxLockNote: by.note },
    });

    return done.count === 1;
  }
}
