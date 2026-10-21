import { Injectable } from '@nestjs/common';
import { Page } from '../../../core/application/pagination';
import { formatAmount } from '../../../core/money/money';
import { CurrencyNotSupportedError } from '../../../core/money/money.errors';
import { formatRatePercent } from '../../../core/money/tax-estimate';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { FinanceService } from '../../finance/finance.service';
import type {
  DefaultTaxProfileView,
  TaxEstimateBasis,
  TaxGroup,
  TaxLineInput,
  TaxPayer,
  TaxProfileView,
} from '../../finance/finance.types';
import { VendorQueryService } from './vendor-query.service';

export interface TaxEstimateView {
  basis: TaxEstimateBasis;
  label: 'ESTIMATE' | 'ESTIMATE_NO_PROFILE';
  group: TaxGroup;
  currency: string;
  netAmount: string;
  taxAmount: string;
  deductibleTaxAmount: string;
  nonDeductibleTaxAmount: string;
  estimatedCost: string;
  lines: Array<{ taxType: string; ratePercent: string; deductible: boolean; payer: TaxPayer; taxAmount: string }>;
}

/**
 * The tax profile of a vendor as the catalog routes serve it: the vendor is checked here (it is a catalog table), the
 * profile and the estimate come from finance. The estimate is a read: nothing is stored and nothing is a tax payable.
 */
@Injectable()
export class VendorTaxService {
  constructor(
    private readonly vendors: VendorQueryService,
    private readonly finance: FinanceService,
  ) {}

  /** Throws VendorNotFoundError. */
  async get(vendorId: string): Promise<{
    vendorId: string;
    status: 'DECLARED' | 'MISSING';
    profile: TaxProfileView | null;
    defaultProfile: DefaultTaxProfileView;
  }> {
    await this.vendors.require(vendorId);

    return { vendorId, ...(await this.finance.taxProfileOf(vendorId)) };
  }

  /** Throws VendorNotFoundError and the line errors of finance. A profile equal to the current one is `changed: false`. */
  async declare(
    actor: AuthenticatedPrincipal,
    vendorId: string,
    input: { group?: TaxGroup; lines: TaxLineInput[] },
  ): Promise<{ profile: TaxProfileView; changed: boolean }> {
    await this.vendors.require(vendorId);

    return this.finance.declareTaxProfile(actor, vendorId, input);
  }

  async history(vendorId: string, query: { page: number; pageSize: number }): Promise<Page<TaxProfileView>> {
    await this.vendors.require(vendorId);

    return this.finance.taxProfileHistory(vendorId, query);
  }

  /**
   * Throws VendorNotFoundError, CurrencyNotSupportedError and the money errors of `core/money` (a negative price is out
   * of range). The answer says whether it came from the vendor's profile or from the default one.
   */
  async estimate(vendorId: string, input: { netAmount: string; currency: string }): Promise<TaxEstimateView> {
    await this.vendors.require(vendorId);
    const money = await this.finance.parseMoney({ amount: input.netAmount, currency: input.currency });
    const currency = await this.finance.findCurrency(money.currency);
    if (!currency) throw new CurrencyNotSupportedError(money.currency);

    const estimate = await this.finance.estimateTax(vendorId, money.amountMinor);
    const show = (minor: bigint): string => formatAmount(minor, currency.minorUnit);
    const payer: TaxPayer = estimate.group === 'T2' ? 'BUYER_REMITS' : 'VENDOR_COLLECTS';

    return {
      basis: estimate.basis,
      label: estimate.basis === 'PROFILE' ? 'ESTIMATE' : 'ESTIMATE_NO_PROFILE',
      group: estimate.group,
      currency: currency.code,
      netAmount: show(money.amountMinor),
      taxAmount: show(estimate.taxMinor),
      deductibleTaxAmount: show(estimate.deductibleMinor),
      nonDeductibleTaxAmount: show(estimate.nonDeductibleMinor),
      estimatedCost: show(estimate.estimatedCostMinor),
      lines: estimate.lines.map((line) => ({
        taxType: line.taxType,
        ratePercent: formatRatePercent(line.rateBp),
        deductible: line.deductible,
        payer,
        taxAmount: show(line.taxMinor),
      })),
    };
  }
}
