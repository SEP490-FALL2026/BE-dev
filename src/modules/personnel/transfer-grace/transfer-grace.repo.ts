import { Injectable } from '@nestjs/common';
import { toDateColumn, type BusinessDate } from '../../../core/business-date';
import { Prisma } from '../../../generated/prisma/client';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { snapshotBeforeJson, type TransferSnapshotBefore } from './transfer-snapshot.json';

/**
 * Writes the grace of a transfer that took effect (`QĐ-110p`): the one place the columns `grace_ends_on`, `grace_reminder_on` and
 * `snapshot_before` are written. The table keeps the transfer itself (`TransferRepo`); the guard of the table lets each of these columns be
 * written once, and the statements here ask for a transfer that has none yet, so doing them twice changes nothing.
 */
@Injectable()
export class TransferGraceRepo {
  /** Opens the grace of the transfer: its last day and its reminder. False when it has one already, is not effective, or is closed. */
  async claim(tx: DbTx, id: string, grace: { endsOn: BusinessDate; reminderOn: BusinessDate }): Promise<boolean> {
    const { count } = await tx.departmentTransfer.updateMany({
      where: { id, status: 'EFFECTIVE', closedAt: null, graceEndsOn: null },
      data: { graceEndsOn: toDateColumn(grace.endsOn), graceReminderOn: toDateColumn(grace.reminderOn) },
    });

    return count === 1;
  }

  /** Keeps the picture of the rights before, once (the transfer that took effect before the grace existed never gets one). */
  async keepSnapshot(tx: DbTx, id: string, snapshot: TransferSnapshotBefore): Promise<void> {
    await tx.departmentTransfer.updateMany({
      where: { id, snapshotBefore: { equals: Prisma.DbNull } },
      data: { snapshotBefore: snapshotBeforeJson.encode(snapshot) },
    });
  }
}
