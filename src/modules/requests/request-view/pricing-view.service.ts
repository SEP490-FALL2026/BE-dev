import { Injectable } from '@nestjs/common';
import { formatAmount } from '../../../core/money/money';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { FinanceApi } from '../../finance/public/finance.api';
import type { TaxEstimateBasis, TaxGroup } from '../../finance/public/finance.types';
import type { PricingRecord } from '../access-request/access-request.types';
import { monthlyPriceOf } from '../access-request/pricing.policy';

export interface MoneyView {
  amount: string;
  currency: string;
}

/** What the request costs as a reader sees it: the amounts written with the minor digits of their currency. */
export interface PricingView {
  status: 'NOT_APPLICABLE' | 'PRICED' | 'MISSING';
  missingReason: 'NO_PRICED_SUBSCRIPTION' | 'CYCLE_UNKNOWN' | 'AMOUNT_TOO_LARGE' | 'AWAITING_QUOTE' | null;
  amount: MoneyView | null;
  unitPrice: MoneyView | null;
  billingCycle: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' | 'OTHER' | null;
  /** How the price is counted: by the month (`RECURRING`) or once (`ONE_TIME`, a key or a perpetual license). */
  kind: 'RECURRING' | 'ONE_TIME' | null;
  /** The months of the year the amount covers; null for a one-time price, 0 for a right that begins in a later year (`QĐ-109b`). */
  months: number | null;
  /** What one person costs a month, for showing; null for a one-time price. */
  monthlyPrice: MoneyView | null;
  /** The first year of a request to go on using that begins in the year after the day it is judged, shown and never held (`QĐ-109b`). */
  nextYearAmount: MoneyView | null;
}

/**
 * The four numbers a reader sees of the tax on a price (`FR-5.13`, `QĐ-60a`): the price before tax, the tax with the
 * part that is deducted and the part that is a real cost, the cost estimated from them, and what is payable in all. All
 * are estimates, and the label says whether the vendor has a tax profile or the default stood in for it (`QĐ-60b`).
 */
export interface CostEstimateView {
  label: 'ESTIMATE' | 'ESTIMATE_NO_PROFILE';
  basis: TaxEstimateBasis;
  taxGroup: TaxGroup;
  preTax: MoneyView;
  tax: MoneyView;
  deductibleTax: MoneyView;
  nonDeductibleTax: MoneyView;
  estimatedCost: MoneyView;
  totalPayable: MoneyView;
}

/** Writes the money and the estimated tax of a request for a reader; one read of the currencies, never one per amount. */
@Injectable()
export class PricingViewService {
  constructor(private readonly finance: FinanceApi) {}

  async view(pricing: PricingRecord): Promise<PricingView> {
    const units = await this.minorUnits(pricing.amount?.currency ?? pricing.unitPrice?.currency);
    const money = (value: { amountMinor: bigint; currency: string } | null): MoneyView | null =>
      value && { amount: formatAmount(value.amountMinor, units), currency: value.currency };

    return {
      status: pricing.status,
      missingReason: pricing.missingReason,
      amount: money(pricing.amount),
      unitPrice: money(pricing.unitPrice),
      billingCycle: pricing.billingCycle,
      kind: pricing.kind,
      months: pricing.amountMonths,
      monthlyPrice:
        pricing.kind === 'RECURRING' && pricing.unitPrice
          ? money(monthlyPriceOf({ unitPrice: pricing.unitPrice, billingCycle: pricing.billingCycle }))
          : null,
      nextYearAmount: money(pricing.nextYearAmount),
    };
  }

  /** One amount written with the minor digits of its currency. */
  async moneyView(money: { amountMinor: bigint; currency: string }): Promise<MoneyView> {
    return { amount: formatAmount(money.amountMinor, await this.minorUnits(money.currency)), currency: money.currency };
  }

  /**
   * The estimated tax of a priced request, or null when it has no amount or the software has no vendor to hold a tax
   * profile. Nothing is stored: the estimate is read again from the profile the vendor has when it is asked for.
   */
  async costEstimate(pricing: PricingRecord, vendorId: string | null, tx?: DbTx): Promise<CostEstimateView | null> {
    if (pricing.status !== 'PRICED' || pricing.amount === null || vendorId === null) return null;

    const net = pricing.amount;
    const estimate = await this.finance.estimateTax(vendorId, net.amountMinor, tx);
    const units = await this.minorUnits(net.currency);
    const show = (minor: bigint): MoneyView => ({ amount: formatAmount(minor, units), currency: net.currency });

    return {
      label: estimate.basis === 'PROFILE' ? 'ESTIMATE' : 'ESTIMATE_NO_PROFILE',
      basis: estimate.basis,
      taxGroup: estimate.group,
      preTax: show(net.amountMinor),
      tax: show(estimate.taxMinor),
      deductibleTax: show(estimate.deductibleMinor),
      nonDeductibleTax: show(estimate.nonDeductibleMinor),
      estimatedCost: show(estimate.estimatedCostMinor),
      totalPayable: show(net.amountMinor + estimate.taxMinor),
    };
  }

  private async minorUnits(code: string | undefined): Promise<number> {
    return code ? ((await this.finance.findCurrency(code))?.minorUnit ?? 2) : 2;
  }
}
