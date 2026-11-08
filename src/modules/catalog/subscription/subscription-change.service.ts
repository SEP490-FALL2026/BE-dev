import { Injectable } from '@nestjs/common';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { catalogAuditEvent } from '../catalog-audit-event.mapper';
import { PlanFactsService } from '../plan/plan-facts.service';
import {
  SubscriptionNotFoundError,
  SubscriptionPlanNotFoundError,
  SubscriptionStillDraftError,
  SubscriptionUpdateEmptyError,
} from './subscription.errors';
import { sameState, snapshotOf, stateOf } from './subscription.mapper';
import {
  assertSubscriptionShape,
  deriveNotice,
  nextStateOf,
  noticeInputOf,
  sameUnitPrice,
  subscriptionStatusOf,
} from './subscription.policy';
import { assertDeclarableCycle } from './pool/subscription-pool.policy';
import { SubscriptionRepo } from './subscription.repo';
import { SubscriptionChangeGuard } from './subscription-change-guard.service';
import { SubscriptionObligationService } from './subscription-obligation.service';
import { SubscriptionPricingService } from './subscription-pricing.service';
import { SubscriptionViewService } from './subscription-view.service';
import type { SubscriptionRecord, SubscriptionState, SubscriptionView } from './subscription.types';
import type { UpdateSubscriptionInput } from './subscription.service';

/**
 * A change of a subscription (`US-04-03`): a new unit price is converted again at the rate of today and recorded with today as its day; the
 * other fields are stored as they are; the owner department is not a field of a change. A write is one transaction under the locks of
 * the subscription and its plan.
 */
@Injectable()
export class SubscriptionChangeService {
  constructor(
    private readonly subscriptions: SubscriptionRepo,
    private readonly plans: PlanFactsService,
    private readonly pricing: SubscriptionPricingService,
    private readonly obligation: SubscriptionObligationService,
    private readonly views: SubscriptionViewService,
    private readonly audit: AuditApi,
    private readonly runner: TransactionRunner,
    private readonly guard: SubscriptionChangeGuard,
  ) {}

  /**
   * Changes a subscription: a new unit price is converted again at the rate of today and recorded with today as its day;
   * the other fields are stored as they are; the owner department is not a field of a change. Throws SubscriptionNotFoundError,
   * SubscriptionUpdateEmptyError, the shape errors, the money errors and FinanceSetupIncompleteError (a change that creates, raises
   * or extends what is owed while the owner department has no Cost Center in use). A price edit that would leave an active subscription with no rate for its day is refused
   * by the finance facade's missing rate, never silently turned back into a draft.
   */
  async update(actor: AuthenticatedPrincipal, id: string, input: UpdateSubscriptionInput): Promise<SubscriptionView> {
    if (Object.values(input).every((value) => value === undefined)) throw new SubscriptionUpdateEmptyError();
    assertDeclarableCycle(input.billingCycle);
    const money = input.unitPrice ? await this.pricing.read(input.unitPrice) : null;
    const organizationId = await this.guard.requireOrganizationId();
    await this.guard.requireResponsible(input.responsibleItAdminEmployeeId);

    const record = await this.runner.run((tx) => this.changeIn(tx, actor, id, { input, money, organizationId }));

    return (await this.views.viewAll([record]))[0];
  }

  private async changeIn(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    id: string,
    change: {
      input: UpdateSubscriptionInput;
      money: { amountMinor: bigint; currency: string } | null;
      organizationId: string;
    },
  ): Promise<SubscriptionRecord> {
    const { input, money, organizationId } = change;
    const current = await this.subscriptions.lock(tx, id);
    if (!current) throw new SubscriptionNotFoundError();
    // The plan is locked for writing when this subscription is to price it: the subscriptions of one plan take turns (Q-04).
    const plan = input.isPrimaryForPlan
      ? await this.plans.lockExclusive(tx, current.planId)
      : await this.plans.lockShared(tx, current.planId);
    if (!plan) throw new SubscriptionPlanNotFoundError();
    await this.guard.assertNotBelowOccupied(tx, id, current.purchasedQuantity, input.purchasedQuantity);

    const next = nextStateOf(current, input);
    assertSubscriptionShape({
      kind: current.kind,
      applicationKind: plan.applicationKind,
      planProvisioningType: plan.provisioningType,
      ...next,
    });

    const samePrice = sameUnitPrice(current.unitPrice, money);
    const priced = samePrice
      ? { unitPrice: current.unitPrice, priceSnapshot: current.priceSnapshot }
      : await this.pricing.priceToday(tx, money);
    if (!samePrice && current.status === 'ACTIVE' && priced.priceSnapshot === null) {
      throw new SubscriptionStillDraftError(['EXCHANGE_RATE']);
    }
    const state: SubscriptionState = {
      ...next,
      ...priced,
      status: subscriptionStatusOf(plan, current.kind, { ...next, ...priced }),
    };
    await this.guard.judgePool(tx, { plan, current, state, input, actor, organizationId });
    if (sameState(state, stateOf(current))) return current;
    // What is owed cannot be created, raised or extended for a department with no Cost Center in use.
    await this.obligation.assertChargeable(tx, current.ownerDepartmentId, stateOf(current), state);

    const updated = await this.subscriptions.update(tx, id, state);
    await this.auditChange(tx, actor, { current, updated, organizationId });

    return updated;
  }

  private async auditChange(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    changed: { current: SubscriptionRecord; updated: SubscriptionRecord; organizationId: string },
  ): Promise<void> {
    const { current, updated, organizationId } = changed;
    await this.audit.record(
      tx,
      catalogAuditEvent(
        actor,
        organizationId,
        'SUBSCRIPTION.UPDATED',
        'Subscription',
        current.id,
        snapshotOf(current),
        snapshotOf(updated),
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
