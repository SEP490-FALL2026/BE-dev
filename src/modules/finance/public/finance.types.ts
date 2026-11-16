import type { BusinessDate } from '../../../core/business-date';
import type { TaxEstimate } from '../../../core/money/tax-estimate';
import type { ScaledRate } from '../../../core/money/rate';

export interface CurrencyRecord {
  code: string;
  name: string;
  /** Minor digits of the currency: 0 for VND, 2 for USD (ADR-0007). */
  minorUnit: number;
}

/**
 * What a money value was worth in the reporting currency when it was recorded; frozen, never recomputed (INV-04). Every amount is in the
 * reporting currency (`QĐ-111an`), so the snapshot is always the one of the same currency: rate 1, `SAME_CURRENCY`, no rate row.
 */
export interface ConversionSnapshot {
  rate: ScaledRate;
  rateDate: BusinessDate;
  rateSource: 'SAME_CURRENCY';
  reportingAmountMinor: bigint;
  reportingCurrency: string;
  exchangeRateId: null;
}

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
