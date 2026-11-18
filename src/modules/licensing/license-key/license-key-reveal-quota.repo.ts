import { Injectable } from '@nestjs/common';
import { DbTx } from '../../../infrastructure/database/transaction-runner';

export type RevealWindow = 'MINUTE' | 'DAY';

/** How many keys one account may open in a minute and in a day (`SEC-02`): a leaked token cannot empty the vault. */
export const REVEAL_LIMITS: Readonly<Record<RevealWindow, number>> = { MINUTE: 10, DAY: 200 };

/** The start of the window `at` falls in, in UTC, so every instance names the same row. */
export function windowStartOf(window: RevealWindow, at: Date): Date {
  const start = new Date(at);
  start.setUTCSeconds(0, 0);
  if (window === 'DAY') start.setUTCHours(0, 0, 0, 0);

  return start;
}

/** Owns `license_key_reveal_windows`: the one statement that gives a slot of a window, or says there is none. */
@Injectable()
export class LicenseKeyRevealQuotaRepo {
  /**
   * Takes one slot of the account's window in the caller's transaction: inserts the row, or raises it only while it is
   * under the limit. One statement decides, so two requests for the last slot meet at the row and only one gets it. A
   * window whose row is at the limit answers false and changes nothing.
   */
  async take(tx: DbTx, appUserId: string, window: RevealWindow, at: Date): Promise<boolean> {
    const rows = await tx.$queryRaw<{ count: number }[]>`
      INSERT INTO license_key_reveal_windows (app_user_id, window_kind, window_start, count)
      VALUES (${appUserId}::uuid, ${window}, ${windowStartOf(window, at)}, 1)
      ON CONFLICT (app_user_id, window_kind, window_start)
      DO UPDATE SET count = license_key_reveal_windows.count + 1
      WHERE license_key_reveal_windows.count < ${REVEAL_LIMITS[window]}
      RETURNING count`;

    return rows.length > 0;
  }

  /** Forgets the windows of days ago: the quota never reads them, and the table stays the size of two days of use. */
  async forgetOlderThan(tx: DbTx, before: Date): Promise<void> {
    await tx.$executeRaw`DELETE FROM license_key_reveal_windows WHERE window_start < ${before}`;
  }
}
