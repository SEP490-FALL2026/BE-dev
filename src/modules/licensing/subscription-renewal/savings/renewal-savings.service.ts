import { Injectable } from '@nestjs/common';
import { addDays, type BusinessDate } from '../../../../core/business-date';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import { CatalogApi } from '../../../catalog/public/catalog.api';
import { SeatLedgerApi } from '../../../catalog/public/seat-ledger.api';
import { SubscriptionPeriodApi } from '../../../catalog/public/subscription-period.api';
import type { SubscriptionPrice } from '../../../catalog/public/catalog.types';
import type { SubscriptionPurchaseFacts } from '../../../catalog/public/subscription-period.types';
import { SubscriptionRenewalRepo } from '../subscription-renewal.repo';
import {
  computePerLineRealisedSaving,
  computeRealisedSaving,
  isFirstInvoiceMonthOfPeriod,
} from './renewal-savings.policy';
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
 * (or closes its SBF-11a discrepancy case, `Q-G`). Auto-renewals without a `subscription_renewals` case,
 * second-month invoices, and repeat calls write nothing.
 */
@Injectable()
export class RenewalSavingsService {
  constructor(
    private readonly savings: RenewalSavingsRepo,
    private readonly renewals: SubscriptionRenewalRepo,
    private readonly periods: SubscriptionPeriodApi,
    private readonly catalog: CatalogApi,
    private readonly seatLedger: SeatLedgerApi,
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

    if (next.startDate !== null) {
      const perLine = await this.computePerLineSaving(tx, prior, next);
      if (perLine) return perLine;
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

  private async computePerLineSaving(tx: DbTx, prior: SubscriptionPurchaseFacts, next: SubscriptionPurchaseFacts) {
    const linesMap = await this.seatLedger.linesOfSubscriptions([prior.subscriptionId, next.subscriptionId], tx);
    const priorLines = (linesMap.get(prior.subscriptionId) ?? []).filter((l) => l.closedReason !== 'REMOVED');
    const nextLines = linesMap.get(next.subscriptionId) ?? [];
    if (priorLines.length === 0 || nextLines.length === 0 || next.startDate === null) return null;

    const defaultClosedOn = addDays(next.startDate, -1);
    const closedDates = priorLines.map((l) => l.closedOn ?? defaultClosedOn);
    const minPriorDay = closedDates.reduce((a, b) => (a <= b ? a : b));
    const maxPriorDay = closedDates.reduce((a, b) => (a >= b ? a : b));
    const priorSeatsMap = await this.seatLedger.seatsOnDays(
      priorLines.map((l) => l.id),
      minPriorDay,
      maxPriorDay,
      tx,
    );
    const nextSeatsMap = await this.seatLedger.seatsOnDays(
      nextLines.map((l) => l.id),
      next.startDate,
      next.startDate,
      tx,
    );
    const nextByOldId = new Map(
      nextLines.filter((l) => l.renewedFromLineId !== null).map((l) => [l.renewedFromLineId!, l]),
    );
    const pairs = priorLines.map((oldLine) => {
      const newLine =
        nextByOldId.get(oldLine.id) ??
        nextLines.find((l) => l.planId === oldLine.planId && l.renewedFromLineId === null);
      const closedDay = oldLine.closedOn ?? defaultClosedOn;
      const priorQty = priorSeatsMap.get(oldLine.id)?.get(closedDay) ?? prior.purchasedQuantity ?? 0;
      const nextQty = newLine ? (nextSeatsMap.get(newLine.id)?.get(next.startDate!) ?? next.purchasedQuantity ?? 0) : 0;

      return {
        priorQty,
        priorMonthlyMinor: oldLine.monthlyUnitPriceMinor,
        nextQty,
        nextMonthlyMinor: newLine ? newLine.monthlyUnitPriceMinor : 0n,
      };
    });

    return computePerLineRealisedSaving(prior.commitmentTermMonths, pairs);
  }
}
