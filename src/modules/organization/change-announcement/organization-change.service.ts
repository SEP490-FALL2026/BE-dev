import { Injectable, Logger } from '@nestjs/common';
import { BusinessDate } from '../../../core/business-date';
import { DbTx, TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import { describeForOperator, traceForOperator } from '../../../infrastructure/observability/operator-error';
import { OrganizationChangeListeners } from '../public/organization.extension-points';
import type { NewOrganizationChange, OrganizationChange } from '../public/organization.types';
import { AnnouncementRepo } from './announcement.repo';

/** How many changes of each kind one pass tells at most: the rest wait for the next pass. */
const SWEEP_BATCH = 200;

export interface AnnounceDueResult {
  told: number;
  failed: number;
}

/**
 * Tells the modules that act on the organization of every change that has taken effect, exactly once (`FR-3.16`, `US-03-01`
 * AC-7). A change written for today is told in the transaction that writes it (`emit`); one dated for a day to come is told
 * by the sweep when its day has come (`announceDue`), one transaction for each change. The row of the announcement is the
 * identity of the change and what makes a second telling a no-op.
 */
@Injectable()
export class OrganizationChangeService {
  private readonly logger = new Logger(OrganizationChangeService.name);

  constructor(
    private readonly listeners: OrganizationChangeListeners,
    private readonly announcements: AnnouncementRepo,
    private readonly runner: TransactionRunner,
  ) {}

  /** For `ops:inspect`: the changes that had taken effect at `asOf` in their organization's calendar and were never marked as told. */
  countUnmarkedAsOf(
    tx: DbTx,
    asOf: Date,
  ): Promise<Record<'PLACEMENT_START' | 'HEAD_PERIOD_START' | 'HEAD_PERIOD_END', number>> {
    return this.announcements.countUnmarkedAsOf(tx, asOf);
  }

  /**
   * Tells the listeners in the caller's transaction, in the order they were added, unless the change was told already; one that
   * throws rolls it back. `id` is the identity of the change the listeners see: the announcement row gives it, so it is the same
   * on every path.
   */
  async emit(tx: DbTx, change: NewOrganizationChange): Promise<void> {
    const id = await this.announcements.record(tx, change);
    if (id === null) return;
    const announced: OrganizationChange = { ...change, id };
    await this.listeners.emit(tx, announced);
  }

  /**
   * One pass of the sweep for `today`: the placements and head periods that took effect and were not told. A listener that
   * throws rolls back that change alone, which is tried again by the next pass; the failure is logged, never raised.
   */
  async announceDue(today: BusinessDate): Promise<AnnounceDueResult> {
    const result: AnnounceDueResult = { told: 0, failed: 0 };
    const tell = async (
      kind: string,
      id: string,
      read: (tx: DbTx) => Promise<NewOrganizationChange | null>,
    ): Promise<void> => {
      try {
        const told = await this.runner.run(async (tx) => {
          const change = await read(tx);
          if (!change) return false;
          await this.emit(tx, change);

          return true;
        });
        if (told) result.told += 1;
      } catch (error) {
        result.failed += 1;
        this.logger.error(
          `A change of the organization could not be told (${kind} ${id}): ${describeForOperator(error)}`,
          traceForOperator(error),
        );
      }
    };

    for (const id of await this.announcements.duePlacementIds(today, SWEEP_BATCH)) {
      await tell('placement', id, (tx) => this.announcements.lockDuePlacement(tx, id, today));
    }
    const heads = await this.announcements.dueHeadPeriodIds(today, SWEEP_BATCH);
    for (const id of heads.ends) {
      await tell('head period end', id, (tx) => this.announcements.lockDueHeadEnd(tx, id, today));
    }
    for (const id of heads.starts) {
      await tell('head period start', id, (tx) => this.announcements.lockDueHeadStart(tx, id, today));
    }

    return result;
  }
}
