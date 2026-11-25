import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';

/** What a case says beyond its decision about being recorded by the system and about the least seats across the workspace (W3-16). */
export interface RenewalAutoFacts {
  /** The system recorded the case at the milestone with nobody deciding (its decider role is SYSTEM). */
  autoRecorded: boolean;
  /** The line that holds the least seats across the workspace for the next period, when the proposal said so. */
  minimumTotalHolderLineId: string | null;
  minimumTotalNote: string | null;
}

/**
 * Reads and writes the three columns a renewal case adds in W3-16 and nothing else of it: `auto_recorded`, `minimum_total_holder_line_id`
 * and `minimum_total_note`. The case itself is written by `SubscriptionRenewalRepo`, which stays the one writer of its stages; these
 * columns are not frozen by the database guard of the proposal and the decision, so they can be written in the transaction of either.
 */
@Injectable()
export class SubscriptionRenewalAutoRepo {
  constructor(private readonly prisma: PrismaService) {}

  /** Writes the three columns of a case. */
  async write(tx: DbTx, renewalId: string, facts: RenewalAutoFacts): Promise<void> {
    await tx.subscriptionRenewal.update({
      where: { id: renewalId },
      data: {
        autoRecorded: facts.autoRecorded,
        minimumTotalHolderLineId: facts.minimumTotalHolderLineId,
        minimumTotalNote: facts.minimumTotalNote,
      },
    });
  }

  /** The facts of these cases, by case; a case that does not exist is absent. */
  async ofRenewals(renewalIds: readonly string[], tx?: DbTx): Promise<Map<string, RenewalAutoFacts>> {
    if (renewalIds.length === 0) return new Map();
    const rows = await (tx ?? this.prisma).subscriptionRenewal.findMany({
      where: { id: { in: [...renewalIds] } },
      select: { id: true, autoRecorded: true, minimumTotalHolderLineId: true, minimumTotalNote: true },
    });

    return new Map(
      rows.map((row) => [
        row.id,
        {
          autoRecorded: row.autoRecorded,
          minimumTotalHolderLineId: row.minimumTotalHolderLineId,
          minimumTotalNote: row.minimumTotalNote,
        },
      ]),
    );
  }
}
