import { Injectable } from '@nestjs/common';
import { formatAmount } from '../../../core/money/money';
import { FinanceApi } from '../../finance/public/finance.api';
import type { TaxEstimateResult } from '../../finance/public/finance.types';
import { OperatingParametersApi } from '../../operating-parameters/public/operating-parameters.api';
import type { BusinessDate } from '../../../core/business-date';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { SeatOccupancyHook } from '../public/catalog.extension-points';
import { PlanFactsService } from '../plan/plan-facts.service';
import { needsVendorAdmins } from '../plan/plan-vendor-admins.policy';
import { adjustmentPointOf, expiryReading, runsAPeriod } from './obligation/subscription-obligation.policy';
import { alertDates, deriveNotice, missingData, noticeInputOf, noticeWarnings } from './subscription.policy';
import { isPricedInDong } from './price/subscription-price.policy';
import { liveIdsByPlan, liveSiblingsOf, poolWarnings, vendorAdminFlags } from './pool/subscription-pool.policy';
import { SubscriptionGrantingRepo } from './subscription-granting.repo';
import { SubscriptionRepo } from './subscription.repo';
import type {
  DeadlineKind,
  ExpiryState,
  SubscriptionRecord,
  SubscriptionView,
  TaxEstimateSummary,
  VendorAdminView,
} from './subscription.types';

type LiveOfPlans = { byPlan: Map<string, string[]>; has: (id: string) => boolean };
type SeatCounts = ReadonlyMap<string, { occupied: number; inRevocation: number }>;

/** Where a subscription stands against its point of adjustment today (`QĐ-111o`). */
export interface ExpiryReadingView {
  state: ExpiryState | null;
  daysLeft: number | null;
  deadlineKind: DeadlineKind | null;
}

/** The most live subscriptions of one plan an answer names: duplicates exist only while the seat baseline is open, a few at most. */
const MERGE_CANDIDATES_MAX = 20;

const mergeCandidatesOf = (live: LiveOfPlans, record: SubscriptionRecord): string[] =>
  live.has(record.id) ? liveSiblingsOf(live.byPlan, record.planId, record.id).slice(0, MERGE_CANDIDATES_MAX) : [];

/** The seats of a shared pool: only a K2 plan has them (a key, a personal right and an internal tool are counted by what they are, `IA-2`). */
const seatsOfPool = (record: SubscriptionRecord, counts: SeatCounts): SubscriptionView['seats'] => {
  if (record.planProvisioningType !== 'K2') return null;
  const taken = counts.get(record.id);
  const assigned = taken?.occupied ?? 0;

  return {
    purchased: record.purchasedQuantity,
    assigned,
    free: record.purchasedQuantity === null ? null : Math.max(0, record.purchasedQuantity - assigned),
    inRevocation: taken?.inRevocation ?? 0,
  };
};

const mergeWarnings = (mergeCandidateIds: readonly string[]): 'SHOULD_MERGE'[] =>
  mergeCandidateIds.length > 0 ? ['SHOULD_MERGE'] : [];

/**
 * A subscription as it is answered: the stored data with everything derived when it is read — the notice deadline and
 * its source, the alert dates the operating parameter sets now, the data-quality warning, the tax profile of the vendor
 * and the tax estimate on the unit price. Nothing here is stored, so none of it can disagree with the data.
 */
@Injectable()
export class SubscriptionViewService {
  constructor(
    private readonly finance: FinanceApi,
    private readonly parameters: OperatingParametersApi,
    private readonly subscriptions: SubscriptionRepo,
    private readonly organizationReads: OrganizationReadApi,
    private readonly planFacts: PlanFactsService,
    private readonly occupancy: SeatOccupancyHook,
    private readonly periods: SubscriptionGrantingRepo,
  ) {}

  /**
   * Where each of these subscriptions stands against its point of adjustment today: near it, past it while seats are still held, or
   * neither. One read of the seats for any number of subscriptions; what the filter by expiry of a list is found with, and what a row says.
   */
  async expiryReadings(records: readonly SubscriptionRecord[]): Promise<Map<string, ExpiryReadingView>> {
    const today = await this.organizationReads.businessToday();
    const [seats, continued] = await Promise.all([this.seatsOf(records, today), this.continuedAmong(records)]);

    return this.readingsOf(records, today, seats, continued);
  }

  /** Which of these subscriptions a later period continues: one read for all of them. */
  private continuedAmong(records: readonly SubscriptionRecord[]): Promise<ReadonlySet<string>> {
    return this.periods.idsWithSuccessor(records.map((record) => record.id));
  }

  private readingsOf(
    records: readonly SubscriptionRecord[],
    today: BusinessDate,
    seats: SeatCounts,
    continued: ReadonlySet<string>,
  ): Map<string, ExpiryReadingView> {
    return new Map(
      records.map((record) => {
        // Only a subscription that runs a period has a point: the rule of the filter by expiry, so a badge and the filter never disagree.
        const point = runsAPeriod({ ...record, hasSuccessor: continued.has(record.id) })
          ? adjustmentPointOf(record)
          : null;

        return [record.id, expiryReading(point, today, (seats.get(record.id)?.occupied ?? 0) > 0)];
      }),
    );
  }

  /** The seats each of these subscriptions holds from today on, and how many of them are being taken back: one read for all of them. */
  private seatsOf(records: readonly SubscriptionRecord[], today: BusinessDate): Promise<SeatCounts> {
    return records.length === 0
      ? Promise.resolve(new Map())
      : this.occupancy.get().seatsOfSubscriptions(
          records.map((record) => record.id),
          today,
        );
  }

  /** The people who answer for these subscriptions, by name, in one read. */
  private async answerersOf(records: readonly SubscriptionRecord[]) {
    const ids = [
      ...new Set(
        records.flatMap((record) => (record.responsibleItAdminEmployeeId ? [record.responsibleItAdminEmployeeId] : [])),
      ),
    ];
    const people = new Map(
      (ids.length === 0 ? [] : await this.organizationReads.getEmployees(ids)).map((person) => [person.id, person]),
    );

    return (record: SubscriptionRecord): SubscriptionView['responsibleItAdmin'] => {
      const person = record.responsibleItAdminEmployeeId ? people.get(record.responsibleItAdminEmployeeId) : undefined;

      return person ? { employeeId: person.id, employeeCode: person.employeeCode, fullName: person.fullName } : null;
    };
  }

  /** The records as they are answered, with the derived notice, alerts, warnings, tax profile and estimate. */
  async viewAll(records: SubscriptionRecord[]): Promise<SubscriptionView[]> {
    if (records.length === 0) return [];
    const daysBefore = await this.alertDays();
    // A priced subscription answers its tax profile from the read its estimate came from, so the two are one version
    //; only the vendors of the subscriptions without a price are read for their profile alone.
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

    const live = await this.liveOfPooledPlans(records);
    const vendorAdmins = await this.vendorAdminsOf(records);
    const today = await this.organizationReads.businessToday();
    const seatCounts = await this.seatsOf(records, today);
    const readings = this.readingsOf(records, today, seatCounts, await this.continuedAmong(records));
    const answerer = await this.answerersOf(records);
    const adjustment = (record: SubscriptionRecord) => ({
      logoUrl: record.applicationLogoUrl,
      responsibleItAdmin: answerer(record),
      expiry: readings.get(record.id)?.state ?? null,
      daysLeft: readings.get(record.id)?.daysLeft ?? null,
      deadlineKind: readings.get(record.id)?.deadlineKind ?? null,
      seats: seatsOfPool(record, seatCounts),
    });
    const views: SubscriptionView[] = [];
    for (const record of records) {
      // The rule against a second live subscription of a K2 or K4 plan: answered at every phase of the baseline, so the IT Admin sees what to fold (`QĐ-104k`(3)).
      const mergeCandidateIds = mergeCandidatesOf(live, record);
      const notice = deriveNotice(noticeInputOf(record));
      const missing = missingData({
        kind: record.kind,
        planPricingModel: record.planPricingModel,
        quantity: record.purchasedQuantity,
        startDate: record.startDate,
        billingCycle: record.billingCycle,
        hasPrice: isPricedInDong(record),
      });
      let group: TaxEstimateResult['group'] | null = groups.get(record.vendor.id)?.group ?? null;
      let taxEstimate: TaxEstimateSummary | null = null;
      let unitPrice: SubscriptionView['unitPrice'] = null;
      let originalPrice: SubscriptionView['originalPrice'] = null;
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
      if (record.originalPrice) {
        const originalUnits = await minorUnitOf(record.originalPrice.currency);
        originalPrice = {
          amount: formatAmount(record.originalPrice.amountMinor, originalUnits),
          currency: record.originalPrice.currency,
        };
      }

      views.push({
        id: record.id,
        planId: record.planId,
        planName: record.planName,
        ownerDepartmentId: record.ownerDepartmentId,
        applicationId: record.applicationId,
        applicationName: record.applicationName,
        vendor: record.vendor,
        kind: record.kind,
        status: record.status,
        missingFinancialData: record.status === 'DRAFT',
        missing,
        purchasedQuantity: record.purchasedQuantity,
        unitPrice,
        originalPrice,
        billingCycle: record.billingCycle,
        commitmentTermMonths: record.commitmentTermMonths,
        startDate: record.startDate,
        endDate: record.endDate,
        renewalDate: record.renewalDate,
        noticePeriodDays: record.noticePeriodDays,
        autoRenew: record.autoRenew,
        allowsMidTermReduction: record.allowsMidTermReduction,
        responsibleItAdminEmployeeId: record.responsibleItAdminEmployeeId,
        vendorMinimumSeats: record.vendorMinimumSeats,
        isPrimaryForPlan: record.isPrimaryForPlan,
        ...adjustment(record),
        noticeDeadline: { value: notice.deadline, source: notice.source },
        alerts: { baseDate: notice.baseDate, dates: alertDates(notice.baseDate, daysBefore) },
        warnings: [...noticeWarnings(notice.source), ...poolWarnings(record), ...mergeWarnings(mergeCandidateIds)],
        mergeCandidateIds,
        ...vendorAdmins(record),
        taxProfile: { status: group ? 'DECLARED' : 'MISSING', group },
        taxEstimate,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      });
    }

    return views;
  }

  /** Which of these subscriptions are live and which live subscriptions their plans have (only K2 and K4 plans, one read for all). */
  private async liveOfPooledPlans(records: readonly SubscriptionRecord[]) {
    const rows = await this.subscriptions.findLivenessOfPooledPlans([
      ...new Set(records.map((record) => record.planId)),
    ]);
    const byPlan = liveIdsByPlan(rows, await this.organizationReads.businessToday());
    const ids = new Set([...byPlan.values()].flat());

    return { byPlan, has: (id: string) => ids.has(id) };
  }

  /**
   * Who administers the plan of each record at the vendor, read for all of them at once (`QĐ-110k`, `QĐ-110u`): the profiles of the plans that need
   * admins, the names of the people and which of them still work as an IT Admin. A plan that needs none answers empty and quiet; a plan that
   * needs them and has no profile (a subscription older than the rule) answers empty with both flags raised.
   */
  private async vendorAdminsOf(records: readonly SubscriptionRecord[]) {
    const needing = records.filter((record) =>
      needsVendorAdmins(record.planProvisioningType, record.planHasAdminConsole),
    );
    const profiles = await this.planFacts.vendorAdminsOf([...new Set(needing.map((record) => record.planId))]);
    const ids = [
      ...new Set([...profiles.values()].flatMap((profile) => profile.members.map((member) => member.employeeId))),
    ];
    const usable = await this.planFacts.workingAdminsAmong(ids);
    const people = new Map((await this.organizationReads.getEmployees(ids)).map((employee) => [employee.id, employee]));

    return (record: SubscriptionRecord) => {
      const needs = needsVendorAdmins(record.planProvisioningType, record.planHasAdminConsole);
      const profile = needs ? profiles.get(record.planId) : undefined;
      const admins: VendorAdminView[] = (profile?.members ?? []).map((member) => ({
        employeeId: member.employeeId,
        employeeCode: people.get(member.employeeId)?.employeeCode ?? '',
        fullName: people.get(member.employeeId)?.fullName ?? '',
        role: member.role,
        working: usable.has(member.employeeId),
      }));
      const ownerAccountEmail = profile?.ownerAccountEmail ?? null;

      return {
        vendorAdmins: admins,
        ownerAccountEmail,
        adminNote: profile?.adminNote ?? null,
        ...vendorAdminFlags({ needs, admins, ownerAccountEmail }),
      };
    };
  }

  /** The days before the deadline an alert falls, as the parameter says now. */
  private async alertDays(): Promise<number[]> {
    const value = await this.parameters.getValue('RENEWAL_ALERT_DAYS_BEFORE_DEADLINE');

    return Array.isArray(value) ? value : [];
  }
}
