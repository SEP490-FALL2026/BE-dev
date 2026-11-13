import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { toRecord } from '../offboarding/offboarding.repo';
import type { OffboardingRecord } from '../offboarding/offboarding.types';

/**
 * The writes of the end of a departure on `offboarding_cases`, a table of this module: item (1b) of `BM-08`, the lock of the mailbox for good,
 * and (with the closing of the case) what the system does after it. The case is read and locked by the frame of the commands, or by the
 * sweeper, before any of these runs.
 */
@Injectable()
export class DepartureClosureRepo {
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
