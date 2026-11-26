import { Injectable } from '@nestjs/common';
import { addDays, fromDateColumn, type BusinessDate } from '../../../../core/business-date';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import { AuditApi } from '../../../audit/public/audit.api';
import { catalogAuditEvent } from '../../catalog-audit-event.mapper';
import { PlanFactsService } from '../../plan/plan-facts.service';
import { SubscriptionPeriodRefusedError } from '../../public/subscription-period.errors';
import type {
  NextPeriodInput,
  PaymentScheduleFacts,
  PeriodAdjustment,
  PeriodAuditActor,
  PoolAdjustmentWindows,
  RenewalPeriodFacts,
  SubscriptionPurchaseFacts,
} from '../../public/subscription-period.types';
import { SubscriptionPeriodLinesService } from '../../subscription-line/subscription-period-lines.service';
import type { SubscriptionLineRecord } from '../../subscription-line/subscription-line.types';
import {
  adjustmentCommitmentOf,
  adjustmentPointOf,
  earliestReducibleOn,
  redAlertOf,
  type AdjustmentWindows,
} from '../obligation/subscription-obligation.policy';
import { assertPoolTerms } from '../pool/subscription-pool.policy';
import { SubscriptionPoolService } from '../pool/subscription-pool.service';
import { snapshotOf } from '../subscription.mapper';
import { toSubscriptionPurchaseFacts } from './subscription-purchase-facts.mapper';
import {
  assertSubscriptionShape,
  declaredStateOf,
  derivedMonthlyUnitPriceMinor,
  deriveNotice,
  noticeInputOf,
  resolveSubscriptionPrices,
  subscriptionStatusOf,
} from '../subscription.policy';
import { SubscriptionPriceNotVndError } from '../subscription.errors';
import { SubscriptionPeriodRepo } from './subscription-period.repo';
import { SubscriptionRepo, type PaidTermRow } from '../subscription.repo';
import { SubscriptionPricingService } from '../subscription-pricing.service';
import { SubscriptionWindowsService } from '../subscription-windows.service';
import type { ApplicationKind, BillingCycle, ProvisioningType, SubscriptionRecord } from '../subscription.types';

/** How many periods one pass of the renewal sweep reads at most; the next pass takes the rest. */
const SWEEP_LIMIT = 500;

/** The point of adjustment of a period on `today`, with the red alert of a plan by the year; null when no date gives a point. */
function adjustmentOf(
  record: SubscriptionRecord,
  today: BusinessDate,
  windows: AdjustmentWindows,
): PeriodAdjustment | null {
  const point = adjustmentPointOf(record, today, windows);
  if (point === null) return null;
  const commitment = adjustmentCommitmentOf(record);

  return {
    kind: point.kind,
    deadline: point.deadline,
    point: point.point,
    end: point.end,
    redAlertOn: redAlertOf(point.deadline, commitment, windows.redAlertDaysAnnual),
    commitment,
  };
}

function factsOf(
  record: SubscriptionRecord,
  renewedById: string | null,
  today: BusinessDate,
  windows: AdjustmentWindows,
): RenewalPeriodFacts {
  const notice = deriveNotice(noticeInputOf(record));

  return {
    subscriptionId: record.id,
    planId: record.planId,
    planName: record.planName,
    planPricingModel: record.planPricingModel,
    applicationId: record.applicationId,
    applicationName: record.applicationName,
    applicationKind: record.applicationKind,
    responsibleItAdminEmployeeId: record.responsibleItAdminEmployeeId,
    provisioningType: record.planProvisioningType,
    commitmentTermMonths: record.commitmentTermMonths,
    vendorMinimumSeats: record.vendorMinimumSeats,
    isPrimaryForPlan: record.isPrimaryForPlan,
    kind: record.kind,
    status: record.status,
    purchasedQuantity: record.purchasedQuantity,
    unitPrice: record.unitPrice && { amountMinor: record.unitPrice.amountMinor, currency: record.unitPrice.currency },
    billingCycle: record.billingCycle,
    startDate: record.startDate,
    endDate: record.endDate,
    renewalDate: record.renewalDate,
    autoRenew: record.autoRenew,
    allowsMidTermReduction: record.allowsMidTermReduction,
    notice: { source: notice.source, deadline: notice.deadline, baseDate: notice.baseDate },
    adjustment: adjustmentOf(record, today, windows),
    renewedFromId: record.renewedFromId,
    renewedById,
    seatCounting: record.seatCounting,
    workspaceId: record.workspace?.id ?? null,
    minimumSeatsTotal: record.minimumSeatsTotal,
    noticePeriodDays: record.noticePeriodDays,
    monthlyUnitPriceMinor: record.monthlyUnitPriceMinor,
  };
}

/** The payment schedule of a row that has what one needs (a cycle and a start day); a row that lacks one has no payment day. */
function scheduleOf(row: PaidTermRow): PaymentScheduleFacts | null {
  if (row.startDate === null) return null;
  if (row.billingCycle !== 'MONTHLY' && row.billingCycle !== 'QUARTERLY' && row.billingCycle !== 'ANNUAL') return null;

  return {
    subscriptionId: row.id,
    planId: row.planId,
    responsibleItAdminEmployeeId: row.responsibleItAdminEmployeeId,
    billingCycle: row.billingCycle,
    startDate: fromDateColumn(row.startDate),
    endDate: row.endDate ? fromDateColumn(row.endDate) : null,
    renewalDate: row.renewalDate ? fromDateColumn(row.renewalDate) : null,
    autoRenew: row.autoRenew,
    recordedAt: row.createdAt,
  };
}

/**
 * The periods of the subscriptions as the renewal of a subscription reads and continues them (`QĐ-16`, `US-11-03`): the milestone
 * derived by the same rule the subscription is read with, the period that already continues one, and the new period recorded
 * from what the vendor confirmed, chained to the old one in the transaction of the caller. Nothing here decides a renewal.
 */
@Injectable()
export class SubscriptionPeriodService {
  constructor(
    private readonly subscriptions: SubscriptionRepo,
    private readonly periods: SubscriptionPeriodRepo,
    private readonly plans: PlanFactsService,
    private readonly pricing: SubscriptionPricingService,
    private readonly audit: AuditApi,
    private readonly pool: SubscriptionPoolService,
    private readonly windows: SubscriptionWindowsService,
    private readonly periodLines: SubscriptionPeriodLinesService,
  ) {}

  linesOfSubscription(subscriptionId: string, tx?: DbTx): Promise<SubscriptionLineRecord[]> {
    return this.periodLines.linesOf(subscriptionId, tx);
  }

  linesOfSubscriptions(subscriptionIds: readonly string[], tx?: DbTx): Promise<Map<string, SubscriptionLineRecord[]>> {
    return this.periodLines.linesOfMany(subscriptionIds, tx);
  }

  /** The periods with these ids, by id; an id that does not exist is absent. */
  async facts(ids: readonly string[], tx?: DbTx): Promise<RenewalPeriodFacts[]> {
    const records = await this.subscriptions.findMany(ids, tx);

    return this.withSuccessors(records, tx);
  }

  /** The ids of the subscriptions this IT Admin answers for. */
  idsResponsibleFor(employeeId: string, tx?: DbTx): Promise<string[]> {
    return this.subscriptions.idsResponsibleFor(employeeId, tx);
  }

  /** What a purchase invoice reads of the subscriptions with these ids, the shared pool's included; an id that does not exist is absent. */
  async purchaseFacts(ids: readonly string[], tx?: DbTx): Promise<SubscriptionPurchaseFacts[]> {
    const records = await this.subscriptions.findMany(ids, tx);
    const successors = await this.periods.successorPoolFactsOf(
      records.map((record) => record.id),
      tx,
    );

    return records.map((record) => toSubscriptionPurchaseFacts(record, successors.get(record.id)));
  }

  /** Adjustment windows active for each subscription's period running on `referenceDay`. */
  async adjustmentWindowsOf(
    ids: readonly string[],
    referenceDay: BusinessDate,
    tx?: DbTx,
  ): Promise<Map<string, PoolAdjustmentWindows>> {
    const records = await this.subscriptions.findMany(ids, tx);

    return this.windows.of(records, referenceDay, tx);
  }

  /** Earliest date on which a seat reduction asked on `day` can take effect for `subscriptionId`, or null when unavailable. */
  async earliestReducibleOnFor(subscriptionId: string, day: BusinessDate, tx?: DbTx): Promise<BusinessDate | null> {
    const record = await this.subscriptions.find(subscriptionId, tx);
    if (!record) return null;

    return earliestReducibleOn(record, day);
  }

  /** The period, locked `FOR UPDATE` until the caller's transaction ends (the lock a seat of it takes too); null if absent. */
  async lock(tx: DbTx, id: string): Promise<RenewalPeriodFacts | null> {
    const record = await this.subscriptions.lock(tx, id);
    if (!record) return null;

    return (await this.withSuccessors([record], tx))[0];
  }

  /**
   * The active K2 terms (the shared pool's workspaces, those of a department too) that no later period continues, at most `SWEEP_LIMIT`:
   * the periods that have a point of adjustment (`SBF-20`). A perpetual purchase, a draft and the other kinds of plan are never among them.
   */
  async adjustmentSubjects(): Promise<RenewalPeriodFacts[]> {
    const records = await this.subscriptions.findMany(await this.periods.listAdjustmentSubjectIds(SWEEP_LIMIT));
    const facts = await this.withSuccessors(records);

    return facts.filter((period) => period.renewedById === null);
  }

  /**
   * The subscriptions that run a period, with the days their payments follow (`PI-2`) and the IT Admin who answers for each. One statement; the invoices of the periods are not read here.
   */
  async paymentSchedules(tx?: DbTx): Promise<PaymentScheduleFacts[]> {
    return (await this.subscriptions.listPaidTerms(tx)).flatMap((row) => scheduleOf(row) ?? []);
  }

  /**
   * Records the period the vendor confirmed as the continuation of `previousSubscriptionId`, in the caller's transaction (which
   * holds the old period locked): the same plan, owner and kind, the price recorded and converted today, the link set once. A
   * period that is already continued, one that is not a term, a retired application or a start that is not later is refused
   * with nothing written. Throws SubscriptionPeriodRefusedError.
   */
  async recordNext(tx: DbTx, actor: PeriodAuditActor, input: NextPeriodInput): Promise<RenewalPeriodFacts> {
    const previous = await this.requireRenewablePrevious(tx, input);
    const plan = await this.plans.lockShared(tx, previous.planId);
    if (!plan || plan.applicationStatus === 'RETIRED') throw new SubscriptionPeriodRefusedError('APPLICATION_RETIRED');

    const oldLines = await this.periodLines.linesOf(previous.id, tx);
    const state = this.buildNextState(previous, input);
    this.assertNextPeriod(plan, state, input.billingCycle, previous);

    const linePricing = await this.resolveNextPricing(tx, previous, oldLines, state.purchasedQuantity ?? 0, input);
    const organization = await this.pricing.getOrganization(tx);
    if (!organization) throw new Error('A renewal was recorded before installation');

    const status = subscriptionStatusOf(plan, 'TERM', linePricing.statusState(state));
    const takesPrimary = status === 'ACTIVE' && previous.isPrimaryForPlan;
    if (takesPrimary) await this.pool.releasePrimary(tx, actor, organization.id, previous.id);
    if (oldLines.length > 0)
      await this.periodLines.closeLines(tx, previous.id, addDays(input.startDate, -1), 'RENEWED');

    const created = await this.subscriptions.insert(tx, {
      organizationId: organization.id,
      planId: previous.planId,
      kind: 'TERM',
      renewedFromId: previous.id,
      ...state,
      minimumSeatsTotal: previous.minimumSeatsTotal,
      ...linePricing.priced,
      monthlyUnitPriceMinor: linePricing.monthlyUnitPriceMinor,
      originalPrice: null,
      isPrimaryForPlan: takesPrimary,
      status,
    });
    await this.recordNextLinesAndAudit(tx, organization.id, created, previous, linePricing.resolved, input, actor);

    return (await this.withSuccessors([created], tx))[0];
  }

  private buildNextState(previous: SubscriptionRecord, input: NextPeriodInput) {
    const totalQuantity = input.lines
      ? input.lines.reduce((sum, item) => sum + item.quantity, 0)
      : (input.purchasedQuantity ?? 0);

    return {
      ...declaredStateOf({ ...input, purchasedQuantity: totalQuantity }),
      commitmentTermMonths: previous.commitmentTermMonths,
      responsibleItAdminEmployeeId: previous.responsibleItAdminEmployeeId,
      vendorMinimumSeats: previous.vendorMinimumSeats,
      workspaceId: previous.workspace?.id ?? null,
      seatCounting: previous.seatCounting,
      invoicedLater: previous.invoicedLater,
    };
  }

  private async recordNextLinesAndAudit(
    tx: DbTx,
    organizationId: string,
    created: SubscriptionRecord,
    previous: SubscriptionRecord,
    resolved: readonly { oldLine: SubscriptionLineRecord; quantity: number; monthlyUnitPriceMinor: bigint }[],
    input: NextPeriodInput,
    actor: PeriodAuditActor,
  ): Promise<void> {
    const recordedByEmployeeId = input.recordedByEmployeeId ?? ('employeeId' in actor ? actor.employeeId : null);
    await this.periodLines.createRenewedLines(tx, {
      organizationId,
      nextSubscriptionId: created.id,
      workspaceId: previous.workspace?.id ?? null,
      startDate: input.startDate,
      renewalId: input.renewalId ?? null,
      autoRecorded: input.autoRecorded ?? false,
      recordedByEmployeeId,
      resolved,
    });
    await this.audit.record(
      tx,
      catalogAuditEvent(actor, organizationId, 'SUBSCRIPTION.RENEWED', 'Subscription', created.id, null, {
        ...snapshotOf(created),
        renewedFromId: previous.id,
      }),
    );
  }

  /** Closes all live lines of `subscriptionId` with `closedReason = 'ENDED'` on `closedOn` when an unrenewed period expires. */
  async closeExpiredLines(tx: DbTx, subscriptionId: string, closedOn: BusinessDate): Promise<void> {
    await this.periodLines.closeLines(tx, subscriptionId, closedOn, 'ENDED');
  }

  private async requireRenewablePrevious(tx: DbTx, input: NextPeriodInput): Promise<SubscriptionRecord> {
    const previous = await this.subscriptions.find(input.previousSubscriptionId, tx);
    if (!previous) throw new SubscriptionPeriodRefusedError('NOT_FOUND');
    if (previous.kind !== 'TERM') throw new SubscriptionPeriodRefusedError('NOT_TERM');
    if ((await this.subscriptions.successorsOf([previous.id], tx)).has(previous.id)) {
      throw new SubscriptionPeriodRefusedError('ALREADY_RENEWED');
    }
    if (previous.startDate !== null && input.startDate <= previous.startDate) {
      throw new SubscriptionPeriodRefusedError('STARTS_TOO_EARLY');
    }

    return previous;
  }

  private async readVndPrice(unitPrice: { amount: string; currency: string }, path?: string) {
    return this.pricing.read(unitPrice, path).catch((error: unknown) => {
      if (error instanceof SubscriptionPriceNotVndError) throw new SubscriptionPeriodRefusedError('PRICE_NOT_VND');
      throw error;
    });
  }

  private async resolveNextPricing(
    tx: DbTx,
    previous: SubscriptionRecord,
    oldLines: readonly SubscriptionLineRecord[],
    totalQuantity: number,
    input: NextPeriodInput,
  ) {
    if (!input.lines) return this.resolveLegacyPricing(tx, oldLines, totalQuantity, input);

    const resolved = await this.resolveInputLines(oldLines, input);
    const kept = resolved.filter((entry) => entry.quantity > 0);
    const single = this.singleLinePrice(kept, oldLines.length, input.billingCycle);
    const priced = single.unitMoney
      ? await this.pricing.priceToday(tx, single.unitMoney)
      : { unitPrice: null, priceSnapshot: null };
    const minor = kept[0]?.monthlyUnitPriceMinor ?? previous.monthlyUnitPriceMinor ?? 0n;
    const fallbackUnit = { amountMinor: minor, currency: 'VND' as const, recordedOn: input.startDate };
    const fallbackSnap = {
      rate: 1n,
      rateDate: input.startDate,
      rateSource: 'SAME_CURRENCY' as const,
      reportingMinor: minor,
      reportingCurrency: 'VND' as const,
      exchangeRateId: null,
    };

    return {
      priced,
      monthlyUnitPriceMinor: single.monthlyUnitPriceMinor,
      resolved,
      statusState: <T extends Record<string, unknown>>(s: T) => ({
        ...s,
        unitPrice: priced.unitPrice ?? fallbackUnit,
        priceSnapshot: priced.priceSnapshot ?? fallbackSnap,
      }),
    };
  }

  private async resolveLegacyPricing(
    tx: DbTx,
    oldLines: readonly SubscriptionLineRecord[],
    totalQuantity: number,
    input: NextPeriodInput,
  ) {
    const priced = await this.pricing.priceToday(tx, await this.readVndPrice(input.unitPrice!, input.unitPricePath));
    const monthlyUnitPriceMinor = derivedMonthlyUnitPriceMinor(priced.unitPrice, input.billingCycle);
    const resolved =
      oldLines.length === 1 && totalQuantity > 0
        ? [
            {
              oldLine: oldLines[0],
              quantity: totalQuantity,
              monthlyUnitPriceMinor: monthlyUnitPriceMinor ?? oldLines[0].monthlyUnitPriceMinor,
            },
          ]
        : [];
    return {
      priced,
      monthlyUnitPriceMinor,
      resolved,
      statusState: <T extends Record<string, unknown>>(s: T) => ({ ...s, ...priced }),
    };
  }

  private singleLinePrice(
    kept: readonly { monthlyUnitPriceMinor: bigint }[],
    oldLineCount: number,
    billingCycle: BillingCycle,
  ) {
    if (kept.length !== 1 || oldLineCount !== 1) return { unitMoney: null, monthlyUnitPriceMinor: null };
    return resolveSubscriptionPrices({
      kind: 'TERM',
      billingCycle,
      cycleChanged: false,
      sentMonthly: { amountMinor: kept[0].monthlyUnitPriceMinor, currency: 'VND' },
      sentUnit: undefined,
    });
  }

  private async resolveInputLines(oldLines: readonly SubscriptionLineRecord[], input: NextPeriodInput) {
    const oldById = new Map(oldLines.map((line) => [line.id, line]));
    const resolved: { oldLine: SubscriptionLineRecord; quantity: number; monthlyUnitPriceMinor: bigint }[] = [];
    for (const item of input.lines ?? []) {
      const oldLine = oldById.get(item.previousLineId);
      if (!oldLine) throw new SubscriptionPeriodRefusedError('INVALID_TERMS');
      const minor = item.monthlyUnitPrice
        ? (await this.readVndPrice(item.monthlyUnitPrice, item.monthlyUnitPricePath ?? 'monthlyUnitPrice')).amountMinor
        : oldLine.monthlyUnitPriceMinor;
      resolved.push({ oldLine, quantity: item.quantity, monthlyUnitPriceMinor: minor });
    }
    return resolved;
  }

  /** Shape and commitment validation for the renewed period (R-G01, R-E01). Throws SubscriptionPeriodRefusedError. */
  private assertNextPeriod(
    plan: { applicationKind: ApplicationKind; provisioningType: ProvisioningType },
    state: ReturnType<typeof declaredStateOf> & { commitmentTermMonths: number | null },
    billingCycle: BillingCycle,
    previous: SubscriptionRecord,
  ): void {
    try {
      assertSubscriptionShape({
        kind: 'TERM',
        applicationKind: plan.applicationKind,
        planProvisioningType: plan.provisioningType,
        ...state,
      });
    } catch {
      throw new SubscriptionPeriodRefusedError('INVALID_DATES');
    }
    try {
      assertPoolTerms({
        kind: 'TERM',
        planProvisioningType: plan.provisioningType,
        billingCycle,
        commitmentTermMonths: previous.commitmentTermMonths,
        activating: false,
      });
    } catch {
      throw new SubscriptionPeriodRefusedError('INVALID_TERMS');
    }
  }

  private async withSuccessors(records: readonly SubscriptionRecord[], tx?: DbTx): Promise<RenewalPeriodFacts[]> {
    const successors = await this.subscriptions.successorsOf(
      records.map((r) => r.id),
      tx,
    );
    const today = await this.pricing.businessToday(new Date(), tx);
    const windows = await this.windows.of(records, today, tx);
    return records.map((record) =>
      factsOf(record, successors.get(record.id) ?? null, today, windows.get(record.id) as AdjustmentWindows),
    );
  }
}
