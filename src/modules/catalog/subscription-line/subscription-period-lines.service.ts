import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { SeatLedgerService } from './ledger/seat-ledger.service';
import { SubscriptionLineRepo } from './subscription-line.repo';
import type { SubscriptionLineRecord } from './subscription-line.types';

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
