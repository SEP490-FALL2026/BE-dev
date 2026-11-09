import { Injectable } from '@nestjs/common';
import { Page, pageOf } from '../../../core/application/pagination';
import type { BusinessDate } from '../../../core/business-date';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { EmptyState } from '../public/catalog.types';
import { catalogAuditEvent } from '../catalog-audit-event.mapper';
import { PlanFactsService, type LockedPlan } from '../plan/plan-facts.service';
import {
  SubscriptionApplicationRetiredError,
  SubscriptionNotFoundError,
  SubscriptionOwnerDepartmentInactiveError,
  SubscriptionPlanNotFoundError,
  SubscriptionStillDraftError,
} from './subscription.errors';
import { assertSubscriptionShape, declaredStateOf, missingData, subscriptionStatusOf } from './subscription.policy';
import { assertDeclarableCycle, isPooledPlan } from './pool/subscription-pool.policy';
import { SubscriptionRepo } from './subscription.repo';
import { snapshotOf, stateOf } from './subscription.mapper';
import { SubscriptionPoolService } from './pool/subscription-pool.service';
import { SubscriptionPricingService } from './subscription-pricing.service';
import { SubscriptionViewService } from './subscription-view.service';
import type {
  BillingCycle,
  CommitmentTermMonths,
  SubscriptionRecord,
  SubscriptionKind,
  SubscriptionListFilter,
  SubscriptionState,
  SubscriptionStatus,
  SubscriptionView,
} from './subscription.types';

export interface DeclareSubscriptionInput {
  planId: string;
  /**
   * The department that owns the purchase, never changed afterwards. A `K2`/`K4` purchase is the company's shared pool (`QĐ-103d`) and may
   * name none; any other must name an active one (`QĐ-89a`).
   */
  ownerDepartmentId?: string;
  kind: SubscriptionKind;
  purchasedQuantity?: number;
  unitPrice?: { amount: string; currency: string };
  billingCycle?: BillingCycle;
  commitmentTermMonths?: CommitmentTermMonths;
  startDate?: BusinessDate;
  endDate?: BusinessDate;
  renewalDate?: BusinessDate;
  noticeDeadline?: BusinessDate;
  noticePeriodDays?: number;
  autoRenew?: boolean;
  allowsMidTermReduction?: boolean;
  responsibleItAdminEmployeeId?: string;
  vendorMinimumSeats?: number;
}

/** The change of a subscription: the plan and the kind are not fields; only the four dates and the notice period clear. */
export interface UpdateSubscriptionInput {
  purchasedQuantity?: number;
  unitPrice?: { amount: string; currency: string };
  billingCycle?: BillingCycle;
  commitmentTermMonths?: CommitmentTermMonths;
  startDate?: BusinessDate;
  endDate?: BusinessDate | null;
  renewalDate?: BusinessDate | null;
  noticeDeadline?: BusinessDate | null;
  noticePeriodDays?: number | null;
  autoRenew?: boolean;
  allowsMidTermReduction?: boolean;
  responsibleItAdminEmployeeId?: string;
  vendorMinimumSeats?: number | null;
  isPrimaryForPlan?: boolean;
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
    private readonly plans: PlanFactsService,
    private readonly pricing: SubscriptionPricingService,
    private readonly views: SubscriptionViewService,
    private readonly organizationReads: OrganizationReadApi,
    private readonly poolRules: SubscriptionPoolService,
    private readonly audit: AuditApi,
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
    assertDeclarableCycle(input.billingCycle);
    const money = input.unitPrice ? await this.pricing.read(input.unitPrice) : null;
    const organizationId = await this.requireOrganizationId();
    if (input.responsibleItAdminEmployeeId) await this.poolRules.requireItAdmin(input.responsibleItAdminEmployeeId);

    const record = await this.runner.run((tx) => this.declareIn(tx, actor, input, { money, organizationId }));

    return (await this.views.viewAll([record]))[0];
  }

  private async declareIn(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    input: DeclareSubscriptionInput,
    ctx: { money: { amountMinor: bigint; currency: string } | null; organizationId: string },
  ): Promise<SubscriptionRecord> {
    const { money, organizationId } = ctx;
    // The plan is locked `FOR UPDATE` before anything else: no row of this subscription exists yet to lock, so the plan is what two
    // declarations of the same K2 or K4 plan take turns on (R-E02); every other writer locks a subscription first, then its plan.
    const plan = await this.plans.lockExclusive(tx, input.planId);
    if (!plan) throw new SubscriptionPlanNotFoundError();
    if (plan.applicationStatus === 'RETIRED') throw new SubscriptionApplicationRetiredError();
    await this.poolRules.assertNoLiveDuplicate(tx, plan, null, organizationId);
    const ownerDepartmentId = await this.ownerOf(tx, plan.provisioningType, input.ownerDepartmentId);
    const state = declaredStateOf(input);
    this.assertShape(plan, input.kind, state);

    const priced = await this.pricing.priceToday(tx, money);
    const complete = subscriptionStatusOf(plan, input.kind, { ...state, ...priced });
    this.poolRules.assert(plan, input.kind, state, complete === 'ACTIVE');
    const created = await this.subscriptions.insert(tx, {
      organizationId,
      planId: plan.id,
      ownerDepartmentId,
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
  }

  /**
   * The department that owns a purchase being declared: none for a `K2`/`K4` purchase that names none (the shared pool of the company,
   * `QĐ-103d`; its cost follows the people who hold its seats, `QĐ-103k`), otherwise the one named, which must be active (`QĐ-89a`). It is
   * held FOR SHARE until commit, so the department cannot be stopped between this check and the row. A purchase of any other kind that
   * names none is refused like one that names a department that does not exist. Throws SubscriptionOwnerDepartmentInactiveError.
   */
  private async ownerOf(
    tx: DbTx,
    provisioningType: LockedPlan['provisioningType'],
    departmentId: string | undefined,
  ): Promise<string | null> {
    if (departmentId === undefined) {
      if (isPooledPlan(provisioningType)) return null;
      throw new SubscriptionOwnerDepartmentInactiveError();
    }
    const owner = await this.organizationReads.lockDepartmentShared(tx, departmentId);
    if (!owner?.active) throw new SubscriptionOwnerDepartmentInactiveError();

    return owner.id;
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
      // The subscription is locked, then its plan `FOR UPDATE`: a draft that becomes live takes its turn against the other writes of the plan.
      const plan = await this.plans.lockExclusive(tx, current.planId);
      if (!plan) throw new SubscriptionPlanNotFoundError();

      const priceSnapshot =
        current.unitPrice && !current.priceSnapshot
          ? await this.pricing.snapshotOfRecorded(tx, current.unitPrice)
          : current.priceSnapshot;
      const state = { ...stateOf(current), priceSnapshot };
      const missing = this.missingOf(plan, current.kind, state);
      if (missing.length > 0) throw new SubscriptionStillDraftError(missing);
      await this.poolRules.assertActivation(tx, plan, current.kind, state);
      await this.poolRules.assertNoLiveDuplicate(tx, plan, id, organizationId);

      // A draft renewal period takes the flag that prices the plan from the period it continues, now that it is active (F-012).
      const takesPrimary = await this.poolRules.takePrimaryFromPrevious(tx, actor, organizationId, current);
      const completed = await this.subscriptions.update(tx, id, {
        ...state,
        status: 'ACTIVE',
        isPrimaryForPlan: takesPrimary || state.isPrimaryForPlan,
      });
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
      commitmentTermMonths: CommitmentTermMonths | null;
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

  private async requireOrganizationId(): Promise<string> {
    const organization = await this.organizationReads.getOrganization();
    if (!organization) throw new Error('Subscriptions were used before installation');

    return organization.id;
  }
}
