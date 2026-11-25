import { Injectable } from '@nestjs/common';
import { DONG, formatAmount } from '../../../core/money/money';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import {
  SeatLedgerApi,
  SeatPurchaseItemNotPendingError,
  SeatPurchaseLineNotFoundError,
  SeatPurchaseNotInChargeError,
  assertLinePurchasableForPurchase,
  assertPurchaseDateWithinBounds,
  assertStockAllowsSeatPurchase,
  seatPurchaseExpectedAmount,
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

const pairKey = (requestId: string, beneficiaryEmployeeId: string): string => `${requestId}:${beneficiaryEmployeeId}`;

/**
 * Records a batch seat purchase (`MUA-xxxxxx`, `TOP_UP`) on a subscription line (`W3-18`):
 * locks period (tier 6) -> line (tier 6c) inside one transaction and validates in exact spec order:
 * acting IT Admin -> line purchasability -> purchase date bounds -> item readiness -> stock capacity (`pending - free`).
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
    const now = new Date();
    const today = await this.organizationReads.businessToday(now);

    return this.runner.run(async (tx) => {
      const context = await this.seatLedger.findWithPurchaseContext(lineId, tx);
      if (!context) throw new SeatPurchaseLineNotFoundError();

      const lockedLine = await this.seatLedger.lockPeriodAndLine(tx, context.period.id, lineId);
      if (!lockedLine) throw new SeatPurchaseLineNotFoundError();

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

      const { purchase, changes } = await this.seatLedger.buyForItems(
        tx,
        lockedLine,
        input.items.map(({ requestId, beneficiaryEmployeeId }) => ({ requestId, beneficiaryEmployeeId })),
        input.purchasedOn,
        { actor, alreadyLocked: true, checkClosedMonth: false, today },
      );

      await this.seatLedger.notifySeatsBought(tx, {
        organizationId: context.period.organizationId,
        subscriptionId: context.period.id,
        subscriptionLineId: lockedLine.id,
        seatPurchaseId: purchase.id,
        quantity: purchase.quantity,
        responsibleItAdminEmployeeId: context.period.responsibleItAdminEmployeeId,
        actor,
      });

      return this.toWire(purchase, changes, context, input.purchasedOn);
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
    context: NonNullable<Awaited<ReturnType<SeatLedgerApi['findWithPurchaseContext']>>>,
    purchasedOn: string,
  ): SeatPurchaseWire {
    const expectedMinor = seatPurchaseExpectedAmount({
      seats: purchase.quantity,
      monthlyUnitPriceMinor: context.line.monthlyUnitPriceMinor,
      billingCycle: context.period.billingCycle,
      renewalDate: context.period.renewalDate,
      endDate: context.period.endDate,
      purchasedOn,
    });

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
