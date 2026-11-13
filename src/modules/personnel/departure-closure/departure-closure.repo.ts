import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';

/**
 * The writes of the end of a departure on `offboarding_cases`, a table of this module: item (1b) of `BM-08`, the lock of the mailbox for good,
 * and (with the closing of the case) what the system does after it. The case is read and locked by the frame of the commands, or by the
 * sweeper, before any of these runs.
 */
@Injectable()
export class DepartureClosureRepo {
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
