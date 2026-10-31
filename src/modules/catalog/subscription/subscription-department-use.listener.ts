import { Injectable, OnModuleInit } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import {
  DepartmentUseContributions,
  type DepartmentUseReader,
} from '../../organization/public/organization.extension-points';
import type { UseGroup } from '../../organization/public/organization-use.types';
import { SeatOccupancyHook } from '../public/catalog.extension-points';
import { SubscriptionRepo } from './subscription.repo';

/**
 * What keeps a department in use that this module holds (`QĐ-90e`): the subscriptions and purchases it owns that still owe a
 * future payment on a day. A term subscription that is not over (no end date, an end date that has not passed, or one that renews
 * itself) and a perpetual purchase only while a seat of it is held; a perpetual purchase with no seat left does not block. It hands
 * itself to the organization when the module starts, so the organization never imports the catalog. A fixed number of statements
 * however many subscriptions the department owns: the ids of the terms, the ids of the perpetual purchases, which of those hold a
 * seat (asked of licensing through the bound reader of seats) and the labels of the page.
 */
@Injectable()
export class SubscriptionDepartmentUseReader implements DepartmentUseReader, OnModuleInit {
  /** The extension points this class registers with (gate extension-wiring, R1). */
  static readonly binds = [DepartmentUseContributions] as const;

  readonly group = 'SUBSCRIPTIONS' as const;

  constructor(
    private readonly subscriptions: SubscriptionRepo,
    private readonly occupancy: SeatOccupancyHook,
    private readonly departmentUse: DepartmentUseContributions,
  ) {}

  onModuleInit(): void {
    this.departmentUse.add('catalog.subscriptions', this);
  }

  async read(departmentId: string, day: BusinessDate, limit: number, tx?: DbTx): Promise<UseGroup> {
    const terms = await this.subscriptions.termIdsNotOverOf(departmentId, day, tx);
    const perpetual = await this.subscriptions.perpetualIdsOf(departmentId, tx);
    const held =
      perpetual.length === 0
        ? new Set<string>()
        : await this.occupancy.get().subscriptionsWithOpenSeats(perpetual, day, tx);
    const ids = [...terms, ...perpetual.filter((id) => held.has(id))].sort();
    const page = ids.slice(0, Math.max(0, limit));
    const labels = await this.subscriptions.labelsOf(page, tx);

    return {
      total: ids.length,
      items: page.map((id) => ({ kind: 'SUBSCRIPTION', id, label: labels.get(id) ?? null })),
    };
  }
}
