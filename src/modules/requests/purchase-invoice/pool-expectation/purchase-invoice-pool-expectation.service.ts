import { Injectable } from '@nestjs/common';
import { businessDateAt, type BusinessDate } from '../../../../core/business-date';
import { addMonths } from '../../../../core/fiscal-year';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import { SeatLedgerApi } from '../../../catalog/public/seat-ledger.api';
import { SubscriptionPeriodApi } from '../../../catalog/public/subscription-period.api';
import type { SubscriptionPurchaseFacts } from '../../../catalog/public/subscription-period.types';
import { LicensingOpenGrantsApi } from '../../../licensing/public/licensing-open-grants.api';
import { OrganizationReadApi } from '../../../organization/public/organization-read.api';
import { expectedPoolAmountOf, type PoolInvoiceExpectationSource } from './purchase-invoice-pool-expectation.policy';
import type { PoolExpectationFacts } from '../purchase-invoice.types';

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
  ) {}

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

  topUpSource(
    period: SubscriptionPurchaseFacts | undefined,
    purchaseDates: BusinessDate[] | null,
  ): Extract<PoolExpectationFacts, { isK2: true }>['source'] {
    return {
      kind: 'REQUEST_TOP_UP',
      billingCycle: period?.billingCycle ?? null,
      monthlyPriceMinor: period?.monthlyPriceMinor ?? null,
      renewalDate: period?.renewalDate ?? null,
      endDate: period?.endDate ?? null,
      purchaseDates,
    };
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
}
