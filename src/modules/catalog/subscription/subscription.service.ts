import { Injectable } from '@nestjs/common';
import { Page, pageOf } from '../../../core/application/pagination';
import type { BusinessDate } from '../../../core/business-date';
import type { Money } from '../../../core/money/money';
import { MoneyOutOfRangeError } from '../../../core/money/money.errors';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditService } from '../../audit/audit.service';
import { FinanceService } from '../../finance/finance.service';
import { OrganizationService } from '../../organization/organization.service';
import type { EmptyState } from '../catalog.types';
import { catalogAuditEvent } from '../mappers/catalog-audit-event';
import { PlanLookupService, type LockedPlan } from '../plan/plan-lookup.service';
import {
  SubscriptionNotFoundError,
  SubscriptionPlanNotFoundError,
  SubscriptionStillDraftError,
  SubscriptionUpdateEmptyError,
} from './subscription.errors';
import { assertQuantityNotBelowOccupied } from './seat-guard.policy';
import { SeatOccupancyRegistry } from './seat-occupancy.registry';
import { assertSubscriptionShape, deriveNotice, missingData, noticeInputOf } from './subscription.policy';
import { SubscriptionRepo } from './subscription.repo';
import { sameState, snapshotOf, stateOf, toSnapshot } from './subscription.state';
import { SubscriptionViewService } from './subscription-view.service';
import type {
  BillingCycle,
  PriceSnapshotRecord,
  SubscriptionKind,
  SubscriptionListFilter,
  SubscriptionState,
  SubscriptionStatus,
  SubscriptionView,
  UnitPriceRecord,
} from './subscription.types';

export interface DeclareSubscriptionInput {
  planId: string;
  kind: SubscriptionKind;
  purchasedQuantity?: number;
  unitPrice?: { amount: string; currency: string };
  billingCycle?: BillingCycle;
  startDate?: BusinessDate;
  endDate?: BusinessDate;
  renewalDate?: BusinessDate;
  noticeDeadline?: BusinessDate;
  noticePeriodDays?: number;
  autoRenew?: boolean;
  allowsMidTermReduction?: boolean;
}

/** The change of a subscription: the plan and the kind are not fields; only the four dates and the notice period clear. */
export interface UpdateSubscriptionInput {
  purchasedQuantity?: number;
  unitPrice?: { amount: string; currency: string };
  billingCycle?: BillingCycle;
  startDate?: BusinessDate;
  endDate?: BusinessDate | null;
  renewalDate?: BusinessDate | null;
  noticeDeadline?: BusinessDate | null;
  noticePeriodDays?: number | null;
  autoRenew?: boolean;
  allowsMidTermReduction?: boolean;
}

/**
 * The subscriptions and perpetual purchases of the plans, declared by the IT Admin (`US-04-03`, `US-04-05`). A write is
 * one transaction: the plan is locked `FOR SHARE`, the price is converted by the finance facade at the rate of the day it
 * is recorded (frozen, never recomputed), the status is computed from what is complete, the audit event commits with the
 * row. The notice deadline, its source, the alert dates and the data-quality warning are derived when a subscription is read.
 */
@Injectable()
export class SubscriptionService {
  constructor(
    private readonly subscriptions: SubscriptionRepo,
    private readonly plans: PlanLookupService,
    private readonly finance: FinanceService,
    private readonly views: SubscriptionViewService,
    private readonly organization: OrganizationService,
    private readonly occupancy: SeatOccupancyRegistry,
    private readonly audit: AuditService,
    private readonly runner: TransactionRunner,
  ) {}

  async list(query: {
    applicationId?: string;
    planId?: string;
    status?: SubscriptionStatus;
    kind?: SubscriptionKind;
    warning?: 'NO_ALERT_ANCHOR';
    page: number;
    pageSize: number;
  }): Promise<Page<SubscriptionView>> {
    const filter: SubscriptionListFilter = {
      ...(query.applicationId ? { applicationId: query.applicationId } : {}),
      ...(query.planId ? { planId: query.planId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.kind ? { kind: query.kind } : {}),
      ...(query.warning ? { withoutAlertAnchor: true } : {}),
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    };
    const { items, total } = await this.subscriptions.list(filter);

    return pageOf(await this.views.viewAll(items), total, query.page, query.pageSize);
  }

  /** The guidance of an empty list: set only when there is not one subscription at all, not when a filter matched none. */
  async emptyState(): Promise<EmptyState | null> {
    if ((await this.subscriptions.count()) > 0) return null;

    return { reason: 'NO_SUBSCRIPTIONS', nextStep: { step: 3, key: 'CONTRACTS_AND_SUBSCRIPTIONS' } };
  }

  /** Throws SubscriptionNotFoundError. */
  async get(id: string): Promise<SubscriptionView> {
    const record = await this.subscriptions.find(id);
    if (!record) throw new SubscriptionNotFoundError();

    return (await this.views.viewAll([record]))[0];
  }

  /**
   * Declares a subscription or a perpetual purchase. Throws SubscriptionPlanNotFoundError, the shape errors of
   * `assertSubscriptionShape`, and the money errors of the finance facade for the unit price.
   */
  async declare(actor: AuthenticatedPrincipal, input: DeclareSubscriptionInput): Promise<SubscriptionView> {
    const money = input.unitPrice ? await this.readPrice(input.unitPrice) : null;
    const organizationId = await this.requireOrganizationId();

    const record = await this.runner.run(async (tx) => {
      const plan = await this.plans.lockShared(tx, input.planId);
      if (!plan) throw new SubscriptionPlanNotFoundError();
      const state = {
        purchasedQuantity: input.purchasedQuantity ?? null,
        billingCycle: input.billingCycle ?? null,
        startDate: input.startDate ?? null,
        endDate: input.endDate ?? null,
        renewalDate: input.renewalDate ?? null,
        noticeDeadline: input.noticeDeadline ?? null,
        noticePeriodDays: input.noticePeriodDays ?? null,
        autoRenew: input.autoRenew ?? false,
        allowsMidTermReduction: input.allowsMidTermReduction ?? false,
      };
      this.assertShape(plan, input.kind, state);

      const priced = money ? await this.priceOf(tx, money) : { unitPrice: null, priceSnapshot: null };
      const complete = this.statusOf(plan, input.kind, { ...state, ...priced });
      const created = await this.subscriptions.insert(tx, {
        organizationId,
        planId: plan.id,
        kind: input.kind,
        ...state,
        ...priced,
        status: complete,
      });
      await this.audit.record(
        tx,
        catalogAuditEvent(
          actor,
          organizationId,
          'SUBSCRIPTION.CREATED',
          'Subscription',
          created.id,
          null,
          snapshotOf(created),
        ),
      );

      return created;
    });

    return (await this.views.viewAll([record]))[0];
  }

  /**
   * Changes a subscription: a new unit price is converted again at the rate of today and recorded with today as its day;
   * the other fields are stored as they are. Throws SubscriptionNotFoundError, SubscriptionUpdateEmptyError, the shape
   * errors, and the money errors. A price edit that would leave an active subscription with no rate for its day is refused
   * by the finance facade's missing rate, never silently turned back into a draft.
   */
  async update(actor: AuthenticatedPrincipal, id: string, input: UpdateSubscriptionInput): Promise<SubscriptionView> {
    if (Object.values(input).every((value) => value === undefined)) throw new SubscriptionUpdateEmptyError();
    const money = input.unitPrice ? await this.readPrice(input.unitPrice) : null;
    const organizationId = await this.requireOrganizationId();

    const record = await this.runner.run(async (tx) => {
      const current = await this.subscriptions.lock(tx, id);
      if (!current) throw new SubscriptionNotFoundError();
      const plan = await this.plans.lockShared(tx, current.planId);
      if (!plan) throw new SubscriptionPlanNotFoundError();
      await this.assertNotBelowOccupied(tx, id, current.purchasedQuantity, input.purchasedQuantity);

      const next = {
        purchasedQuantity: input.purchasedQuantity === undefined ? current.purchasedQuantity : input.purchasedQuantity,
        billingCycle: input.billingCycle ?? current.billingCycle,
        startDate: input.startDate ?? current.startDate,
        endDate: input.endDate === undefined ? current.endDate : input.endDate,
        renewalDate: input.renewalDate === undefined ? current.renewalDate : input.renewalDate,
        noticeDeadline: input.noticeDeadline === undefined ? current.noticeDeadline : input.noticeDeadline,
        noticePeriodDays: input.noticePeriodDays === undefined ? current.noticePeriodDays : input.noticePeriodDays,
        autoRenew: input.autoRenew ?? current.autoRenew,
        allowsMidTermReduction: input.allowsMidTermReduction ?? current.allowsMidTermReduction,
      };
      this.assertShape(plan, current.kind, next);

      const samePrice =
        money === null ||
        (current.unitPrice !== null &&
          current.unitPrice.amountMinor === money.amountMinor &&
          current.unitPrice.currency === money.currency);
      const priced = samePrice
        ? { unitPrice: current.unitPrice, priceSnapshot: current.priceSnapshot }
        : await this.priceOf(tx, money);
      if (!samePrice && current.status === 'ACTIVE' && priced.priceSnapshot === null) {
        throw new SubscriptionStillDraftError(['EXCHANGE_RATE']);
      }
      const state: SubscriptionState = {
        ...next,
        ...priced,
        status: this.statusOf(plan, current.kind, { ...next, ...priced }),
      };
      if (sameState(state, stateOf(current))) return current;

      const updated = await this.subscriptions.update(tx, id, state);
      await this.audit.record(
        tx,
        catalogAuditEvent(
          actor,
          organizationId,
          'SUBSCRIPTION.UPDATED',
          'Subscription',
          id,
          snapshotOf(current),
          snapshotOf(updated),
        ),
      );
      if (
        deriveNotice(noticeInputOf(current)).source === 'INFERRED_UNCONFIRMED' &&
        deriveNotice(noticeInputOf(updated)).source === 'DECLARED'
      ) {
        await this.audit.record(
          tx,
          catalogAuditEvent(
            actor,
            organizationId,
            'SUBSCRIPTION.NOTICE_DEADLINE_CONFIRMED',
            'Subscription',
            id,
            { noticeDeadline: deriveNotice(noticeInputOf(current)).deadline },
            { noticeDeadline: updated.noticeDeadline },
          ),
        );
      }

      return updated;
    });

    return (await this.views.viewAll([record]))[0];
  }

  /**
   * Completes a draft once its data is whole: a price recorded with no rate for its day is converted at the rate now
   * entered for that very day, the day it was recorded on, not today's. Throws SubscriptionNotFoundError and
   * SubscriptionStillDraftError naming what is still missing. An active subscription is answered unchanged.
   */
  async complete(actor: AuthenticatedPrincipal, id: string): Promise<SubscriptionView> {
    const organizationId = await this.requireOrganizationId();

    const record = await this.runner.run(async (tx) => {
      const current = await this.subscriptions.lock(tx, id);
      if (!current) throw new SubscriptionNotFoundError();
      if (current.status === 'ACTIVE') return current;
      const plan = await this.plans.lockShared(tx, current.planId);
      if (!plan) throw new SubscriptionPlanNotFoundError();

      let priceSnapshot = current.priceSnapshot;
      if (current.unitPrice && !priceSnapshot) {
        const result = await this.finance.snapshotMoney(
          tx,
          { amountMinor: current.unitPrice.amountMinor, currency: current.unitPrice.currency },
          current.unitPrice.recordedOn,
        );
        priceSnapshot = result.status === 'CONVERTED' ? toSnapshot(result.snapshot) : null;
      }
      const state = { ...stateOf(current), priceSnapshot };
      const missing = this.missingOf(plan, current.kind, state);
      if (missing.length > 0) throw new SubscriptionStillDraftError(missing);

      const completed = await this.subscriptions.update(tx, id, { ...state, status: 'ACTIVE' });
      await this.audit.record(
        tx,
        catalogAuditEvent(
          actor,
          organizationId,
          'SUBSCRIPTION.COMPLETED',
          'Subscription',
          id,
          snapshotOf(current),
          snapshotOf(completed),
        ),
      );

      return completed;
    });

    return (await this.views.viewAll([record]))[0];
  }

  private assertShape(
    plan: LockedPlan,
    kind: SubscriptionKind,
    state: {
      startDate: BusinessDate | null;
      endDate: BusinessDate | null;
      renewalDate: BusinessDate | null;
      noticeDeadline: BusinessDate | null;
      noticePeriodDays: number | null;
      billingCycle: BillingCycle | null;
      autoRenew: boolean;
      allowsMidTermReduction: boolean;
    },
  ): void {
    assertSubscriptionShape({
      kind,
      applicationKind: plan.applicationKind,
      planProvisioningType: plan.provisioningType,
      ...state,
    });
  }

  /**
   * A number of seats under the one bought is checked against the assignments that hold a seat, under the lock of the
   * subscription that every writer of its seats holds, so a grant at the same moment cannot slip past (`US-04-03` AC-5).
   */
  private async assertNotBelowOccupied(
    tx: DbTx,
    subscriptionId: string,
    current: number | null,
    requested: number | undefined,
  ): Promise<void> {
    if (requested === undefined || current === null || requested >= current) return;
    const today = await this.organization.businessToday(new Date(), tx);
    const occupied = await this.occupancy.current().occupiedBySubscription(subscriptionId, today, tx);
    assertQuantityNotBelowOccupied({ requested, occupied });
  }

  private missingOf(plan: LockedPlan, kind: SubscriptionKind, state: SubscriptionState) {
    return missingData({
      kind,
      planPricingModel: plan.pricingModel,
      quantity: state.purchasedQuantity,
      startDate: state.startDate,
      billingCycle: state.billingCycle,
      hasPrice: state.unitPrice !== null,
      hasSnapshot: state.priceSnapshot !== null,
    });
  }

  private statusOf(
    plan: LockedPlan,
    kind: SubscriptionKind,
    state: Omit<SubscriptionState, 'status'>,
  ): SubscriptionStatus {
    return this.missingOf(plan, kind, { ...state, status: 'DRAFT' }).length === 0 ? 'ACTIVE' : 'DRAFT';
  }

  /** Reads the unit price in the minor units of its currency; a negative price is out of range. */
  private async readPrice(unitPrice: { amount: string; currency: string }): Promise<Money> {
    const money = await this.finance.parseMoney(unitPrice);
    if (money.amountMinor < 0n) throw new MoneyOutOfRangeError();

    return money;
  }

  /**
   * The unit price recorded today and converted at the rate of today, frozen. No rate for today leaves the price with no
   * snapshot (a draft), never a converted value from another day (`QĐ-42b`).
   */
  private async priceOf(
    tx: DbTx,
    money: Money | null,
  ): Promise<{ unitPrice: UnitPriceRecord | null; priceSnapshot: PriceSnapshotRecord | null }> {
    if (money === null) return { unitPrice: null, priceSnapshot: null };
    const recordedOn = await this.organization.businessToday(undefined, tx);
    const result = await this.finance.snapshotMoney(tx, money, recordedOn);

    return {
      unitPrice: { amountMinor: money.amountMinor, currency: money.currency, recordedOn },
      priceSnapshot: result.status === 'CONVERTED' ? toSnapshot(result.snapshot) : null,
    };
  }

  private async requireOrganizationId(): Promise<string> {
    const organization = await this.organization.getOrganization();
    if (!organization) throw new Error('Subscriptions were used before installation');

    return organization.id;
  }
}
