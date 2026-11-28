import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { SeatLedgerService } from './ledger/seat-ledger.service';
import { SubscriptionLinePeriodStillDraftError } from './subscription-line.errors';
import { compareLineOrder } from './subscription-line.policy';
import { SubscriptionLineRepo } from './subscription-line.repo';
import type { SubscriptionLineClosedReason, SubscriptionLineRecord } from './subscription-line.types';

export interface CreatePeriodLineInput {
  planId: string;
  monthlyUnitPriceMinor: bigint;
  minimumSeats: number | null;
  quantity: number | null;
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

  async hasPricedLines(subscriptionId: string, tx?: DbTx): Promise<boolean> {
    const list = await this.linesOf(subscriptionId, tx);

    return list.length > 0 && list.every((line) => line.monthlyUnitPriceMinor > 0n);
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
      if (line.closedReason === null) {
        const effectiveClosedOn =
          line.ledgerOpenedOn !== null && closedOn < line.ledgerOpenedOn ? line.ledgerOpenedOn : closedOn;
        await this.lines.close(tx, line.id, effectiveClosedOn, reason);
      }
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
    // The lines are made in the order of the lines they renew (`created_at`, `id`), whatever the order the renewal named them in: the first
    // line of the next renewal is the first of this order.
    const kept = input.resolved
      .filter((entry) => entry.quantity > 0)
      .sort((a, b) => compareLineOrder(a.oldLine, b.oldLine));
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
    const created: Array<{ record: SubscriptionLineRecord; quantity: number | null }> = [];
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

    const toOpen = created.filter(
      (entry): entry is { record: SubscriptionLineRecord; quantity: number } => entry.quantity !== null,
    );
    if (input.status === 'ACTIVE' && input.startDate !== null && toOpen.length > 0) {
      await this.seatLedger.openLines(tx, {
        lines: toOpen.map(({ record, quantity }) => ({
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
      organizationId?: string;
      workspaceId?: string | null;
      subscriptionId: string;
      planId: string;
      monthlyUnitPriceMinor: bigint | null;
      minimumSeats?: number | null;
    },
  ): Promise<void> {
    const existing = await this.linesOf(input.subscriptionId, tx);
    const priced = input.monthlyUnitPriceMinor !== null && input.monthlyUnitPriceMinor > 0n;
    if (existing.length === 0) {
      if (!priced || !input.workspaceId) return;
      const organizationId = input.organizationId ?? (await this.requireOrganizationId());
      await this.lines.insert(tx, {
        organizationId,
        subscriptionId: input.subscriptionId,
        workspaceId: input.workspaceId,
        planId: input.planId,
        monthlyUnitPriceMinor: input.monthlyUnitPriceMinor!,
        minimumSeats: input.minimumSeats ?? null,
      });

      return;
    }
    if (existing.length !== 1 || existing[0].planId !== input.planId) return;
    const patch = {
      ...(priced ? { monthlyUnitPriceMinor: input.monthlyUnitPriceMinor! } : {}),
      ...(input.minimumSeats !== undefined ? { minimumSeats: input.minimumSeats } : {}),
    };
    if (Object.keys(patch).length > 0) await this.lines.update(tx, existing[0].id, patch);
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
    if (unOpened.length > 1) {
      throw new SubscriptionLinePeriodStillDraftError(['MULTIPLE_UNOPENED_LINES']);
    }
    if (period.purchasedQuantity === null) return;

    const initialQuantity = period.purchasedQuantity;
    await this.seatLedger.openLines(tx, {
      lines: [
        {
          lineId: unOpened[0].id,
          effectiveOn: period.startDate,
          quantity: initialQuantity,
          recordedByEmployeeId: actorEmployeeId,
        },
      ],
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
      if (period.monthlyUnitPriceMinor === null || period.monthlyUnitPriceMinor <= 0n) return [];
      const organizationId = await this.requireOrganizationId();
      const inserted = await this.lines.insert(tx, {
        organizationId,
        subscriptionId: period.id,
        workspaceId,
        planId: period.planId,
        monthlyUnitPriceMinor: period.monthlyUnitPriceMinor,
        minimumSeats: period.vendorMinimumSeats ?? null,
      });

      return [inserted];
    }
    if (period.monthlyUnitPriceMinor === null || period.monthlyUnitPriceMinor <= 0n) return current;

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
