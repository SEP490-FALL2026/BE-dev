import { Injectable } from '@nestjs/common';
import { businessDateAt, type BusinessDate } from '../../../../core/business-date';
import { addMonths } from '../../../../core/fiscal-year';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import type { CatalogApi } from '../../../catalog/public/catalog.api';
import { LicenseLotApi } from '../../../catalog/public/license-lot.api';
import { SeatLedgerApi } from '../../../catalog/public/seat-ledger.api';
import type { SubscriptionPurchaseFacts } from '../../../catalog/public/subscription-period.types';
import { SubscriptionPeriodApi } from '../../../catalog/public/subscription-period.api';
import { LicensingOpenGrantsApi } from '../../../licensing/public/licensing-open-grants.api';
import { OrganizationReadApi } from '../../../organization/public/organization-read.api';
import { PurchaseInvoiceRefusedError } from '../purchase-invoice.errors';
import type { PurchaseInvoiceRepo } from '../purchase-invoice.repo';
import type { LinkFacts, PoolExpectationFacts } from '../purchase-invoice.types';
import { expectedPoolAmountOf, type PoolInvoiceExpectationSource } from './purchase-invoice-pool-expectation.policy';
import { pricingOf } from '../purchase-invoice-charge.policy';
import type { SeatPricing } from '../purchase-invoice.types';
import { servingMonthlyPriceMinor } from './serving-line-price.policy';

/**
 * Aggregates subscription-line, seat-purchase, and prior-month `NONE` purchase facts from `catalog` and `licensing`
 * for `PurchaseInvoicePlanService` (`N7`, `N9`, `invoicedLater MONTHLY`).
 */
@Injectable()
export class PurchaseInvoicePoolService {
  constructor(
    private readonly periods: SubscriptionPeriodApi,
    private readonly seatLedger: SeatLedgerApi,
    private readonly grants: LicensingOpenGrantsApi,
    private readonly organizationReads: OrganizationReadApi,
    private readonly lots: LicenseLotApi,
  ) {}

  findLot(lotId: string, tx?: DbTx) {
    return this.lots.findLot(lotId, tx);
  }

  findLotOfRequest(requestId: string, tx?: DbTx) {
    return this.lots.findLotOfRequest(requestId, tx);
  }

  lockLot(lotId: string, tx: DbTx) {
    return this.lots.lockLot(tx, lotId);
  }

  get lotApi(): LicenseLotApi {
    return this.lots;
  }

  getPurchaseFacts(subscriptionIds: readonly string[], tx?: DbTx): Promise<SubscriptionPurchaseFacts[]> {
    return this.periods.getPurchaseFacts(subscriptionIds, tx);
  }

  topUpPurchaseIdsOfRequest(requestId: string, tx?: DbTx): Promise<string[]> {
    return this.seatLedger.topUpPurchaseIdsOfRequest(requestId, tx);
  }

  findSeatPurchase(seatPurchaseId: string, tx?: DbTx) {
    return this.seatLedger.findSeatPurchase(seatPurchaseId, tx);
  }

  linesOfIds(lineIds: readonly string[], tx?: DbTx) {
    return this.seatLedger.linesOfIds(lineIds, tx);
  }

  linesOfSubscription(subscriptionId: string, tx?: DbTx) {
    return this.seatLedger.linesOfSubscription(subscriptionId, tx);
  }

  /** Locks the subscription period `FOR UPDATE` (Tier 6) before checking or inserting period invoices (`F-9`). */
  lockPeriod(tx: DbTx, subscriptionId: string) {
    return this.periods.lockPeriod(tx, subscriptionId);
  }

  async topUpPurchaseDatesOf(requestId: string, timeZone: string, tx?: DbTx): Promise<BusinessDate[] | null> {
    const tasks = await this.grants.listCompletedPoolTopUpPurchasesOfRequest(requestId, tx);
    if (tasks.length === 0 || tasks.some((task) => task.purchasedAt === null)) return null;

    return tasks.map((task) => businessDateAt(task.purchasedAt as Date, timeZone));
  }

  async subscriptionSource(input: {
    subscriptionId: string;
    period: SubscriptionPurchaseFacts;
    serviceMonth: BusinessDate;
    seatPurchaseId: string | null;
    subscriptionLineIds: readonly string[];
    tx?: DbTx;
  }): Promise<PoolInvoiceExpectationSource> {
    if (input.seatPurchaseId !== null) {
      return this.seatPurchaseSource(input.seatPurchaseId, input.period, input.serviceMonth, input.tx);
    }
    if (input.period.provisioningType !== 'K2') {
      return this.wholeSubscriptionSource(input.period);
    }

    return this.subscriptionLinesSource(
      input.subscriptionId,
      input.period,
      input.serviceMonth,
      input.subscriptionLineIds,
      input.tx,
    );
  }

  async subscriptionPoolExpectation(
    subscriptionId: string,
    serviceMonth: BusinessDate,
    seatPurchaseId: string | null,
    subscriptionLineIds: readonly string[],
    tx?: DbTx,
  ): Promise<PoolExpectationFacts> {
    const [period] = await this.periods.getPurchaseFacts([subscriptionId], tx);
    if (!period || period.provisioningType !== 'K2') return { isK2: false };
    const timeZone = await this.timeZone(tx);

    return {
      isK2: true,
      poolSubscriptionId: subscriptionId,
      timeZone,
      source: await this.subscriptionSource({
        subscriptionId,
        period,
        serviceMonth,
        seatPurchaseId,
        subscriptionLineIds,
        tx,
      }),
    };
  }

  /**
   * What a request's top-up of seats is expected to cost, priced at the line of the period that serves the plan of the request: the price
   * columns of a period with lines are only a record, so they price the top-up only when the period has no line.
   */
  async topUpSource(
    period: SubscriptionPurchaseFacts | undefined,
    planId: string,
    purchaseDates: BusinessDate[] | null,
    tx?: DbTx,
  ): Promise<Extract<PoolExpectationFacts, { isK2: true }>['source']> {
    const lines = period
      ? ((await this.periods.linesOfSubscriptions([period.subscriptionId], tx)).get(period.subscriptionId) ?? [])
      : [];

    return {
      kind: 'REQUEST_TOP_UP',
      billingCycle: period?.billingCycle ?? null,
      monthlyPriceMinor: period ? servingMonthlyPriceMinor(lines, planId, period.monthlyPriceMinor) : null,
      renewalDate: period?.renewalDate ?? null,
      endDate: period?.endDate ?? null,
      purchaseDates,
    };
  }

  /**
   * The price a seat of `planId` of this period is judged by (the ceiling of an invoice of the pool): the line of the period that serves the
   * plan, the price columns of the period only when it has no line.
   */
  async seatPricingOf(period: SubscriptionPurchaseFacts, planId: string, tx?: DbTx): Promise<SeatPricing> {
    const lines =
      (await this.periods.linesOfSubscriptions([period.subscriptionId], tx)).get(period.subscriptionId) ?? [];

    return pricingOf({
      ...period,
      monthlyPriceMinor: servingMonthlyPriceMinor(lines, planId, period.monthlyPriceMinor),
    });
  }

  async isPoolExpectedMissing(
    poolSource: PoolInvoiceExpectationSource | null,
    requestId: string | null,
    tx?: DbTx,
  ): Promise<boolean> {
    if (poolSource === null) return false;
    if (poolSource.kind !== 'REQUEST_TOP_UP') return expectedPoolAmountOf(poolSource) === null;
    if (requestId === null) return true;
    const purchaseDates = await this.topUpPurchaseDatesOf(requestId, await this.timeZone(tx), tx);

    return expectedPoolAmountOf({ ...poolSource, purchaseDates }) === null;
  }

  private wholeSubscriptionSource(period: SubscriptionPurchaseFacts): PoolInvoiceExpectationSource {
    return {
      kind: 'SUBSCRIPTION',
      billingCycle: period.billingCycle,
      purchasedQuantity: period.purchasedQuantity,
      monthlyPriceMinor: period.monthlyPriceMinor,
    };
  }

  private async seatPurchaseSource(
    seatPurchaseId: string,
    period: SubscriptionPurchaseFacts,
    serviceMonth: BusinessDate,
    tx?: DbTx,
  ): Promise<PoolInvoiceExpectationSource> {
    const purchase = await this.seatLedger.findSeatPurchase(seatPurchaseId, tx);
    const [line] = purchase ? await this.seatLedger.linesOfIds([purchase.subscriptionLineId], tx) : [];

    return {
      kind: 'SEAT_PURCHASE',
      billingCycle: period.billingCycle,
      monthlyPriceMinor: line?.monthlyUnitPriceMinor ?? period.monthlyPriceMinor,
      quantity: purchase?.quantity ?? 0,
      purchasedOn: purchase?.purchasedOn ?? serviceMonth,
      renewalDate: period.renewalDate,
      endDate: period.endDate,
    };
  }

  private async subscriptionLinesSource(
    subscriptionId: string,
    period: SubscriptionPurchaseFacts,
    serviceMonth: BusinessDate,
    subscriptionLineIds: readonly string[],
    tx?: DbTx,
  ): Promise<PoolInvoiceExpectationSource> {
    const lines = (await this.seatLedger.linesOfSubscription(subscriptionId, tx)).filter(
      (l) => l.closedReason !== 'REMOVED',
    );
    if (lines.length === 0) return this.wholeSubscriptionSource(period);

    const selectedLines =
      subscriptionLineIds.length > 0 ? lines.filter((l) => subscriptionLineIds.includes(l.id)) : lines;
    const billingDay = period.startDate !== null && serviceMonth < period.startDate ? period.startDate : serviceMonth;
    const seatsMap = await this.seatLedger.seatsOnDays(
      selectedLines.map((l) => l.id),
      billingDay,
      billingDay,
      tx,
    );
    const lineEntries = selectedLines.map((l) => ({
      seats: seatsMap.get(l.id)?.get(billingDay) ?? period.purchasedQuantity ?? 0,
      monthlyPriceMinor: l.monthlyUnitPriceMinor,
    }));
    const foldedPurchases = await this.foldedMonthlyPurchases(
      subscriptionId,
      period,
      serviceMonth,
      new Set(selectedLines.map((l) => l.id)),
      tx,
    );

    return {
      kind: 'SUBSCRIPTION_LINES',
      billingCycle: period.billingCycle,
      lines: lineEntries,
      ...(foldedPurchases.length > 0 ? { foldedPurchases } : {}),
    };
  }

  private async foldedMonthlyPurchases(
    subscriptionId: string,
    period: SubscriptionPurchaseFacts,
    serviceMonth: BusinessDate,
    selectedLineIds: ReadonlySet<string>,
    tx?: DbTx,
  ) {
    if (!period.invoicedLater || period.billingCycle !== 'MONTHLY') return [];
    const prevMonthStart = addMonths(serviceMonth, -1);
    const rows = await this.seatLedger.ofSubscriptionMonthNoInvoice(subscriptionId, prevMonthStart, serviceMonth, tx);

    return rows
      .filter((r) => selectedLineIds.has(r.purchase.subscriptionLineId))
      .map((r) => ({
        quantity: r.purchase.quantity,
        monthlyPriceMinor: r.monthlyUnitPriceMinor,
        purchasedOn: r.purchase.purchasedOn,
        renewalDate: period.renewalDate,
        endDate: period.endDate,
      }));
  }

  async timeZone(tx?: DbTx): Promise<string> {
    return ((await this.organizationReads.getOrganization(tx)) as { timeZone: string }).timeZone;
  }

  /** Builds link facts for a `LICENSE_LOT` purchase invoice, checking acting scope and `F14a` double-invoicing. */
  async buildLicenseLotLinkFacts(deps: {
    licenseLotId: string;
    serviceMonth: BusinessDate;
    scope: readonly string[];
    invoices: PurchaseInvoiceRepo;
    catalog: CatalogApi;
    tx?: DbTx;
  }): Promise<LinkFacts> {
    const lot = await this.findLot(deps.licenseLotId, deps.tx);
    if (!lot) throw new PurchaseInvoiceRefusedError('LINK_NOT_FOUND');

    const request =
      lot.purpose === 'REQUEST' && lot.requestId !== null
        ? await deps.invoices.requestFacts(lot.requestId, deps.tx)
        : null;
    if (lot.purpose === 'REQUEST' && (!request || !deps.scope.includes(request.departmentId))) {
      throw new PurchaseInvoiceRefusedError('LINK_NOT_FOUND');
    }
    if (lot.invoiceActualMinor !== null) throw new PurchaseInvoiceRefusedError('LOT_ALREADY_INVOICED');

    const vendorId = await deps.catalog.getPlanVendorId(lot.planId, deps.tx);
    if (vendorId === null) throw new PurchaseInvoiceRefusedError('NO_VENDOR');

    const expectedUnitPrice = (await deps.catalog.getPlanOriginalPrice(lot.planId, deps.tx, deps.serviceMonth)) ?? {
      amountMinor: lot.unitPriceMinor,
      currency: 'VND',
    };

    return {
      organizationId: lot.organizationId,
      link: { kind: 'LICENSE_LOT', licenseLotId: deps.licenseLotId },
      vendorId,
      continuation: false,
      startMonth: null,
      termMonths: null,
      expectedQuantity: lot.licenseCount,
      expectedUnitPrice,
      requestCostCenterId: request?.costCenterId ?? null,
      requestId: lot.requestId,
      holderBound: false,
      failedGrantDepartmentId: null,
      poolSubscriptionId: null,
      seatPricing: null,
      poolSource: null,
      renewedAssignmentId: null,
      licenseLotId: lot.id,
    };
  }
}
