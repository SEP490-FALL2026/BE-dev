import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { PlanFactsService, type LockedPlan } from '../plan/plan-facts.service';
import type { LicenseLotView } from '../public/license-lot.types';
import { LicenseLotRepo } from './license-lot.repo';
import type { LicenseLotRecord } from './license-lot.types';

/** A lot with the plan and application it belongs to, as the rest of the application reads it. */
export const viewOfLot = (lot: LicenseLotRecord, plan: LockedPlan): LicenseLotView => ({
  id: lot.id,
  organizationId: lot.organizationId,
  purchasedOn: lot.purchasedOn,
  licenseCount: lot.licenseCount,
  unitPriceMinor: lot.unitPriceMinor,
  purpose: lot.purpose,
  requestId: lot.requestId,
  invoiceActualMinor: lot.invoiceActualMinor,
  workspaceId: lot.workspaceId,
  contractId: lot.contractId,
  responsibleItAdminEmployeeId: lot.responsibleItAdminEmployeeId,
  legacySubscriptionId: lot.legacySubscriptionId,
  planId: plan.id,
  planName: plan.name,
  applicationId: plan.applicationId,
  applicationName: plan.applicationName,
  applicationKind: plan.applicationKind,
  keyBinding: plan.keyBinding,
  applicationStatus: plan.applicationStatus,
  updatedAt: lot.updatedAt,
});

/**
 * What the grants and the activations take of a lot: the lot `FOR UPDATE` (tier 6a), then the plan `FOR SHARE` (tier 7, as `lockSeatTarget` does
 * for a subscription: a change of the plan waits for the writer of its lot), until the caller's transaction ends. `find` reads without a lock.
 * The keys (tier 7b) and the activations (tier 8) come after, so a lot is always locked before what rests on it.
 */
@Injectable()
export class LicenseLotLockService {
  constructor(
    private readonly lots: LicenseLotRepo,
    private readonly plans: PlanFactsService,
  ) {}

  /** The lot locked with its plan; null when the lot or its plan does not exist. */
  async lock(tx: DbTx, lotId: string): Promise<LicenseLotView | null> {
    const lot = await this.lots.lock(tx, lotId);
    if (!lot) return null;
    const plan = await this.plans.lockShared(tx, lot.planId);

    return plan ? viewOfLot(lot, plan) : null;
  }

  /** Which of these ids are lots (a lot born from a perpetual purchase has the id of that subscription), in one read. */
  async idsOfLots(ids: readonly string[], tx?: DbTx): Promise<ReadonlySet<string>> {
    return new Set((await this.lots.findMany(ids, tx)).keys());
  }

  /** The lot with its plan, without a lock; null when it does not exist. */
  async find(lotId: string, tx?: DbTx): Promise<LicenseLotView | null> {
    const lot = await this.lots.find(lotId, tx);
    if (!lot) return null;
    const [plan] = await this.plans.lookups([lot.planId], tx);

    return plan ? viewOfLot(lot, plan) : null;
  }

  /** The lot bought for a request (purpose = REQUEST), without a lock; null when none exists. */
  async findOfRequest(requestId: string, tx?: DbTx): Promise<LicenseLotView | null> {
    const lot = await this.lots.findOfRequest(requestId, tx);
    if (!lot) return null;
    const [plan] = await this.plans.lookups([lot.planId], tx);

    return plan ? viewOfLot(lot, plan) : null;
  }

  /** Multiple lots with their plans in two reads; missing lots are absent. */
  async findMany(lotIds: readonly string[], tx?: DbTx): Promise<Map<string, LicenseLotView>> {
    const byId = await this.lots.findMany(lotIds, tx);
    if (byId.size === 0) return new Map();
    const planIds = [...new Set([...byId.values()].map((lot) => lot.planId))];
    const plans = new Map((await this.plans.lookups(planIds, tx)).map((plan) => [plan.id, plan]));
    const views = new Map<string, LicenseLotView>();
    for (const lot of byId.values()) {
      const plan = plans.get(lot.planId);
      if (plan) views.set(lot.id, viewOfLot(lot, plan));
    }

    return views;
  }

  /** Records Finance's confirmed invoice total on a lot; throws LicenseLotAlreadyInvoicedError on overwrite. */
  async setInvoiceActual(tx: DbTx, lotId: string, actualMinor: bigint): Promise<void> {
    await this.lots.setInvoiceActual(tx, lotId, actualMinor);
  }
}
