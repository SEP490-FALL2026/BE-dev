import { Injectable } from '@nestjs/common';
import { addDays, type BusinessDate } from '../../../../core/business-date';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import { isCheckViolation } from '../../../../infrastructure/database/unique-violation';
import { AuditApi } from '../../../audit/public/audit.api';
import { OperatingParametersApi } from '../../../operating-parameters/public/operating-parameters.api';
import { OrganizationReadApi } from '../../../organization/public/organization-read.api';
import { catalogAuditEvent } from '../../catalog-audit-event.mapper';
import { SeatPurchaseService } from '../purchase/seat-purchase.service';
import type { SeatPurchaseRecord } from '../purchase/seat-purchase.types';
import { SeatLedgerBelowOccupancyError, SubscriptionLineNotFoundError } from '../subscription-line.errors';
import { SubscriptionLineRepo } from '../subscription-line.repo';
import type { SubscriptionLineRecord } from '../subscription-line.types';
import { SeatLedgerInvalidEntryError } from './seat-ledger.errors';
import {
  SEAT_PURCHASE_INVOICE_DUE_WORKING_DAYS,
  SEAT_PURCHASE_LATE_INVOICE_DAYS,
  assertManualEffectiveOn,
  buildSeatChangeForDoor,
  computeSeatsOnDays,
  seatPurchaseInvoiceDue,
  type LedgerBillingCycle,
} from './seat-ledger.policy';
import { SeatLedgerRepo } from './seat-ledger.repo';
import type {
  BuyForItemsOptions,
  BuyForItemsResult,
  LineTargetRef,
  NewSeatChange,
  OpenLinesInput,
  OpenNextPeriodInput,
  RecordMemberOptions,
  RecordVendorInput,
  RecordVendorResult,
  SeatChangeRecord,
  SeatPurchaseItemInput,
} from './seat-ledger.types';

/**
 * The single write service for `seat_changes` and `seat_purchases`.
 * Lock order: callers hold the period `FOR UPDATE` (tier 6) when needed; every method locks the target line(s)
 * `FOR UPDATE` (tier 6c, sorted by `id` ascending when multiple lines are touched) before writing ledger rows (tier 6d).
 */
@Injectable()
export class SeatLedgerService {
  constructor(
    private readonly lines: SubscriptionLineRepo,
    private readonly ledger: SeatLedgerRepo,
    private readonly purchases: SeatPurchaseService,
    private readonly parameters: OperatingParametersApi,
    private readonly organizationReads: OrganizationReadApi,
    private readonly audit: AuditApi,
  ) {}

  /** Opens the ledger of newly activated lines (`ADJUSTMENT` / `INITIAL`), without closed-month restriction. */
  async openLines(tx: DbTx, input: OpenLinesInput): Promise<SeatChangeRecord[]> {
    const ordered = [...input.lines].sort((a, b) => a.lineId.localeCompare(b.lineId));
    const created: SeatChangeRecord[] = [];
    for (const item of ordered) {
      const locked = await this.requireLockedLine(tx, item.lineId);
      await this.lines.openLedger(tx, locked.id, item.effectiveOn);
      if (item.quantity > 0) {
        const row = buildSeatChangeForDoor({
          organizationId: locked.organizationId,
          subscriptionLineId: locked.id,
          effectiveOn: item.effectiveOn,
          recordedByEmployeeId: item.recordedByEmployeeId ?? null,
          source: 'ADJUSTMENT',
          reason: 'INITIAL',
          delta: item.quantity,
        });
        created.push(await this.insertLedgerRow(tx, row));
      }
    }

    return created;
  }

  /**
   * Purchases one seat per requested item (`TOP_UP`) and writes one `GRANT` ledger row (`+1`) per item under a single
   * `MUA-xxxxxx` purchase record. Enforces the open-month check unless `checkClosedMonth === false` (renewal carry).
   */
  async buyForItems(
    tx: DbTx,
    lineRef: LineTargetRef,
    items: readonly SeatPurchaseItemInput[],
    effectiveOn: BusinessDate,
    options: BuyForItemsOptions,
  ): Promise<BuyForItemsResult> {
    if (items.length === 0)
      throw new SeatLedgerInvalidEntryError('At least one request item is required to buy seats.');
    const line = await this.resolveLockedLine(tx, lineRef, options.alreadyLocked);
    if (options.checkClosedMonth !== false) {
      const today = options.today ?? (await this.organizationReads.businessToday(new Date(), tx));
      assertManualEffectiveOn(effectiveOn, today);
    }

    const due = await this.computePurchaseDue(tx, line.id, effectiveOn);
    const purchase = await this.purchases.insert(tx, {
      organizationId: line.organizationId,
      subscriptionLineId: line.id,
      kind: 'TOP_UP',
      purchasedOn: effectiveOn,
      quantity: items.length,
      invoiceObligation: due.invoiceObligation,
      invoiceDueOn: due.invoiceDueOn,
      recordedByEmployeeId: options.actor.employeeId,
    });

    const changes: SeatChangeRecord[] = [];
    for (const item of items) {
      const row = buildSeatChangeForDoor({
        organizationId: line.organizationId,
        subscriptionLineId: line.id,
        effectiveOn,
        recordedByEmployeeId: options.actor.employeeId,
        source: 'GRANT',
        requestId: item.requestId,
        beneficiaryEmployeeId: item.beneficiaryEmployeeId,
        seatPurchaseId: purchase.id,
      });
      changes.push(await this.insertLedgerRow(tx, row));
    }

    await this.auditPurchase(tx, options.actor, line.organizationId, purchase);

    return { purchase, changes };
  }

  /**
   * Records a vendor-confirmed seat adjustment (`VENDOR_RECORD`, `TOP_UP` or `REDUCE`), optionally paired with a `TIER_STEP`
   * purchase when `tierStep` is true. Enforces the open-month check unless explicitly bypassed.
   */
  async recordVendor(tx: DbTx, lineRef: LineTargetRef, input: RecordVendorInput): Promise<RecordVendorResult> {
    const line = await this.resolveLockedLine(tx, lineRef, input.alreadyLocked);
    if (input.checkClosedMonth !== false) {
      const today = input.today ?? (await this.organizationReads.businessToday(new Date(), tx));
      assertManualEffectiveOn(input.effectiveOn, today);
    }

    let purchase: SeatPurchaseRecord | null = null;
    if (input.tierStep) {
      const due = await this.computePurchaseDue(tx, line.id, input.effectiveOn);
      purchase = await this.purchases.insert(tx, {
        organizationId: line.organizationId,
        subscriptionLineId: line.id,
        kind: 'TIER_STEP',
        purchasedOn: input.effectiveOn,
        quantity: input.delta,
        invoiceObligation: due.invoiceObligation,
        invoiceDueOn: due.invoiceDueOn,
        recordedByEmployeeId: input.actor.employeeId,
      });
    }

    const row = buildSeatChangeForDoor({
      organizationId: line.organizationId,
      subscriptionLineId: line.id,
      effectiveOn: input.effectiveOn,
      recordedByEmployeeId: input.actor.employeeId,
      source: 'VENDOR_RECORD',
      delta: input.delta,
      note: input.note,
      requestId: input.requestId ?? null,
      beneficiaryEmployeeId: input.beneficiaryEmployeeId ?? null,
      seatPurchaseId: purchase?.id ?? null,
      refundedSeatChangeId: input.refundedSeatChangeId ?? null,
      outOfProcess: input.outOfProcess ?? false,
    });
    const change = await this.insertLedgerRow(tx, row);

    return { purchase, change };
  }

  /** Opens the ledger of renewal lines for a next period (`ADJUSTMENT` / `RENEWAL`). */
  async openNextPeriod(tx: DbTx, input: OpenNextPeriodInput): Promise<SeatChangeRecord[]> {
    const ordered = [...input.lines].sort((a, b) => a.lineId.localeCompare(b.lineId));
    const created: SeatChangeRecord[] = [];
    for (const item of ordered) {
      const locked = await this.requireLockedLine(tx, item.lineId);
      await this.lines.openLedger(tx, locked.id, item.effectiveOn);
      if (item.quantity > 0) {
        const row = buildSeatChangeForDoor({
          organizationId: locked.organizationId,
          subscriptionLineId: locked.id,
          effectiveOn: item.effectiveOn,
          recordedByEmployeeId: item.recordedByEmployeeId ?? null,
          source: 'ADJUSTMENT',
          reason: 'RENEWAL',
          delta: item.quantity,
          renewalId: item.renewalId,
          autoRecorded: item.autoRecorded ?? false,
        });
        created.push(await this.insertLedgerRow(tx, row));
      }
    }

    return created;
  }

  /** Records a member-counted seat change (`MEMBER`, `+1` or `-1`) without closed-month restriction. */
  async recordMember(
    tx: DbTx,
    lineRef: LineTargetRef,
    delta: 1 | -1,
    effectiveOn: BusinessDate,
    options?: RecordMemberOptions,
  ): Promise<SeatChangeRecord> {
    const line = await this.resolveLockedLine(tx, lineRef, options?.alreadyLocked);
    const row = buildSeatChangeForDoor({
      organizationId: line.organizationId,
      subscriptionLineId: line.id,
      effectiveOn,
      recordedByEmployeeId: options?.recordedByEmployeeId ?? null,
      source: 'MEMBER',
      delta,
    });

    return this.insertLedgerRow(tx, row);
  }

  /** Computes seats per line for every day in `[from, until]` inclusive, reading the ledger once open. */
  async seatsOnDays(
    lineIds: readonly string[],
    from: BusinessDate,
    until: BusinessDate,
    tx?: DbTx,
  ): Promise<Map<string, ReadonlyMap<BusinessDate, number | null>>> {
    const result = new Map<string, ReadonlyMap<BusinessDate, number | null>>();
    if (lineIds.length === 0 || from > until) return result;
    const lines = await this.lines.findManyWithPeriod(lineIds, tx);
    const changes = await this.ledger.ofLinesUpTo(lineIds, until, tx);
    const byLine = new Map<string, SeatChangeRecord[]>();
    for (const change of changes) {
      const list = byLine.get(change.subscriptionLineId) ?? [];
      list.push(change);
      byLine.set(change.subscriptionLineId, list);
    }
    for (const line of lines) {
      result.set(line.id, computeSeatsOnDays(line, byLine.get(line.id) ?? [], from, until));
    }

    return result;
  }

  /** Seat total for one opened line on `day`. */
  seatsOn(lineId: string, day: BusinessDate, tx?: DbTx): Promise<number> {
    return this.ledger.seatsOn(lineId, day, tx);
  }

  /** Seat totals on `day` for each of `lineIds` that has ledger entries up to `day`. */
  seatsOnOfLines(lineIds: readonly string[], day: BusinessDate, tx?: DbTx): Promise<Map<string, number>> {
    return this.ledger.seatsOnOfLines(lineIds, day, tx);
  }

  private async resolveLockedLine(
    tx: DbTx,
    lineRef: LineTargetRef,
    alreadyLocked = false,
  ): Promise<SubscriptionLineRecord> {
    if (typeof lineRef !== 'string' && alreadyLocked) return lineRef;
    const id = typeof lineRef === 'string' ? lineRef : lineRef.id;

    return this.requireLockedLine(tx, id);
  }

  private async requireLockedLine(tx: DbTx, lineId: string): Promise<SubscriptionLineRecord> {
    const locked = await this.lines.lock(tx, lineId);
    if (!locked) throw new SubscriptionLineNotFoundError();

    return locked;
  }

  private async computePurchaseDue(tx: DbTx, lineId: string, purchasedOn: BusinessDate) {
    const facts = await this.lines.periodFactsOf(lineId, tx);
    const billingCycle: LedgerBillingCycle | null = facts?.billingCycle ?? null;
    const invoicedLater = facts?.invoicedLater ?? false;
    const workingDays = Number(
      (await this.parameters.getValue('SEAT_PURCHASE_INVOICE_DUE_WORKING_DAYS', tx)) ??
        SEAT_PURCHASE_INVOICE_DUE_WORKING_DAYS,
    );
    const lateInvoiceDays = Number(
      (await this.parameters.getValue('SEAT_PURCHASE_LATE_INVOICE_DAYS', tx)) ?? SEAT_PURCHASE_LATE_INVOICE_DAYS,
    );
    const nonWorkingDates = invoicedLater
      ? new Set<BusinessDate>()
      : await this.parameters.getNonWorkingDates(purchasedOn, addDays(purchasedOn, Math.max(workingDays * 3, 60) + 30));

    return seatPurchaseInvoiceDue({
      purchasedOn,
      billingCycle,
      invoicedLater,
      workingDays,
      lateInvoiceDays,
      nonWorkingDates,
    });
  }

  private async insertLedgerRow(tx: DbTx, input: NewSeatChange): Promise<SeatChangeRecord> {
    try {
      return await this.ledger.insert(tx, input);
    } catch (error) {
      if (isCheckViolation(error, 'seat_changes_below_occupancy')) throw new SeatLedgerBelowOccupancyError();
      throw error;
    }
  }

  private auditPurchase(
    tx: DbTx,
    actor: BuyForItemsOptions['actor'],
    organizationId: string,
    purchase: SeatPurchaseRecord,
  ): Promise<void> {
    return this.audit.record(
      tx,
      catalogAuditEvent(actor, organizationId, 'SEAT_PURCHASE.RECORDED', 'SeatPurchase', purchase.id, null, {
        subscriptionLineId: purchase.subscriptionLineId,
        code: purchase.code,
        kind: purchase.kind,
        quantity: purchase.quantity,
        purchasedOn: purchase.purchasedOn,
        invoiceObligation: purchase.invoiceObligation,
        invoiceDueOn: purchase.invoiceDueOn,
      }),
    );
  }
}
