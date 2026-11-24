import { Injectable } from '@nestjs/common';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { catalogAuditEvent } from '../catalog-audit-event.mapper';
import { PlanFactsService } from '../plan/plan-facts.service';
import {
  SubscriptionNotFoundError,
  SubscriptionPlanNotFoundError,
  SubscriptionStaleError,
  SubscriptionStillDraftError,
  SubscriptionUpdateEmptyError,
} from './subscription.errors';
import { sameState, snapshotOf, stateOf } from './subscription.mapper';
import {
  assertSubscriptionShape,
  assertVersionForQuantityChange,
  deriveNotice,
  isStaleEdit,
  judgeQuantityChange,
  missingDataOf,
  nextStateOf,
  noticeInputOf,
  resolveSubscriptionPrices,
  sameUnitPrice,
  subscriptionStatusOf,
} from './subscription.policy';
import { assertDeclarableCycle } from './pool/subscription-pool.policy';
import { SubscriptionRepo } from './subscription.repo';
import { SubscriptionChangeGuard } from './subscription-change-guard.service';
import { SubscriptionPricingService } from './subscription-pricing.service';
import { SubscriptionViewService } from './subscription-view.service';
import type {
  OriginalPriceRecord,
  SubscriptionRecord,
  SubscriptionState,
  SubscriptionView,
} from './subscription.types';
import type { UpdateSubscriptionInput } from './subscription.service';

/**
 * A change of a subscription (`US-04-03`): a new unit price is entered in dong and recorded with today as its day and the snapshot of the
 * same currency (`QĐ-111an`); the original price a vendor quoted is only kept; the other fields are stored as they are; the owner department is not a field of a change. A write is one transaction under the locks of
 * the subscription and its plan (see the standard lock order in `docs/rules/database-business.md`: subscription before plan).
 */
@Injectable()
export class SubscriptionChangeService {
  constructor(
    private readonly subscriptions: SubscriptionRepo,
    private readonly plans: PlanFactsService,
    private readonly pricing: SubscriptionPricingService,
    private readonly views: SubscriptionViewService,
    private readonly audit: AuditApi,
    private readonly runner: TransactionRunner,
    private readonly guard: SubscriptionChangeGuard,
  ) {}

  /**
   * Changes a subscription: a new unit price is entered in dong and recorded with today as its day; the original price a vendor
   * quoted is kept as given (`null` takes it away); the other fields are stored as they are; the owner department is not a field
   * of a change. Throws SubscriptionNotFoundError, SubscriptionUpdateEmptyError, SubscriptionStaleError (`expectedUpdatedAt` is not the row's), the shape errors, SubscriptionPriceNotVndError
   * (a unit price that is not in dong), and the money errors. A subscription has no owning department, so a change asks no Cost Center (`QĐ-113g`).
   */
  async update(
    actor: AuthenticatedPrincipal,
    id: string,
    input: UpdateSubscriptionInput,
    expectedUpdatedAt?: Date,
  ): Promise<SubscriptionView> {
    if (Object.entries(input).every(([key, value]) => key === 'quantityChangeReason' || value === undefined)) {
      throw new SubscriptionUpdateEmptyError();
    }
    assertVersionForQuantityChange(input.purchasedQuantity, expectedUpdatedAt);
    assertDeclarableCycle(input.billingCycle);
    const sentUnit = input.unitPrice ? await this.pricing.read(input.unitPrice, 'unitPrice') : undefined;
    const sentMonthly = input.monthlyUnitPrice
      ? await this.pricing.read(input.monthlyUnitPrice, 'monthlyUnitPrice')
      : undefined;
    const originalPrice = input.originalPrice
      ? await this.pricing.readOriginal(input.originalPrice)
      : input.originalPrice;
    const organizationId = await this.guard.requireOrganizationId();

    const record = await this.runner.run((tx) =>
      this.changeIn(tx, actor, id, { input, sentUnit, sentMonthly, originalPrice, organizationId, expectedUpdatedAt }),
    );

    return (await this.views.viewAll([record]))[0];
  }

  private async changeIn(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    id: string,
    change: {
      input: UpdateSubscriptionInput;
      sentUnit: { amountMinor: bigint; currency: string } | undefined;
      sentMonthly: { amountMinor: bigint; currency: string } | undefined;
      /** What the change gives: the price read, `null` to take it away, `undefined` when it says nothing. */
      originalPrice: OriginalPriceRecord | null | undefined;
      organizationId: string;
      expectedUpdatedAt?: Date;
    },
  ): Promise<SubscriptionRecord> {
    const { input, sentUnit, sentMonthly, originalPrice, organizationId, expectedUpdatedAt } = change;
    const current = input.isPrimaryForPlan
      ? await this.lockForPrimaryChange(tx, id, expectedUpdatedAt)
      : await this.lockFresh(tx, id, expectedUpdatedAt);
    // The plan is locked for writing when this subscription is to price it: the subscriptions of one plan take turns.
    const plan = input.isPrimaryForPlan
      ? await this.plans.lockExclusive(tx, current.planId)
      : await this.plans.lockShared(tx, current.planId);
    if (!plan) throw new SubscriptionPlanNotFoundError();
    const quantityChangeReason = this.quantityReasonOf(current, input);
    await this.guard.assertNotBelowOccupied(tx, id, current.purchasedQuantity, input.purchasedQuantity);

    const next = nextStateOf(current, input);
    assertSubscriptionShape({
      kind: current.kind,
      applicationKind: plan.applicationKind,
      planProvisioningType: plan.provisioningType,
      ...next,
    });

    const resolvedPrice = resolveSubscriptionPrices({
      kind: current.kind,
      billingCycle: next.billingCycle,
      cycleChanged: input.billingCycle !== undefined && input.billingCycle !== current.billingCycle,
      sentMonthly,
      sentUnit,
      currentMonthlyMinor: current.monthlyUnitPriceMinor,
      currentUnitMoney: current.unitPrice
        ? { amountMinor: current.unitPrice.amountMinor, currency: current.unitPrice.currency }
        : null,
    });
    const samePrice = sameUnitPrice(current.unitPrice, resolvedPrice.unitMoney);
    const priced = samePrice
      ? { unitPrice: current.unitPrice, priceSnapshot: current.priceSnapshot }
      : await this.pricing.priceToday(tx, resolvedPrice.unitMoney);
    const state: SubscriptionState = {
      ...next,
      ...priced,
      monthlyUnitPriceMinor: resolvedPrice.monthlyUnitPriceMinor,
      originalPrice: originalPrice === undefined ? current.originalPrice : originalPrice,
      status: this.statusAfter(plan, current, { ...next, ...priced }),
    };
    await this.guard.judgePool(tx, { plan, current, state, input, actor, organizationId });
    if (sameState(state, stateOf(current))) return current;

    const updated = await this.subscriptions.update(tx, id, state);
    await this.auditChange(tx, actor, { current, updated, organizationId, quantityChangeReason });
    await this.notifySeatChange(tx, actor, current, updated, organizationId);

    return updated;
  }

  private async notifySeatChange(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    current: SubscriptionRecord,
    updated: SubscriptionRecord,
    organizationId: string,
  ): Promise<void> {
    if (
      current.purchasedQuantity !== null &&
      updated.purchasedQuantity !== null &&
      updated.purchasedQuantity < current.purchasedQuantity
    ) {
      await this.guard.tellSeatReduction(tx, {
        organizationId,
        subscriptionId: current.id,
        planProvisioningType: current.planProvisioningType,
        status: current.status,
        responsibleItAdminEmployeeId: updated.responsibleItAdminEmployeeId,
        from: current.purchasedQuantity,
        to: updated.purchasedQuantity,
        updatedAt: updated.updatedAt,
        actor,
      });

      return;
    }
    // A rise of the seats of a K2 or K4 pool is told to the IT Admin who answers for it, whoever changed the number (`QĐ-110v`, SPEC P24).
    await this.guard.tellSeatIncrease(tx, {
      organizationId,
      subscriptionId: current.id,
      planProvisioningType: current.planProvisioningType,
      status: current.status,
      responsibleItAdminEmployeeId: updated.responsibleItAdminEmployeeId,
      from: current.purchasedQuantity,
      to: updated.purchasedQuantity,
      requestId: null,
      actor,
    });
  }

  private quantityReasonOf(current: SubscriptionRecord, input: UpdateSubscriptionInput): string | undefined {
    return judgeQuantityChange({
      status: current.status,
      planProvisioningType: current.planProvisioningType,
      currentQuantity: current.purchasedQuantity,
      requestedQuantity: input.purchasedQuantity,
      commitmentTermMonths: current.commitmentTermMonths,
      allowsMidTermReduction: current.allowsMidTermReduction,
      quantityChangeReason: input.quantityChangeReason,
    });
  }

  /** The subscription, locked, when it is still the one the client read (`expectedUpdatedAt`); else SubscriptionNotFoundError or SubscriptionStaleError. */
  private async lockFresh(tx: DbTx, id: string, expectedUpdatedAt?: Date): Promise<SubscriptionRecord> {
    const current = await this.subscriptions.lock(tx, id);
    if (!current) throw new SubscriptionNotFoundError();
    if (isStaleEdit(expectedUpdatedAt, current.updatedAt)) throw new SubscriptionStaleError(current.updatedAt);

    return current;
  }

  /**
   * Locks every current primary subscription of the plan together with `id` in id order before locking the plan exclusively,
   * then re-reads and checks optimistic concurrency.
   *
   * A known narrow window: when the plan has no primary at the moment of this read, the set locked is only `id`; a renewal completed by another transaction can
   * make another subscription the primary of the plan and commit before this one locks the plan, and the flag taken off it afterwards is written on a row this
   * transaction did not lock. It needs a second transaction that gives a seat on that very subscription at that very moment, the write is one flag of a row
   * whose owner is waiting for the plan, and closing it needs the set of primaries read again after the plan is locked (a change of behaviour, so left to its own item).
   */
  private async lockForPrimaryChange(tx: DbTx, id: string, expectedUpdatedAt?: Date): Promise<SubscriptionRecord> {
    const probe = await this.subscriptions.find(id, tx);
    if (!probe) throw new SubscriptionNotFoundError();
    await this.subscriptions.lockPrimaryCandidates(tx, probe.planId, [id]);
    const current = await this.subscriptions.find(id, tx);
    if (!current) throw new SubscriptionNotFoundError();
    if (isStaleEdit(expectedUpdatedAt, current.updatedAt)) throw new SubscriptionStaleError(current.updatedAt);

    return current;
  }

  /**
   * The status a change leaves: a change never lowers an active subscription to a draft on its own account. One an earlier release left priced
   * in another currency (no rate was there to turn it into dong) has no price of the new flow, and the change says so (SubscriptionStillDraftError,
   * 422, naming what is missing) instead of taking the subscription out of the pool in silence; entering the price in dong keeps it active.
   */
  private statusAfter(
    plan: Parameters<typeof subscriptionStatusOf>[0],
    current: SubscriptionRecord,
    state: Parameters<typeof subscriptionStatusOf>[2],
  ): 'ACTIVE' | 'DRAFT' {
    const status = subscriptionStatusOf(plan, current.kind, state);
    if (current.status === 'ACTIVE' && status === 'DRAFT') {
      throw new SubscriptionStillDraftError(missingDataOf(plan, current.kind, state));
    }

    return status;
  }

  private async auditChange(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    changed: {
      current: SubscriptionRecord;
      updated: SubscriptionRecord;
      organizationId: string;
      quantityChangeReason?: string;
    },
  ): Promise<void> {
    const { current, updated, organizationId, quantityChangeReason } = changed;
    const after = quantityChangeReason ? { ...snapshotOf(updated), quantityChangeReason } : snapshotOf(updated);
    await this.audit.record(
      tx,
      catalogAuditEvent(
        actor,
        organizationId,
        'SUBSCRIPTION.UPDATED',
        'Subscription',
        current.id,
        snapshotOf(current),
        after,
      ),
    );
    const before = deriveNotice(noticeInputOf(current));
    if (before.source === 'INFERRED_UNCONFIRMED' && deriveNotice(noticeInputOf(updated)).source === 'DECLARED') {
      await this.audit.record(
        tx,
        catalogAuditEvent(
          actor,
          organizationId,
          'SUBSCRIPTION.NOTICE_DEADLINE_CONFIRMED',
          'Subscription',
          current.id,
          { noticeDeadline: before.deadline },
          { noticeDeadline: updated.noticeDeadline },
        ),
      );
    }
  }
}
