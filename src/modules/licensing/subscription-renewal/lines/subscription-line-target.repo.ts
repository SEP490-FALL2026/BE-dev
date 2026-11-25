import { Injectable } from '@nestjs/common';
import { fromDateColumn, toDateColumn, type BusinessDate } from '../../../../core/business-date';
import { Prisma } from '../../../../generated/prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import type {
  LineTargetLockedBy,
  NewSubscriptionLineTarget,
  SubscriptionLineTargetRecord,
} from './subscription-renewal-lines.types';

type Row = Prisma.SubscriptionLineTargetGetPayload<object>;

const toRecord = (row: Row): SubscriptionLineTargetRecord => ({
  subscriptionLineId: row.subscriptionLineId,
  renewalOn: fromDateColumn(row.renewalOn),
  seatsNeeded: row.seatsNeeded,
  target: row.target,
  recordedQuantity: row.recordedQuantity,
  renewalId: row.renewalId,
  lockedAt: row.lockedAt,
  lockedBy: row.lockedBy as LineTargetLockedBy,
});

/**
 * The one writer of `subscription_line_targets`: the target of a line at one renewal day, locked once. A second lock of the same line and
 * day changes nothing (the first stays); the recorded quantity and the case are written once, from empty, by the decision.
 */
@Injectable()
export class SubscriptionLineTargetRepo {
  constructor(private readonly prisma: PrismaService) {}

  /** Locks the target; false when the line already has one for that day (the first lock stands). */
  async lockOnce(tx: DbTx, input: NewSubscriptionLineTarget): Promise<boolean> {
    const inserted = await tx.subscriptionLineTarget.createMany({
      data: [
        {
          subscriptionLineId: input.subscriptionLineId,
          renewalOn: toDateColumn(input.renewalOn),
          seatsNeeded: input.seatsNeeded,
          target: input.target,
          lockedAt: input.lockedAt,
          lockedBy: input.lockedBy,
        },
      ],
      skipDuplicates: true,
    });

    return inserted.count === 1;
  }

  async find(lineId: string, renewalOn: BusinessDate, tx?: DbTx): Promise<SubscriptionLineTargetRecord | null> {
    const row = await (tx ?? this.prisma).subscriptionLineTarget.findUnique({
      where: { subscriptionLineId_renewalOn: { subscriptionLineId: lineId, renewalOn: toDateColumn(renewalOn) } },
    });

    return row ? toRecord(row) : null;
  }

  /** The targets of these lines for one renewal day, by line. */
  async findMany(
    lineIds: readonly string[],
    renewalOn: BusinessDate,
    tx?: DbTx,
  ): Promise<Map<string, SubscriptionLineTargetRecord>> {
    if (lineIds.length === 0) return new Map();
    const rows = await (tx ?? this.prisma).subscriptionLineTarget.findMany({
      where: { subscriptionLineId: { in: [...lineIds] }, renewalOn: toDateColumn(renewalOn) },
    });

    return new Map(rows.map((row) => [row.subscriptionLineId, toRecord(row)]));
  }

  /** The targets a renewal case recorded. */
  async ofRenewal(renewalId: string, tx?: DbTx): Promise<SubscriptionLineTargetRecord[]> {
    const rows = await (tx ?? this.prisma).subscriptionLineTarget.findMany({
      where: { renewalId },
      orderBy: [{ renewalOn: 'asc' }, { subscriptionLineId: 'asc' }],
    });

    return rows.map(toRecord);
  }

  /** Records what the decision settled on a line and ties the target to its case, once; false when it was recorded already. */
  async recordDecision(
    tx: DbTx,
    lineId: string,
    renewalOn: BusinessDate,
    decision: { recordedQuantity: number; renewalId: string },
  ): Promise<boolean> {
    const done = await tx.subscriptionLineTarget.updateMany({
      where: {
        subscriptionLineId: lineId,
        renewalOn: toDateColumn(renewalOn),
        recordedQuantity: null,
        renewalId: null,
      },
      data: { recordedQuantity: decision.recordedQuantity, renewalId: decision.renewalId },
    });

    return done.count === 1;
  }
}
