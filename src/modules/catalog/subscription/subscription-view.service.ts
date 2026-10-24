import { Injectable } from '@nestjs/common';
import { formatAmount } from '../../../core/money/money';
import { formatRate } from '../../../core/money/rate';
import { FinanceService } from '../../finance/finance.service';
import type { TaxEstimateResult } from '../../finance/finance.types';
import { OperatingParametersService } from '../../operating-parameters/operating-parameters.service';
import { alertDates, deriveNotice, missingData, noticeInputOf, noticeWarnings } from './subscription.policy';
import type { SubscriptionRecord, SubscriptionView, TaxEstimateSummary } from './subscription.types';

/**
 * A subscription as it is answered: the stored data with everything derived when it is read — the notice deadline and
 * its source, the alert dates the operating parameter sets now, the data-quality warning, the tax profile of the vendor
 * and the tax estimate on the unit price. Nothing here is stored, so none of it can disagree with the data.
 */
@Injectable()
export class SubscriptionViewService {
  constructor(
    private readonly finance: FinanceService,
    private readonly parameters: OperatingParametersService,
  ) {}

  /** The records as they are answered, with the derived notice, alerts, warnings, tax profile and estimate. */
  async viewAll(records: SubscriptionRecord[]): Promise<SubscriptionView[]> {
    if (records.length === 0) return [];
    const daysBefore = await this.alertDays();
    // A priced subscription answers its tax profile from the read its estimate came from, so the two are one version
    // (LD-01, P28-06); only the vendors of the subscriptions without a price are read for their profile alone.
    const unpricedVendors = records.filter((record) => record.unitPrice === null).map((record) => record.vendor.id);
    const groups =
      unpricedVendors.length === 0
        ? new Map<string, { group: TaxEstimateResult['group']; version: number }>()
        : await this.finance.taxProfileGroups([...new Set(unpricedVendors)]);
    const minorUnits = new Map<string, number>();
    const minorUnitOf = async (currency: string): Promise<number> => {
      const cached = minorUnits.get(currency);
      if (cached !== undefined) return cached;
      const found = await this.finance.findCurrency(currency);
      if (!found) throw new Error(`The currency ${currency} of a stored price is not in the currency table`);
      minorUnits.set(currency, found.minorUnit);

      return found.minorUnit;
    };

    const priced = records.filter((record) => record.unitPrice !== null);
    const estimates = new Map(
      (
        await this.finance.estimateTaxMany(
          priced.map((record) => ({
            vendorId: record.vendor.id,
            netMinor: (record.unitPrice as { amountMinor: bigint }).amountMinor,
          })),
        )
      ).map((estimate, index) => [priced[index].id, estimate]),
    );

    const views: SubscriptionView[] = [];
    for (const record of records) {
      const notice = deriveNotice(noticeInputOf(record));
      const missing = missingData({
        kind: record.kind,
        planPricingModel: record.planPricingModel,
        quantity: record.purchasedQuantity,
        startDate: record.startDate,
        billingCycle: record.billingCycle,
        hasPrice: record.unitPrice !== null,
        hasSnapshot: record.priceSnapshot !== null,
      });
      let group: TaxEstimateResult['group'] | null = groups.get(record.vendor.id)?.group ?? null;
      let taxEstimate: TaxEstimateSummary | null = null;
      let unitPrice: SubscriptionView['unitPrice'] = null;
      let priceSnapshot: SubscriptionView['priceSnapshot'] = null;
      if (record.unitPrice) {
        const units = await minorUnitOf(record.unitPrice.currency);
        unitPrice = { amount: formatAmount(record.unitPrice.amountMinor, units), currency: record.unitPrice.currency };
        const estimate = estimates.get(record.id) as TaxEstimateResult;
        group = estimate.basis === 'PROFILE' ? estimate.group : null;
        taxEstimate = {
          basis: estimate.basis,
          label: estimate.basis === 'PROFILE' ? 'ESTIMATE' : 'ESTIMATE_NO_PROFILE',
          group: estimate.group,
          taxAmount: formatAmount(estimate.taxMinor, units),
          deductibleTaxAmount: formatAmount(estimate.deductibleMinor, units),
          nonDeductibleTaxAmount: formatAmount(estimate.nonDeductibleMinor, units),
          estimatedCost: formatAmount(estimate.estimatedCostMinor, units),
        };
      }
      if (record.unitPrice && record.priceSnapshot) {
        const reportingUnits = await minorUnitOf(record.priceSnapshot.reportingCurrency);
        priceSnapshot = {
          recordedOn: record.unitPrice.recordedOn,
          rate: formatRate(record.priceSnapshot.rate),
          rateDate: record.priceSnapshot.rateDate,
          rateSource: record.priceSnapshot.rateSource,
          reportingAmount: formatAmount(record.priceSnapshot.reportingMinor, reportingUnits),
          reportingCurrency: record.priceSnapshot.reportingCurrency,
          exchangeRateId: record.priceSnapshot.exchangeRateId,
        };
      }

      views.push({
        id: record.id,
        planId: record.planId,
        planName: record.planName,
        applicationId: record.applicationId,
        applicationName: record.applicationName,
        vendor: record.vendor,
        kind: record.kind,
        status: record.status,
        missingFinancialData: record.status === 'DRAFT',
        missing,
        purchasedQuantity: record.purchasedQuantity,
        unitPrice,
        priceSnapshot,
        billingCycle: record.billingCycle,
        startDate: record.startDate,
        endDate: record.endDate,
        renewalDate: record.renewalDate,
        noticePeriodDays: record.noticePeriodDays,
        autoRenew: record.autoRenew,
        allowsMidTermReduction: record.allowsMidTermReduction,
        noticeDeadline: { value: notice.deadline, source: notice.source },
        alerts: { baseDate: notice.baseDate, dates: alertDates(notice.baseDate, daysBefore) },
        warnings: noticeWarnings(notice.source),
        taxProfile: { status: group ? 'DECLARED' : 'MISSING', group },
        taxEstimate,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      });
    }

    return views;
  }

  /** The days before the deadline an alert falls, as the parameter says now. */
  private async alertDays(): Promise<number[]> {
    const value = await this.parameters.getValue('RENEWAL_ALERT_DAYS_BEFORE_DEADLINE');

    return Array.isArray(value) ? value : [];
  }
}
