import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../../core/business-date';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import { CatalogApi } from '../../../catalog/public/catalog.api';
import { SubscriptionPeriodApi } from '../../../catalog/public/subscription-period.api';
import type { SubscriptionPrice } from '../../../catalog/public/catalog.types';
import { SubscriptionRenewalRepo } from '../subscription-renewal.repo';
import { computeRealisedSaving, isFirstInvoiceMonthOfPeriod } from './renewal-savings.policy';
import { RenewalSavingsRepo, type RenewalSavingsCandidate } from './renewal-savings.repo';

export interface RecordRealisedSavingInput {
  newPeriodId: string;
  invoiceId: string;
  serviceMonth?: BusinessDate;
  now?: Date;
}

export type RecordRealisedSavingResult =
  { recorded: true; amountMinor: bigint; currency: string } | { recorded: false };

const isEligible = (candidate: RenewalSavingsCandidate | null): candidate is RenewalSavingsCandidate =>
  candidate !== null &&
  candidate.state === 'OUTCOME_RECORDED' &&
  candidate.outcome === 'AS_DECIDED' &&
  candidate.realisedSavingsRecordedAt === null;

const priceCurrencyOf = (price: SubscriptionPrice | null): string | null =>
  price ? (price.reportingUnitPrice ?? price.unitPrice).currency : null;

/**
 * Computes and writes one-time realised renewal savings when Finance confirms the first invoice of the renewed period
 * (or closes its SBF-11a discrepancy case, `W3-09`, `Q-G`). Auto-renewals without a `subscription_renewals` case,
 * second-month invoices, and repeat calls write nothing.
 */
@Injectable()
export class RenewalSavingsService {
  constructor(
    private readonly savings: RenewalSavingsRepo,
    private readonly renewals: SubscriptionRenewalRepo,
    private readonly periods: SubscriptionPeriodApi,
    private readonly catalog: CatalogApi,
  ) {}

  endingAmong(subscriptionIds: readonly string[], tx?: DbTx): Promise<Set<string>> {
    return this.renewals.endingAmong(subscriptionIds, tx);
  }

  async recordRealisedSaving(tx: DbTx, input: RecordRealisedSavingInput): Promise<RecordRealisedSavingResult> {
    const candidate = await this.savings.lockByNextSubscriptionId(tx, input.newPeriodId);
    if (!isEligible(candidate)) return { recorded: false };

    const saving = await this.computeSaving(tx, candidate.subscriptionId, input);
    if (!saving) return { recorded: false };

    const wrote = await this.savings.recordRealisedSaving(tx, {
      renewalId: candidate.id,
      minor: saving.amountMinor,
      currency: saving.currency,
      recordedAt: input.now ?? new Date(),
      invoiceId: input.invoiceId,
    });

    return wrote ? { recorded: true, amountMinor: saving.amountMinor, currency: saving.currency } : { recorded: false };
  }

  private async computeSaving(tx: DbTx, priorSubscriptionId: string, input: RecordRealisedSavingInput) {
    const facts = await this.periods.getPurchaseFacts([priorSubscriptionId, input.newPeriodId], tx);
    const prior = facts.find((f) => f.subscriptionId === priorSubscriptionId);
    const next = facts.find((f) => f.subscriptionId === input.newPeriodId);
    if (!prior || !next) return null;
    if (input.serviceMonth !== undefined && !isFirstInvoiceMonthOfPeriod(next.startDate, input.serviceMonth)) {
      return null;
    }

    const priorPrice = await this.catalog.getSubscriptionPrice(priorSubscriptionId, tx);
    const nextPrice = await this.catalog.getSubscriptionPrice(input.newPeriodId, tx);

    return computeRealisedSaving(
      {
        commitmentTermMonths: prior.commitmentTermMonths,
        purchasedQuantity: prior.purchasedQuantity,
        monthlyPriceMinor: prior.monthlyPriceMinor,
        currency: priceCurrencyOf(priorPrice),
      },
      {
        commitmentTermMonths: next.commitmentTermMonths,
        purchasedQuantity: next.purchasedQuantity,
        monthlyPriceMinor: next.monthlyPriceMinor,
        currency: priceCurrencyOf(nextPrice),
      },
    );
  }
}
