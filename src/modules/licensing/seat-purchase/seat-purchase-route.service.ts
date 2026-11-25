import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import { DONG, formatAmount } from '../../../core/money/money';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import {
  SeatLedgerApi,
  SeatLedgerBelowOccupancyError,
  SeatPurchaseItemNotPendingError,
  SeatPurchaseLineNotFoundError,
  SeatPurchaseNotInChargeError,
  assertLinePurchasableForPurchase,
  assertPurchaseDateWithinBounds,
  assertPurchaseModeValid,
  assertStockAllowsSeatPurchase,
  seatPurchaseExpectedAmount,
  seatPurchaseNetExpectedAmount,
  type SeatChangeRecord,
  type SeatPurchaseRecord,
  type SeatPurchaseRefItem,
} from '../../catalog/public/seat-ledger.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { ProvisioningNotInChargeError } from '../provisioning/provisioning.errors';
import { ProvisioningTaskFrame } from '../provisioning/provisioning-task-frame.service';
import { ProvisioningTaskRepo } from '../provisioning/provisioning-task.repo';
import { GrantRequestGateHook } from '../public/licensing.extension-points';
import type { SeatPurchaseBody, SeatPurchaseWire } from './seat-purchase.dto';
import { SharedPoolService } from '../shared-pool/shared-pool.service';

type PurchaseContext = NonNullable<Awaited<ReturnType<SeatLedgerApi['findWithPurchaseContext']>>>;
type LockedLine = NonNullable<Awaited<ReturnType<SeatLedgerApi['lockPeriodAndLine']>>>;

const pairKey = (requestId: string, beneficiaryEmployeeId: string): string => `${requestId}:${beneficiaryEmployeeId}`;

/**
 * Records a batch seat purchase (`MUA-xxxxxx`, `TOP_UP`), a vendor tier-step purchase (`TIER_STEP`), or a single-seat
 * line switch (`replacesFromLineId`) on a subscription line (`W3-18`, `W3-19`).
 * Lock order: period(s) `FOR UPDATE` (tier 6, `ORDER BY id`) -> line(s) `FOR UPDATE` (tier 6c, `ORDER BY id`) -> `seat_changes` (tier 6d).
 */
@Injectable()
export class SeatPurchaseRouteService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly seatLedger: SeatLedgerApi,
    private readonly frame: ProvisioningTaskFrame,
    private readonly tasks: ProvisioningTaskRepo,
    private readonly gate: GrantRequestGateHook,
    private readonly sharedPool: SharedPoolService,
    private readonly organizationReads: OrganizationReadApi,
  ) {}

  async purchase(actor: AuthenticatedPrincipal, lineId: string, input: SeatPurchaseBody): Promise<SeatPurchaseWire> {
    assertPurchaseModeValid({
      itemCount: input.items.length,
      tierStepSeats: input.tierStepSeats,
      replacesFromLineId: input.replacesFromLineId,
      targetLineId: lineId,
    });
    const now = new Date();
    const today = await this.organizationReads.businessToday(now);

    return this.runner.run((tx) =>
      input.replacesFromLineId !== undefined
        ? this.purchaseWithSwitch(tx, actor, lineId, input.replacesFromLineId, input, now, today)
        : this.purchaseSingleLine(tx, actor, lineId, input, now, today),
    );
  }

  private async purchaseSingleLine(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    lineId: string,
    input: SeatPurchaseBody,
    now: Date,
    today: BusinessDate,
  ): Promise<SeatPurchaseWire> {
    const context = await this.seatLedger.findWithPurchaseContext(lineId, tx);
    if (!context) throw new SeatPurchaseLineNotFoundError();
    const lockedLine = await this.seatLedger.lockPeriodAndLine(tx, context.period.id, lineId);
    if (!lockedLine) throw new SeatPurchaseLineNotFoundError();

    await this.validatePurchase(tx, actor, context, lockedLine, input, now, today);

    if (input.tierStepSeats !== undefined) {
      return this.executeTierStep(tx, actor, context, lockedLine, input, input.tierStepSeats, today);
    }

    return this.executeStandard(tx, actor, context, lockedLine, input, today);
  }

  private async validatePurchase(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    context: PurchaseContext,
    lockedLine: LockedLine,
    input: SeatPurchaseBody,
    now: Date,
    today: BusinessDate,
  ): Promise<void> {
    await this.authorizeItems(tx, actor, input.items, now);
    assertLinePurchasableForPurchase({
      line: lockedLine,
      period: context.period,
      provisioningType: context.plan.provisioningType,
      purchasedOn: input.purchasedOn,
    });
    assertPurchaseDateWithinBounds({
      purchasedOn: input.purchasedOn,
      today,
      periodStartDate: context.period.startDate,
    });
    await this.verifyPendingItems(tx, input.items, context.plan.id);
    await this.verifyStock(tx, context.plan.id, input.purchasedOn, input.items.length);
  }

  private async executeStandard(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    context: PurchaseContext,
    lockedLine: LockedLine,
    input: SeatPurchaseBody,
    today: BusinessDate,
  ): Promise<SeatPurchaseWire> {
    const { purchase, changes } = await this.seatLedger.buyForItems(
      tx,
      lockedLine,
      input.items.map(({ requestId, beneficiaryEmployeeId }) => ({ requestId, beneficiaryEmployeeId })),
      input.purchasedOn,
      { actor, alreadyLocked: true, checkClosedMonth: false, today },
    );
    await this.notifyBought(tx, actor, context, lockedLine.id, purchase);
    const expectedMinor = seatPurchaseExpectedAmount({
      seats: purchase.quantity,
      monthlyUnitPriceMinor: context.line.monthlyUnitPriceMinor,
      billingCycle: context.period.billingCycle,
      renewalDate: context.period.renewalDate,
      endDate: context.period.endDate,
      purchasedOn: input.purchasedOn,
    });

    return this.toWire(purchase, changes, expectedMinor);
  }

  private async executeTierStep(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    context: PurchaseContext,
    lockedLine: LockedLine,
    input: SeatPurchaseBody,
    tierStepSeats: number,
    today: BusinessDate,
  ): Promise<SeatPurchaseWire> {
    const item = input.items[0];
    const { purchase, change } = await this.seatLedger.recordTierStep(tx, lockedLine, {
      tierStepSeats,
      effectiveOn: input.purchasedOn,
      note: `Tier step +${tierStepSeats} seat(s)`,
      requestId: item.requestId,
      beneficiaryEmployeeId: item.beneficiaryEmployeeId,
      actor,
      alreadyLocked: true,
      checkClosedMonth: false,
      today,
    });
    if (!purchase) throw new Error('Tier-step purchase record was not created.');
    await this.notifyBought(tx, actor, context, lockedLine.id, purchase);
    await this.seatLedger.notifyVendorRecorded(tx, {
      organizationId: context.period.organizationId,
      subscriptionId: context.period.id,
      subscriptionLineId: lockedLine.id,
      seatChangeId: change.id,
      delta: change.delta,
      effectiveOn: change.effectiveOn,
      outOfProcess: false,
      responsibleItAdminEmployeeId: context.period.responsibleItAdminEmployeeId,
      notifyR1: false,
      notifyFinance: true,
      actor,
    });
    const expectedMinor = seatPurchaseExpectedAmount({
      seats: tierStepSeats,
      monthlyUnitPriceMinor: context.line.monthlyUnitPriceMinor,
      billingCycle: context.period.billingCycle,
      renewalDate: context.period.renewalDate,
      endDate: context.period.endDate,
      purchasedOn: input.purchasedOn,
    });

    return this.toWire(purchase, [change], expectedMinor);
  }

  private async purchaseWithSwitch(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    newLineId: string,
    oldLineId: string,
    input: SeatPurchaseBody,
    now: Date,
    today: BusinessDate,
  ): Promise<SeatPurchaseWire> {
    const [newContext, oldContext] = [
      await this.seatLedger.findWithPurchaseContext(newLineId, tx),
      await this.seatLedger.findWithPurchaseContext(oldLineId, tx),
    ];
    if (!newContext || !oldContext || newContext.period.organizationId !== oldContext.period.organizationId) {
      throw new SeatPurchaseLineNotFoundError();
    }
    const lockedLines = await this.seatLedger.lockPeriodsAndLines(
      tx,
      [newContext.period.id, oldContext.period.id],
      [newLineId, oldLineId],
    );
    const lockedNew = lockedLines.find((l) => l.id === newLineId);
    const lockedOld = lockedLines.find((l) => l.id === oldLineId);
    if (!lockedNew || !lockedOld) throw new SeatPurchaseLineNotFoundError();

    await this.validateSwitchPurchase(tx, actor, { newContext, oldContext, lockedNew, lockedOld, input, now, today });

    const reduced = await this.seatLedger.recordVendor(tx, lockedOld, {
      delta: -1,
      effectiveOn: input.purchasedOn,
      note: `Switched seat to line ${lockedNew.id}`,
      actor,
      alreadyLocked: true,
      checkClosedMonth: false,
      today,
    });
    const item = input.items[0];
    const bought = await this.seatLedger.buyForItems(
      tx,
      lockedNew,
      [{ requestId: item.requestId, beneficiaryEmployeeId: item.beneficiaryEmployeeId }],
      input.purchasedOn,
      { actor, alreadyLocked: true, checkClosedMonth: false, today },
    );
    await this.notifyBought(tx, actor, newContext, lockedNew.id, bought.purchase);

    const expectedMinor = this.switchExpectedAmount(
      oldContext,
      newContext,
      lockedOld.monthlyUnitPriceMinor,
      lockedNew.monthlyUnitPriceMinor,
      input.purchasedOn,
    );

    return this.toWire(bought.purchase, [reduced.change, ...bought.changes], expectedMinor);
  }

  private switchExpectedAmount(
    oldContext: PurchaseContext,
    newContext: PurchaseContext,
    oldMonthlyMinor: bigint,
    newMonthlyMinor: bigint,
    purchasedOn: BusinessDate,
  ): bigint | null {
    return seatPurchaseNetExpectedAmount([
      {
        seats: -1,
        monthlyUnitPriceMinor: oldMonthlyMinor,
        billingCycle: oldContext.period.billingCycle,
        renewalDate: oldContext.period.renewalDate,
        endDate: oldContext.period.endDate,
        purchasedOn,
      },
      {
        seats: 1,
        monthlyUnitPriceMinor: newMonthlyMinor,
        billingCycle: newContext.period.billingCycle,
        renewalDate: newContext.period.renewalDate,
        endDate: newContext.period.endDate,
        purchasedOn,
      },
    ]);
  }

  private async validateSwitchPurchase(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    params: {
      newContext: PurchaseContext;
      oldContext: PurchaseContext;
      lockedNew: LockedLine;
      lockedOld: LockedLine;
      input: SeatPurchaseBody;
      now: Date;
      today: BusinessDate;
    },
  ): Promise<void> {
    const { newContext, oldContext, lockedNew, lockedOld, input, now, today } = params;
    await this.authorizeItems(tx, actor, input.items, now);
    for (const [line, ctx] of [
      [lockedNew, newContext],
      [lockedOld, oldContext],
    ] as const) {
      assertLinePurchasableForPurchase({
        line,
        period: ctx.period,
        provisioningType: ctx.plan.provisioningType,
        purchasedOn: input.purchasedOn,
      });
      assertPurchaseDateWithinBounds({
        purchasedOn: input.purchasedOn,
        today,
        periodStartDate: ctx.period.startDate,
      });
    }
    await this.verifyPendingItems(tx, input.items, newContext.plan.id);
    await this.verifyStock(tx, newContext.plan.id, input.purchasedOn, 1);
    const oldStock = await this.sharedPool.stockOf(tx, oldContext.plan.id, input.purchasedOn, 'K2');
    const oldFree = oldStock.freeBySubscription.get(oldContext.period.id);
    if (oldFree !== undefined && oldFree < 1) throw new SeatLedgerBelowOccupancyError();
  }

  private notifyBought(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    context: PurchaseContext,
    lineId: string,
    purchase: SeatPurchaseRecord,
  ): Promise<number> {
    return this.seatLedger.notifySeatsBought(tx, {
      organizationId: context.period.organizationId,
      subscriptionId: context.period.id,
      subscriptionLineId: lineId,
      seatPurchaseId: purchase.id,
      quantity: purchase.quantity,
      responsibleItAdminEmployeeId: context.period.responsibleItAdminEmployeeId,
      actor,
    });
  }

  private async authorizeItems(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    items: SeatPurchaseBody['items'],
    now: Date,
  ): Promise<void> {
    const unauthorized: SeatPurchaseRefItem[] = [];
    for (const item of items) {
      try {
        await this.frame.requireActingItAdmin(tx, actor, {
          beneficiaryEmployeeId: item.beneficiaryEmployeeId,
          ...(item.taskId ? { taskId: item.taskId } : {}),
          now,
        });
      } catch (error) {
        if (error instanceof ProvisioningNotInChargeError) {
          unauthorized.push({ requestId: item.requestId, beneficiaryEmployeeId: item.beneficiaryEmployeeId });
        } else {
          throw error;
        }
      }
    }
    if (unauthorized.length > 0) throw new SeatPurchaseNotInChargeError(unauthorized);
  }

  private async verifyPendingItems(tx: DbTx, items: SeatPurchaseBody['items'], planId: string): Promise<void> {
    const approvedKeys = await this.gate.get().checkSeatPurchaseItems(tx, items, planId);
    const openTasks = await this.tasks.findOpenGrantTasksForItems(tx, items, planId);
    const toppedUpKeys = await this.seatLedger.existingTopUpItems(items, tx);

    const taskByPair = new Map<string, string>();
    for (const task of openTasks) {
      const key = pairKey(task.requestId, task.employeeId);
      if (!taskByPair.has(key)) taskByPair.set(key, task.taskId);
    }

    const failed: SeatPurchaseRefItem[] = [];
    for (const item of items) {
      const key = pairKey(item.requestId, item.beneficiaryEmployeeId);
      const openTaskId = taskByPair.get(key);
      const taskMatches = openTaskId !== undefined && (item.taskId === undefined || item.taskId === openTaskId);
      if (!approvedKeys.has(key) || !taskMatches || toppedUpKeys.has(key)) {
        failed.push({ requestId: item.requestId, beneficiaryEmployeeId: item.beneficiaryEmployeeId });
      }
    }
    if (failed.length > 0) throw new SeatPurchaseItemNotPendingError(failed);
  }

  private async verifyStock(tx: DbTx, planId: string, purchasedOn: string, requestedCount: number): Promise<void> {
    const pendingCount = await this.tasks.countPendingGrantTasksOfPlan(tx, planId);
    const stock = await this.sharedPool.stockOf(tx, planId, purchasedOn, 'K2');
    assertStockAllowsSeatPurchase({ requestedCount, pendingCount, freeOnPurchasedOn: stock.free });
  }

  private toWire(
    purchase: SeatPurchaseRecord,
    changes: readonly SeatChangeRecord[],
    expectedMinor: bigint | null,
  ): SeatPurchaseWire {
    return {
      id: purchase.id,
      code: purchase.code,
      quantity: purchase.quantity,
      purchasedOn: purchase.purchasedOn,
      invoiceObligation: purchase.invoiceObligation,
      invoiceDueOn: purchase.invoiceDueOn,
      expectedAmount: expectedMinor === null ? null : { amount: formatAmount(expectedMinor, 0), currency: DONG },
      changes: changes.map((c) => ({
        id: c.id,
        effectiveOn: c.effectiveOn,
        delta: c.delta,
        reason: c.reason,
        source: c.source,
        basis: c.basis,
        requestId: c.requestId,
        beneficiaryEmployeeId: c.beneficiaryEmployeeId,
        seatPurchaseId: c.seatPurchaseId,
      })),
    };
  }
}
