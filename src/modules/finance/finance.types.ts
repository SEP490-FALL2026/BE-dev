import type { BusinessDate } from '../../core/business-date';
import type { TaxEstimate } from '../../core/money/tax-estimate';
import type { ScaledRate } from '../../core/money/rate';

export interface CurrencyRecord {
  code: string;
  name: string;
  /** Minor digits of the currency: 0 for VND, 2 for USD (ADR-0007). */
  minorUnit: number;
}

/** One manually entered rate: units of the reporting currency for one unit of `currency` on `rateDate`. */
export interface ExchangeRateRecord {
  id: string;
  currency: string;
  rateDate: BusinessDate;
  rate: ScaledRate;
  createdAt: Date;
}

export interface ExchangeRateListFilter {
  currency?: string;
  from?: BusinessDate;
  to?: BusinessDate;
  skip: number;
  take: number;
}

/** Where the rate of a snapshot came from. `SAME_CURRENCY` is rate 1 for the reporting currency itself. */
export type ConversionRateSource = 'MANUAL' | 'SAME_CURRENCY';

/** What a money value was worth in the reporting currency when it was recorded; frozen, never recomputed (INV-04). */
export interface ConversionSnapshot {
  rate: ScaledRate;
  rateDate: BusinessDate;
  rateSource: ConversionRateSource;
  reportingAmountMinor: bigint;
  reportingCurrency: string;
  /** The rate row used; null for `SAME_CURRENCY`. */
  exchangeRateId: string | null;
}

/** `MISSING_RATE`: no rate for that currency on that very day — never the nearest or latest one (QĐ-42b). */
export type SnapshotResult = { status: 'CONVERTED'; snapshot: ConversionSnapshot } | { status: 'MISSING_RATE' };

// The tax profile shapes other modules read (the catalog vendor routes), as the public surface of the module.
export type TaxGroup = 'T1' | 'T2' | 'T3';
export type TaxPayer = 'VENDOR_COLLECTS' | 'BUYER_REMITS';
export type TaxEstimateBasis = 'PROFILE' | 'DEFAULT_NO_PROFILE';
export interface TaxLineInput {
  taxType: string;
  ratePercent: string;
  deductible: boolean;
}
export interface TaxLineView {
  taxType: string;
  ratePercent: string;
  deductible: boolean;
  payer: TaxPayer;
}
/** A profile as it is answered: rates as percentages, the payer each line implies, who declared it and when. */
export interface TaxProfileView {
  group: TaxGroup;
  lines: TaxLineView[];
  version: number;
  declaredBy: string;
  declaredAt: Date;
}
export interface DefaultTaxProfileView {
  group: TaxGroup;
  lines: TaxLineView[];
}

export interface TaxEstimateResult extends TaxEstimate {
  basis: TaxEstimateBasis;
  group: TaxGroup;
}
