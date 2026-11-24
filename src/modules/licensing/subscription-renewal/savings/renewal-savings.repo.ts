import { Injectable } from '@nestjs/common';
import type { RenewalChoice, RenewalOutcome, RenewalState } from '../../../../generated/prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';

export interface RenewalSavingsCandidate {
  id: string;
  organizationId: string;
  subscriptionId: string;
  nextSubscriptionId: string | null;
  state: RenewalState;
  outcome: RenewalOutcome | null;
  decidedChoice: RenewalChoice | null;
  decidedQuantity: number | null;
  realisedSavingsMinor: bigint | null;
  realisedSavingsCurrency: string | null;
  realisedSavingsRecordedAt: Date | null;
  realisedSavingsInvoiceId: string | null;
}

export interface RecordRealisedSavingsInput {
  renewalId: string;
  minor: bigint;
  currency: string;
  recordedAt: Date;
  invoiceId: string;
}

interface RawCandidateRow {
  id: string;
  organization_id: string;
  subscription_id: string;
  next_subscription_id: string | null;
  state: RenewalState;
  outcome: RenewalOutcome | null;
  decided_choice: RenewalChoice | null;
  decided_quantity: number | null;
  realised_savings_minor: bigint | string | null;
  realised_savings_currency: string | null;
  realised_savings_recorded_at: Date | null;
  realised_savings_invoice_id: string | null;
}

const candidateSelect = {
  id: true,
  organizationId: true,
  subscriptionId: true,
  nextSubscriptionId: true,
  state: true,
  outcome: true,
  decidedChoice: true,
  decidedQuantity: true,
  realisedSavingsMinor: true,
  realisedSavingsCurrency: true,
  realisedSavingsRecordedAt: true,
  realisedSavingsInvoiceId: true,
} as const;

const mapRawCandidate = (row: RawCandidateRow): RenewalSavingsCandidate => ({
  id: row.id,
  organizationId: row.organization_id,
  subscriptionId: row.subscription_id,
  nextSubscriptionId: row.next_subscription_id,
  state: row.state,
  outcome: row.outcome,
  decidedChoice: row.decided_choice,
  decidedQuantity: row.decided_quantity,
  realisedSavingsMinor: row.realised_savings_minor === null ? null : BigInt(row.realised_savings_minor),
  realisedSavingsCurrency: row.realised_savings_currency,
  realisedSavingsRecordedAt: row.realised_savings_recorded_at,
  realisedSavingsInvoiceId: row.realised_savings_invoice_id,
});

/**
 * Reads and records one-time realised renewal savings when Finance records the first confirmed invoice
 * of a renewal's `next_subscription_id`. Protected in DB by `subscription_renewals_savings_is_final`.
 */
@Injectable()
export class RenewalSavingsRepo {
  constructor(private readonly prisma: PrismaService) {}

  findByNextSubscriptionId(nextSubscriptionId: string, tx?: DbTx): Promise<RenewalSavingsCandidate | null> {
    return (tx ?? this.prisma).subscriptionRenewal.findFirst({
      where: { nextSubscriptionId },
      select: candidateSelect,
    });
  }

  async lockByNextSubscriptionId(tx: DbTx, nextSubscriptionId: string): Promise<RenewalSavingsCandidate | null> {
    const rows = await tx.$queryRaw<RawCandidateRow[]>`
      SELECT id, organization_id, subscription_id, next_subscription_id, state, outcome,
             decided_choice, decided_quantity, realised_savings_minor::text AS realised_savings_minor,
             realised_savings_currency, realised_savings_recorded_at, realised_savings_invoice_id
        FROM subscription_renewals
       WHERE next_subscription_id = ${nextSubscriptionId}::uuid
         FOR UPDATE`;
    return rows[0] ? mapRawCandidate(rows[0]) : null;
  }

  /**
   * Writes realised savings once (`OUTCOME_RECORDED` + `AS_DECIDED` + unrecorded).
   * Returns `true` when written, `false` when already recorded or ineligible.
   */
  async recordRealisedSaving(tx: DbTx, input: RecordRealisedSavingsInput): Promise<boolean> {
    const result = await tx.subscriptionRenewal.updateMany({
      where: {
        id: input.renewalId,
        state: 'OUTCOME_RECORDED',
        outcome: 'AS_DECIDED',
        nextSubscriptionId: { not: null },
        realisedSavingsMinor: null,
        realisedSavingsRecordedAt: null,
      },
      data: {
        realisedSavingsMinor: input.minor,
        realisedSavingsCurrency: input.currency,
        realisedSavingsRecordedAt: input.recordedAt,
        realisedSavingsInvoiceId: input.invoiceId,
      },
    });
    return result.count === 1;
  }
}
