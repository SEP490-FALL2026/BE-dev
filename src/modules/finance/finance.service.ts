import { Injectable } from '@nestjs/common';
import { isBusinessDate, type BusinessDate } from '../../core/business-date';
import { convertToReporting } from '../../core/money/convert';
import { parseDecimalAmount, type Money } from '../../core/money/money';
import { CurrencyNotSupportedError } from '../../core/money/money.errors';
import { RATE_DECIMALS, type ScaledRate } from '../../core/money/rate';
import { DbTx } from '../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../infrastructure/security/tokens/access-token-verifier.port';
import { OrganizationService } from '../organization/organization.service';
import { CostAllocationService } from './cost-allocation/cost-allocation.service';
import { CurrencyService } from './currency/currency.service';
import { ReportingCurrencyNotSupportedError } from './exchange-rate/exchange-rate.errors';
import { ExchangeRateLedgerService } from './exchange-rate/exchange-rate-ledger.service';
import type {
  AllocationLineInput,
  CostAllocationView,
  CurrencyRecord,
  SnapshotResult,
  TaxEstimateResult,
  TaxGroup,
  TaxLineInput,
} from './finance.types';
import { TaxProfileService } from './tax-profile/tax-profile.service';

const RATE_ONE: ScaledRate = 10n ** BigInt(RATE_DECIMALS);

/**
 * The finance facade other modules use. Money is read and converted here and nowhere else (ADR-0007): a caller hands
 * in text and gets minor units, and hands in minor units and gets a frozen snapshot — it never does the arithmetic.
 */
@Injectable()
export class FinanceService {
  constructor(
    private readonly currencies: CurrencyService,
    private readonly rates: ExchangeRateLedgerService,
    private readonly organization: OrganizationService,
    private readonly taxProfiles: TaxProfileService,
    private readonly costAllocations: CostAllocationService,
  ) {}

  listCurrencies(): Promise<CurrencyRecord[]> {
    return this.currencies.list();
  }

  findCurrency(code: string, tx?: DbTx): Promise<CurrencyRecord | null> {
    return this.currencies.find(code, tx);
  }

  /**
   * Reads `{ amount: "1200.50", currency: "USD" }` into minor units with the minor digits of that currency. Throws
   * CurrencyNotSupportedError, and the money errors of `core/money` for a malformed, over-precise or too large amount.
   * A negative amount is read as such: a caller whose field is `>= 0` (unit price, ADR-0007) checks the sign itself.
   */
  async parseMoney(input: { amount: string; currency: string }, tx?: DbTx): Promise<Money> {
    const currency = await this.currencies.find(input.currency, tx);
    if (!currency) throw new CurrencyNotSupportedError(input.currency);

    return { amountMinor: parseDecimalAmount(input.amount, currency.minorUnit), currency: currency.code };
  }

  /**
   * What `money` is worth in the organization's reporting currency on `rateDate`, frozen for the caller to store. The
   * reporting currency itself converts at rate 1 (`SAME_CURRENCY`); any other needs a rate entered for exactly that
   * day, else `MISSING_RATE` — never the latest or the nearest rate (`QĐ-42b`).
   */
  async snapshotMoney(tx: DbTx, money: Money, rateDate: BusinessDate): Promise<SnapshotResult> {
    if (!isBusinessDate(rateDate)) throw new RangeError('The rate date is not a business date');
    const organization = await this.organization.getOrganization(tx);
    if (!organization) throw new Error('Money was converted before installation');

    const from = await this.currencies.find(money.currency, tx);
    if (!from) throw new CurrencyNotSupportedError(money.currency);
    const to = await this.currencies.find(organization.reportingCurrency, tx);
    if (!to) throw new ReportingCurrencyNotSupportedError(organization.reportingCurrency);

    if (from.code === to.code) {
      return {
        status: 'CONVERTED',
        snapshot: {
          rate: RATE_ONE,
          rateDate,
          rateSource: 'SAME_CURRENCY',
          reportingAmountMinor: money.amountMinor,
          reportingCurrency: to.code,
          exchangeRateId: null,
        },
      };
    }

    const rate = await this.rates.find(organization.id, from.code, rateDate, tx);
    if (!rate) return { status: 'MISSING_RATE' };

    return {
      status: 'CONVERTED',
      snapshot: {
        rate: rate.rate,
        rateDate,
        rateSource: 'MANUAL',
        reportingAmountMinor: convertToReporting(money.amountMinor, rate.rate, from.minorUnit, to.minorUnit),
        reportingCurrency: to.code,
        exchangeRateId: rate.id,
      },
    };
  }

  /**
   * The estimated tax on a price before tax, split into the deductible part and the real cost, from the vendor's tax
   * profile or from the default profile when it has none (`basis` tells which). An estimate for display: the system
   * does not compute a tax payable or decide a deduction.
   */
  estimateTax(vendorId: string, netMinor: bigint, tx?: DbTx): Promise<TaxEstimateResult> {
    return this.taxProfiles.estimate(vendorId, netMinor, tx);
  }

  /**
   * The tax profile of a vendor as answered: `DECLARED` with the newest declaration, or `MISSING` with the default
   * profile its estimates fall back on. The vendor itself is the caller's to check (it is a catalog table).
   */
  taxProfileOf(vendorId: string): ReturnType<TaxProfileService['view']> {
    return this.taxProfiles.view(vendorId);
  }

  /**
   * Records the tax profile Finance declares for a vendor, as a new version when it differs from the current one,
   * with its audit event in the same transaction. Throws the tax line errors of `finance.errors` and
   * TaxProfileVendorNotFoundError. The caller checks that the actor may declare (the Finance role).
   */
  declareTaxProfile(
    actor: AuthenticatedPrincipal,
    vendorId: string,
    input: { group?: TaxGroup; lines: TaxLineInput[] },
  ): ReturnType<TaxProfileService['declare']> {
    return this.taxProfiles.declare(actor, vendorId, input);
  }

  taxProfileHistory(
    vendorId: string,
    query: { page: number; pageSize: number },
  ): ReturnType<TaxProfileService['history']> {
    return this.taxProfiles.history(vendorId, query);
  }

  /** The group and version of the newest declaration of each vendor id given; an id with none is absent. */
  taxProfileGroups(vendorIds: readonly string[]): ReturnType<TaxProfileService['currentGroups']> {
    return this.taxProfiles.currentGroups(vendorIds);
  }

  /** The ids of every vendor that has a declared tax profile. */
  declaredTaxProfileVendorIds(): Promise<string[]> {
    return this.taxProfiles.declaredVendorIds();
  }

  /**
   * The cost allocation of a subscription as answered: `DECLARED` with the newest declaration, or `MISSING`. The
   * subscription itself, and whether its plan takes an allocation, are the caller's to check (a catalog table).
   */
  costAllocationOf(subscriptionId: string): ReturnType<CostAllocationService['view']> {
    return this.costAllocations.view(subscriptionId);
  }

  /**
   * Records the allocation Finance declares for a subscription over Cost Centers, as a new version when it differs
   * from the current one, with its audit event in the same transaction. Throws the allocation errors of
   * `finance.errors`. The caller checks that the actor may declare (the Finance role).
   */
  declareCostAllocation(
    actor: AuthenticatedPrincipal,
    subscriptionId: string,
    input: { lines: AllocationLineInput[] },
  ): Promise<{ allocation: CostAllocationView; changed: boolean }> {
    return this.costAllocations.declare(actor, subscriptionId, input);
  }

  costAllocationHistory(
    subscriptionId: string,
    query: { page: number; pageSize: number },
  ): ReturnType<CostAllocationService['history']> {
    return this.costAllocations.history(subscriptionId, query);
  }
}
