import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { SeatLedgerService } from './ledger/seat-ledger.service';
import { SubscriptionLineRepo } from './subscription-line.repo';
import type { SubscriptionLineClosedReason, SubscriptionLineRecord } from './subscription-line.types';

export interface CreatePeriodLineInput {
  planId: string;
  monthlyUnitPriceMinor: bigint;
  minimumSeats: number | null;
  quantity: number;
}

/**
 * Coordinates creating, draft-activating, and price-syncing subscription lines when a subscription period is
 * declared, updated as a draft, or activated (`DRAFT -> ACTIVE`).
 */
@Injectable()
export class SubscriptionPeriodLinesService {
  constructor(
    private readonly lines: SubscriptionLineRepo,
    private readonly seatLedger: SeatLedgerService,
    private readonly organizationReads: OrganizationReadApi,
  ) {}

  async requireOrganizationId(): Promise<string> {
    const organization = await this.organizationReads.getOrganization();
    if (!organization) throw new Error('Subscriptions were used before installation');

    return organization.id;
  }

  hasLiveLine(workspaceId: string, planId: string, tx?: DbTx): Promise<SubscriptionLineRecord | null> {
    return this.lines.findLive(workspaceId, planId, tx);
  }

  seatsOnDays(
    lineIds: readonly string[],
    from: BusinessDate,
    to: BusinessDate,
    tx?: DbTx,
  ): Promise<ReadonlyMap<string, ReadonlyMap<BusinessDate, number | null>>> {
    return this.seatLedger.seatsOnDays(lineIds, from, to, tx);
  }

  async hasLines(subscriptionId: string, tx?: DbTx): Promise<boolean> {
    const map = await this.lines.ofSubscriptions([subscriptionId], tx);

    return (map.get(subscriptionId)?.length ?? 0) > 0;
  }

  async linesOf(subscriptionId: string, tx?: DbTx): Promise<SubscriptionLineRecord[]> {
    return (await this.lines.ofSubscriptions([subscriptionId], tx)).get(subscriptionId) ?? [];
  }

  linesOfMany(subscriptionIds: readonly string[], tx?: DbTx): Promise<Map<string, SubscriptionLineRecord[]>> {
    return this.lines.ofSubscriptions(subscriptionIds, tx);
  }

  /** Locks lines of `subscriptionId` in id order and closes still-live ones with `reason` on `closedOn`. */
  async closeLines(
    tx: DbTx,
    subscriptionId: string,
    closedOn: BusinessDate,
    reason: SubscriptionLineClosedReason,
  ): Promise<SubscriptionLineRecord[]> {
    const existing = await this.linesOf(subscriptionId, tx);
    if (existing.length === 0) return [];
    const locked = await this.lines.lockMany(
      tx,
      existing.map((line) => line.id),
    );
    for (const line of locked) {
      if (line.closedReason === null) await this.lines.close(tx, line.id, closedOn, reason);
    }

    return locked;
  }

  /** Creates continuation lines (`quantity > 0`) for a renewed period and opens their ledger with `RENEWAL` entries. */
  async createRenewedLines(
    tx: DbTx,
    input: {
      organizationId: string;
      nextSubscriptionId: string;
      workspaceId: string | null;
      startDate: BusinessDate;
      renewalId: string | null;
      autoRecorded: boolean;
      recordedByEmployeeId: string | null;
      resolved: readonly { oldLine: SubscriptionLineRecord; quantity: number; monthlyUnitPriceMinor: bigint }[];
    },
  ): Promise<void> {
    if (!input.workspaceId || input.resolved.length === 0) return;
    const kept = input.resolved.filter((entry) => entry.quantity > 0);
    const created: { lineId: string; quantity: number }[] = [];
    for (const entry of kept) {
      const line = await this.lines.insert(tx, {
        organizationId: input.organizationId,
        subscriptionId: input.nextSubscriptionId,
        workspaceId: input.workspaceId,
        planId: entry.oldLine.planId,
        monthlyUnitPriceMinor: entry.monthlyUnitPriceMinor,
        minimumSeats: entry.oldLine.minimumSeats,
        renewedFromLineId: entry.oldLine.id,
      });
      created.push({ lineId: line.id, quantity: entry.quantity });
    }
    if (created.length === 0) return;

    await this.seatLedger.openNextPeriod(tx, {
      lines: created.map((item) => ({
        lineId: item.lineId,
        quantity: item.quantity,
        effectiveOn: input.startDate,
        renewalId: input.renewalId,
        autoRecorded: input.autoRecorded,
        recordedByEmployeeId: input.autoRecorded ? null : input.recordedByEmployeeId,
      })),
    });
  }

  async createForPeriod(
    tx: DbTx,
    input: {
      organizationId: string;
      subscriptionId: string;
      workspaceId: string;
      startDate: BusinessDate | null;
      status: 'DRAFT' | 'ACTIVE';
      recordedByEmployeeId: string;
      lines: readonly CreatePeriodLineInput[];
    },
  ): Promise<SubscriptionLineRecord[]> {
    const created: Array<{ record: SubscriptionLineRecord; quantity: number }> = [];
    for (const item of input.lines) {
      const record = await this.lines.insert(tx, {
        organizationId: input.organizationId,
        subscriptionId: input.subscriptionId,
        workspaceId: input.workspaceId,
        planId: item.planId,
        monthlyUnitPriceMinor: item.monthlyUnitPriceMinor,
        minimumSeats: item.minimumSeats,
      });
      created.push({ record, quantity: item.quantity });
    }

    if (input.status === 'ACTIVE' && input.startDate !== null) {
      await this.seatLedger.openLines(tx, {
        lines: created.map(({ record, quantity }) => ({
          lineId: record.id,
          effectiveOn: input.startDate!,
          quantity,
          recordedByEmployeeId: input.recordedByEmployeeId,
        })),
      });
    }

    return created.map((entry) => entry.record);
  }

  async syncDraftUpdate(
    tx: DbTx,
    input: {
      subscriptionId: string;
      planId: string;
      monthlyUnitPriceMinor: bigint | null;
      minimumSeats?: number | null;
    },
  ): Promise<void> {
    const existing = (await this.lines.ofSubscriptions([input.subscriptionId], tx)).get(input.subscriptionId) ?? [];
    if (existing.length !== 1 || existing[0].planId !== input.planId) return;
    if (input.monthlyUnitPriceMinor === null && input.minimumSeats === undefined) return;

    await this.lines.update(tx, existing[0].id, {
      ...(input.monthlyUnitPriceMinor !== null ? { monthlyUnitPriceMinor: input.monthlyUnitPriceMinor } : {}),
      ...(input.minimumSeats !== undefined ? { minimumSeats: input.minimumSeats } : {}),
    });
  }

  async activatePeriod(
    tx: DbTx,
    period: {
      id: string;
      planId: string;
      planProvisioningType: string;
      kind: 'TERM' | 'PERPETUAL';
      workspace: { id: string; name: string } | null;
      startDate: BusinessDate | null;
      purchasedQuantity: number | null;
      monthlyUnitPriceMinor: bigint | null;
      vendorMinimumSeats: number | null;
    },
    actorEmployeeId: string,
  ): Promise<void> {
    const workspaceId = period.workspace?.id ?? null;
    if (period.planProvisioningType !== 'K2' || period.kind !== 'TERM' || workspaceId === null) return;

    const current = await this.ensureAndSyncActivationLines(tx, period, workspaceId);
    const unOpened = current.filter((line) => line.ledgerOpenedOn === null);
    if (unOpened.length === 0 || period.startDate === null) return;

    const initialQuantity = period.purchasedQuantity ?? 0;
    await this.seatLedger.openLines(tx, {
      lines: unOpened.map((line, idx) => ({
        lineId: line.id,
        effectiveOn: period.startDate!,
        quantity: unOpened.length === 1 || idx === 0 ? initialQuantity : 0,
        recordedByEmployeeId: actorEmployeeId,
      })),
    });
  }

  private async ensureAndSyncActivationLines(
    tx: DbTx,
    period: {
      id: string;
      planId: string;
      monthlyUnitPriceMinor: bigint | null;
      vendorMinimumSeats: number | null;
    },
    workspaceId: string,
  ): Promise<SubscriptionLineRecord[]> {
    const map = await this.lines.ofSubscriptions([period.id], tx);
    const current = map.get(period.id) ?? [];
    if (current.length === 0) {
      const organizationId = await this.requireOrganizationId();
      const inserted = await this.lines.insert(tx, {
        organizationId,
        subscriptionId: period.id,
        workspaceId,
        planId: period.planId,
        monthlyUnitPriceMinor: period.monthlyUnitPriceMinor ?? 0n,
        minimumSeats: period.vendorMinimumSeats ?? null,
      });

      return [inserted];
    }
    if (period.monthlyUnitPriceMinor === null) return current;

    const updatedLines: SubscriptionLineRecord[] = [];
    for (const line of current) {
      const needsPrice = current.length === 1 || line.monthlyUnitPriceMinor === 0n;
      updatedLines.push(
        needsPrice
          ? await this.lines.update(tx, line.id, { monthlyUnitPriceMinor: period.monthlyUnitPriceMinor })
          : line,
      );
    }

    return updatedLines;
  }
}
