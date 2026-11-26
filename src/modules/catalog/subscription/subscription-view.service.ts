import { Injectable } from '@nestjs/common';
import { formatAmount } from '../../../core/money/money';
import { FinanceApi } from '../../finance/public/finance.api';
import type { TaxEstimateResult } from '../../finance/public/finance.types';
import type { BusinessDate } from '../../../core/business-date';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { SeatOccupancyHook } from '../public/catalog.extension-points';
import { PlanFactsService } from '../plan/plan-facts.service';
import { needsVendorAdmins } from '../plan/plan-vendor-admins.policy';
import {
  adjustmentCommitmentOf,
  adjustmentPointOf,
  expiryReading,
  hasAdjustmentPoint,
  redAlertOf,
  runsAPeriod,
  type AdjustmentPoint,
  type AdjustmentWindows,
} from './obligation/subscription-obligation.policy';
import { alertDates, deriveNotice, missingData, noticeInputOf, noticeWarnings } from './subscription.policy';
import { isPricedInDong } from './price/subscription-price.policy';
import { poolWarnings, vendorAdminFlags } from './pool/subscription-pool.policy';
import {
  SubscriptionLotResponsibleService,
  type SubscriptionLineWithSeats,
} from './responsible/subscription-lot-responsible.service';
import { SubscriptionGrantingRepo } from './subscription-granting.repo';
import { WorkspaceForSubscriptionService } from '../workspace/workspace-for-subscription.service';
import { SubscriptionWindowsService } from './subscription-windows.service';
import type {
  DeadlineKind,
  ExpiryState,
  SubscriptionRecord,
  SubscriptionView,
  TaxEstimateSummary,
  VendorAdminView,
} from './subscription.types';

type SeatCounts = ReadonlyMap<string, { occupied: number; inRevocation: number }>;

/** Where a subscription stands against its point of adjustment today (`QĐ-111o`). */
export interface ExpiryReadingView {
  state: ExpiryState | null;
  daysLeft: number | null;
  deadlineKind: DeadlineKind | null;
}

/** The seats of a shared pool: only a K2 plan has them (a key, a personal right and an internal tool are counted by what they are, `IA-2`). */
const listSeatsTodayOf = (lineCount: number, servingSeatsSum: number, record: SubscriptionRecord): number => {
  if (lineCount > 0) return servingSeatsSum;

  return record.planProvisioningType === 'K2' ? (record.purchasedQuantity ?? 0) : 0;
};

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

/**
 * The alerts of a subscription: the deadline of its point of adjustment, and the days it counts back to (the point, then the red alert of a plan by the year).
 * A subscription that has no point of adjustment (not a `K2` term, or internal software) has no alert: the renewal says `NOT_POOL_TERM` / `INTERNAL` for it.
 */
const alertsOf = (
  found: AdjustmentPoint | null,
  record: SubscriptionRecord,
  windows: AdjustmentWindows | undefined,
): SubscriptionView['alerts'] => {
  const point = hasAdjustmentPoint(record) ? found : null;

  return {
    baseDate: point?.deadline ?? null,
    dates: alertDates(
      point === null || windows === undefined
        ? null
        : {
            point: point.point,
            redAlertOn: redAlertOf(point.deadline, adjustmentCommitmentOf(record), windows.redAlertDaysAnnual),
          },
    ),
  };
};

const monthlyUnitPriceWire = (minor: bigint | null | undefined) =>
  minor !== null && minor !== undefined ? { amount: formatAmount(minor, 0), currency: 'VND' } : null;

/**
 * A subscription as it is answered: the stored data with everything derived when it is read — the notice deadline and
 * its source, the alert dates from its point of adjustment, the data-quality warning, the tax profile of the vendor
 * and the tax estimate on the unit price. Nothing here is stored, so none of it can disagree with the data.
 */
@Injectable()
export class SubscriptionViewService {
  constructor(
    private readonly finance: FinanceApi,
    private readonly organizationReads: OrganizationReadApi,
    private readonly planFacts: PlanFactsService,
    private readonly occupancy: SeatOccupancyHook,
    private readonly periods: SubscriptionGrantingRepo,
    private readonly windows: SubscriptionWindowsService,
    private readonly lotFacts: SubscriptionLotResponsibleService,
    private readonly workspaces: WorkspaceForSubscriptionService,
  ) {}

  /**
   * Where each of these subscriptions stands against its point of adjustment today: near it, past it while seats are still held, or
   * neither. One read of the seats for any number of subscriptions; what the filter by expiry of a list is found with, and what a row says.
   */
  async expiryReadings(records: readonly SubscriptionRecord[]): Promise<Map<string, ExpiryReadingView>> {
    const today = await this.organizationReads.businessToday();
    const [seats, continued] = await Promise.all([this.seatsOf(records, today), this.continuedAmong(records)]);
    const points = await this.pointsOf(records, today, continued);

    return this.readingsAt(records, points.points, today, seats);
  }

  /** Which of these subscriptions a later period continues: one read for all of them. */
  private continuedAmong(records: readonly SubscriptionRecord[]): Promise<ReadonlySet<string>> {
    return this.periods.idsWithSuccessor(records.map((record) => record.id));
  }

  /**
   * The point of adjustment of each of these subscriptions today, null where there is none, with the windows each was counted with. Only a
   * subscription that runs a period has a point: the rule of the filter by expiry, so a badge, the alert dates and the filter never disagree. The
   * windows are those of the period of each (`QĐ-106h`), read once for all of them by the one rule of the instant (`adjustmentPeriodInstantOf`).
   */
  private async pointsOf(
    records: readonly SubscriptionRecord[],
    today: BusinessDate,
    continued: ReadonlySet<string>,
  ): Promise<{ points: Map<string, AdjustmentPoint | null>; windows: Map<string, AdjustmentWindows> }> {
    const running = records.filter((record) => runsAPeriod({ ...record, hasSuccessor: continued.has(record.id) }));
    const windows = await this.windows.of(running, today);

    return {
      windows,
      points: new Map(
        records.map((record) => {
          const own = windows.get(record.id);

          return [record.id, own === undefined ? null : adjustmentPointOf(record, today, own)];
        }),
      ),
    };
  }

  private readingsAt(
    records: readonly SubscriptionRecord[],
    points: ReadonlyMap<string, AdjustmentPoint | null>,
    today: BusinessDate,
    seats: SeatCounts,
  ): Map<string, ExpiryReadingView> {
    return new Map(
      records.map((record) => [
        record.id,
        expiryReading(points.get(record.id) ?? null, today, (seats.get(record.id)?.occupied ?? 0) > 0),
      ]),
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

  /**
   * The records as they are answered, with the derived notice, alerts, warnings, tax profile and estimate. A subscription that became a lot (a perpetual purchase)
   * says who answers for the lot, which is where that is written.
   */
  async viewAll(records: SubscriptionRecord[]): Promise<SubscriptionView[]> {
    if (records.length === 0) return [];
    const lotOwners = await this.lotFacts.lotResponsibles(
      records.filter((record) => record.kind === 'PERPETUAL').map((record) => record.id),
    );

    return this.viewResolved(
      lotOwners.size === 0
        ? records
        : records.map((record) =>
            lotOwners.has(record.id)
              ? { ...record, responsibleItAdminEmployeeId: lotOwners.get(record.id) ?? null }
              : record,
          ),
    );
  }

  private async viewResolved(records: SubscriptionRecord[]): Promise<SubscriptionView[]> {
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

    const vendorAdmins = await this.vendorAdminsOf(records);
    const today = await this.organizationReads.businessToday();
    const seatCounts = await this.seatsOf(records, today);
    const { points, windows } = await this.pointsOf(records, today, await this.continuedAmong(records));
    const readings = this.readingsAt(records, points, today, seatCounts);
    const answerer = await this.answerersOf(records);
    // A period that has lines is priced by its lines: the mark of the subscription that prices its plan is retired for it.
    const lined = await this.lotFacts.withLines(records.map((record) => record.id));
    const linesCtx = await this.readLinesContext(records, today);
    const adjustment = (record: SubscriptionRecord, effectivePurchasedQuantity: number | null) => ({
      logoUrl: record.applicationLogoUrl,
      responsibleItAdmin: answerer(record),
      expiry: readings.get(record.id)?.state ?? null,
      daysLeft: readings.get(record.id)?.daysLeft ?? null,
      deadlineKind: readings.get(record.id)?.deadlineKind ?? null,
      seats: seatsOfPool({ ...record, purchasedQuantity: effectivePurchasedQuantity }, seatCounts),
      isPrimaryForPlan: record.isPrimaryForPlan && !lined.has(record.id),
    });
    const views: SubscriptionView[] = [];
    for (const record of records) {
      const { lineViews, listSeatsToday, lineCount, effectivePurchasedQuantity, hasLine } = this.resolveRecordLines(
        record,
        linesCtx,
      );
      const notice = deriveNotice(noticeInputOf(record));
      const missing = missingData({
        kind: record.kind,
        planPricingModel: record.planPricingModel,
        quantity: effectivePurchasedQuantity,
        startDate: record.startDate,
        billingCycle: record.billingCycle,
        hasPrice: isPricedInDong(record) || hasLine,
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
        applicationId: record.applicationId,
        applicationName: record.applicationName,
        vendor: record.vendor,
        kind: record.kind,
        status: record.status,
        missingFinancialData: record.status === 'DRAFT',
        missing,
        purchasedQuantity: effectivePurchasedQuantity,
        unitPrice,
        monthlyUnitPrice: monthlyUnitPriceWire(record.monthlyUnitPriceMinor),
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
        workspace: record.workspace,
        seatCounting: record.seatCounting,
        minimumSeatsTotal: record.minimumSeatsTotal,
        invoicedLater: record.invoicedLater,
        ...adjustment(record, effectivePurchasedQuantity),
        noticeDeadline: { value: notice.deadline, source: notice.source },
        alerts: alertsOf(points.get(record.id) ?? null, record, windows.get(record.id)),
        warnings: [...noticeWarnings(notice.source), ...poolWarnings(record)],
        mergeCandidateIds: [],
        lines: lineViews,
        lineCount,
        seatsToday: listSeatsToday,
        ...vendorAdmins(record),
        taxProfile: { status: group ? 'DECLARED' : 'MISSING', group },
        taxEstimate,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      });
    }

    return views;
  }

  private async readLinesContext(records: readonly SubscriptionRecord[], today: BusinessDate) {
    const linesBySub: ReadonlyMap<string, SubscriptionLineWithSeats[]> = this.lotFacts.linesForSubscriptions
      ? await this.lotFacts.linesForSubscriptions(records, today)
      : new Map();
    const allLinePlanIds = [...new Set([...linesBySub.values()].flat().map((entry) => entry.line.planId))];
    const linePlans = allLinePlanIds.length > 0 ? await this.planFacts.lookups(allLinePlanIds) : [];
    const planNameById = new Map(
      linePlans.filter((plan): plan is NonNullable<typeof plan> => plan !== null).map((plan) => [plan.id, plan.name]),
    );
    const reader = this.occupancy.get();
    const lineOccupied: ReadonlyMap<string, number> =
      allLinePlanIds.length > 0 && reader.occupiedBySubscriptionPlans
        ? await reader.occupiedBySubscriptionPlans(
            records.map((record) => record.id),
            today,
          )
        : new Map();

    return { linesBySub, planNameById, lineOccupied };
  }

  private resolveRecordLines(
    record: SubscriptionRecord,
    ctx: {
      linesBySub: ReadonlyMap<string, SubscriptionLineWithSeats[]>;
      planNameById: ReadonlyMap<string, string>;
      lineOccupied: ReadonlyMap<string, number>;
    },
  ) {
    const subLines = ctx.linesBySub.get(record.id) ?? [];
    const lineViews = subLines.map(({ line, seatsToday }) => {
      const assignedToday = ctx.lineOccupied.get(`${record.id}:${line.planId}`) ?? 0;

      return {
        id: line.id,
        plan: { id: line.planId, name: ctx.planNameById.get(line.planId) ?? record.planName },
        monthlyUnitPrice: { amount: formatAmount(line.monthlyUnitPriceMinor, 0), currency: 'VND' },
        minimumSeats: line.minimumSeats,
        seatsToday,
        assignedToday,
        freeToday: Math.max(0, seatsToday - assignedToday),
        closedOn: line.closedOn,
        closedReason: line.closedReason,
      };
    });
    const servingSeatsSum = subLines.reduce((sum, entry) => (entry.isServing ? sum + entry.seatsToday : sum), 0);
    const lineCount = subLines.length;

    return {
      lineViews,
      listSeatsToday: listSeatsTodayOf(lineCount, servingSeatsSum, record),
      lineCount,
      hasLine: lineCount > 0,
      effectivePurchasedQuantity: lineCount > 0 ? servingSeatsSum : record.purchasedQuantity,
    };
  }

  /**
   * Who administers the workspace (or legacy plan profile when `workspace` is null) of each record at the vendor (`QĐ-110k`, `QĐ-110u`):
   * the names of the people and which of them work now as an IT Admin. A plan that needs none answers empty and quiet.
   */
  private async vendorAdminsOf(records: readonly SubscriptionRecord[]) {
    const needing = records.filter((record) =>
      needsVendorAdmins(record.planProvisioningType, record.planHasAdminConsole),
    );
    const workspaceIds = [...new Set(needing.flatMap((record) => (record.workspace ? [record.workspace.id] : [])))];
    const legacyPlanIds = [...new Set(needing.filter((r) => r.workspace === null).map((r) => r.planId))];
    const [wsList, legacyProfiles] = await Promise.all([
      workspaceIds.length > 0 ? this.workspaces.findMany(workspaceIds) : Promise.resolve([]),
      legacyPlanIds.length > 0
        ? this.planFacts.vendorAdminsOf(legacyPlanIds)
        : Promise.resolve(new Map() as Awaited<ReturnType<PlanFactsService['vendorAdminsOf']>>),
    ]);
    const wsById = new Map(wsList.map((ws) => [ws.id, ws]));
    const ids = [
      ...new Set([
        ...wsList.flatMap((ws) => ws.admins.map((admin) => admin.employeeId)),
        ...[...legacyProfiles.values()].flatMap((profile) => profile.members.map((member) => member.employeeId)),
      ]),
    ];
    const usable =
      workspaceIds.length > 0
        ? await this.workspaces.workingAdminsAmong(ids)
        : await this.planFacts.workingAdminsAmong(ids);
    const people = new Map((await this.organizationReads.getEmployees(ids)).map((employee) => [employee.id, employee]));

    return (record: SubscriptionRecord) => this.vendorAdminViewFor(record, wsById, legacyProfiles, usable, people);
  }

  private vendorAdminViewFor(
    record: SubscriptionRecord,
    wsById: ReadonlyMap<string, Awaited<ReturnType<WorkspaceForSubscriptionService['findMany']>>[number]>,
    legacyProfiles: Awaited<ReturnType<PlanFactsService['vendorAdminsOf']>>,
    usable: ReadonlySet<string>,
    people: ReadonlyMap<string, { employeeCode: string; fullName: string }>,
  ) {
    const needs = needsVendorAdmins(record.planProvisioningType, record.planHasAdminConsole);
    const source = this.adminSourceFor(record, needs, wsById, legacyProfiles);
    const admins: VendorAdminView[] = source.members.map((member) => {
      const person = people.get(member.employeeId);

      return {
        employeeId: member.employeeId,
        employeeCode: person?.employeeCode ?? '',
        fullName: person?.fullName ?? '',
        role: member.role,
        working: usable.has(member.employeeId),
      };
    });

    return {
      vendorAdmins: admins,
      ownerAccountEmail: source.ownerAccountEmail,
      adminNote: source.adminNote,
      ...vendorAdminFlags({ needs, admins, ownerAccountEmail: source.ownerAccountEmail }),
    };
  }

  private adminSourceFor(
    record: SubscriptionRecord,
    needs: boolean,
    wsById: ReadonlyMap<string, Awaited<ReturnType<WorkspaceForSubscriptionService['findMany']>>[number]>,
    legacyProfiles: Awaited<ReturnType<PlanFactsService['vendorAdminsOf']>>,
  ) {
    if (!needs) return { members: [], ownerAccountEmail: null, adminNote: null };
    const ws = record.workspace ? wsById.get(record.workspace.id) : undefined;
    if (ws) return { members: ws.admins, ownerAccountEmail: ws.ownerAccountEmail, adminNote: ws.adminNote };
    const legacy = !record.workspace ? legacyProfiles.get(record.planId) : undefined;

    return {
      members: legacy?.members ?? [],
      ownerAccountEmail: legacy?.ownerAccountEmail ?? null,
      adminNote: legacy?.adminNote ?? null,
    };
  }
}
