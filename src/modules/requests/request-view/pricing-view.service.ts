import { Injectable } from '@nestjs/common';
import { formatAmount } from '../../../core/money/money';
import { monthsBeginningIn, type TermRun } from '../../../core/term-limit';
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
 * What a request costs by the year as a reader of the request or the preview sees it (`QĐ-111j`, `QĐ-111k`, R-39, R-46), before tax: the
 * months that begin in the year it is judged in, and the part of the year after, which is an estimate: it is kept when the spend is approved and
 * becomes the commitment of 01/01. `months` is the months that have begun by the end of the term, the cut at the end of a contract (`termCutAt`) included;
 * null for a right with no end. A price that is not by the month (a key) or that is missing has no such cost.
 */
export interface CostView {
  currentYear: { year: number; months: number | null; amount: MoneyView };
  nextYear: { from: string; months: number | null; amount: MoneyView; estimate: true } | null;
  /** The last day of the contract when it cut the term short; null when nothing was cut. */
  termCutAt: string | null;
  months: number | null;
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

  /** The cost by the year of a priced request, with the run its time of use has (`QĐ-111j`); null when nothing is priced by the month. */
  async costView(pricing: PricingRecord, run: TermRun | null): Promise<CostView | null> {
    if (pricing.status !== 'PRICED' || pricing.amount === null || pricing.budgetYear === null) return null;
    if (pricing.kind !== 'RECURRING') return null;
    const year = pricing.budgetYear;
    const { nextYearAmount } = pricing;
    const nextMonths =
      run === null
        ? null
        : run.end === null
          ? 12
          : monthsBeginningIn({ start: run.start, end: run.end, year: year + 1 });

    return {
      currentYear: { year, months: pricing.amountMonths, amount: await this.moneyView(pricing.amount) },
      nextYear: nextYearAmount && {
        from: `${year + 1}-01-01`,
        months: nextMonths,
        amount: await this.moneyView(nextYearAmount),
        estimate: true,
      },
      termCutAt: run?.cutAt ?? null,
      months: run?.startedMonths ?? null,
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
