import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import { LicenseLotRepo } from '../../license-lot/license-lot.repo';
import { SubscriptionLineRepo } from '../../subscription-line/subscription-line.repo';

/**
 * What a subscription's answer takes from the lots and the lines (W3-24, W3-27): a perpetual purchase that became a lot has the id of that lot, and the lot is
 * where who answers for it is written (the subscription row is not written for it); a period that has lines is priced by them. Both are read for a whole page in
 * one read each.
 */
@Injectable()
export class SubscriptionLotResponsibleService {
  constructor(
    private readonly lots: LicenseLotRepo,
    private readonly lines: SubscriptionLineRepo,
  ) {}

  /** For each of these subscriptions that is a lot (the lot has its id), the IT Admin who answers for the lot; the others are absent. */
  async lotResponsibles(ids: readonly string[], tx?: DbTx): Promise<ReadonlyMap<string, string | null>> {
    const found = await this.lots.findMany(ids, tx);

    return new Map([...found].map(([id, lot]) => [id, lot.responsibleItAdminEmployeeId]));
  }

  /** Which of these periods have lines. */
  async withLines(ids: readonly string[], tx?: DbTx): Promise<ReadonlySet<string>> {
    return new Set((await this.lines.ofSubscriptions(ids, tx)).keys());
  }
}
