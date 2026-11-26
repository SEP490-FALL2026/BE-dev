import { Injectable } from '@nestjs/common';
import { Page, pageOf } from '../../../core/application/pagination';
import type { BusinessDate } from '../../../core/business-date';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import type { EmptyState } from '../public/catalog.types';
import { catalogAuditEvent } from '../catalog-audit-event.mapper';
import { PlanFactsService, type LockedPlan } from '../plan/plan-facts.service';
import { SubscriptionMultiLineService } from './lines/subscription-lines.service';
import {
  SubscriptionApplicationRetiredError,
  SubscriptionLinesXorPlanError,
  SubscriptionNotFoundError,
  SubscriptionPlanNotFoundError,
  SubscriptionStillDraftError,
  SubscriptionWorkspaceMovedError,
} from './subscription.errors';
import {
  assertDeclarable,
  assertSubscriptionShape,
  declaredStateOf,
  missingData,
  resolveSubscriptionPrices,
  subscriptionStatusOf,
} from './subscription.policy';
import { assertDeclarableCycle } from './pool/subscription-pool.policy';
import { SubscriptionRepo } from './subscription.repo';
import { snapshotOf, stateOf } from './subscription.mapper';
import { SubscriptionPoolService, retryOnWorkspaceMove } from './pool/subscription-pool.service';
import { isPricedInDong } from './price/subscription-price.policy';
import { SubscriptionPricingService } from './subscription-pricing.service';
import { SubscriptionViewService } from './subscription-view.service';
import type {
  BillingCycle,
  CommitmentTermMonths,
  DeclareSubscriptionInput,
  OriginalPriceRecord,
  SeatCounting,
  SubscriptionRecord,
  SubscriptionKind,
  SubscriptionListFilter,
  SubscriptionListScope,
  SubscriptionState,
  SubscriptionStatus,
  SubscriptionView,
} from './subscription.types';

/** The change of a subscription: the plan and the kind are not fields; only the four dates and the notice period clear. */
export interface UpdateSubscriptionInput {
  purchasedQuantity?: number;
  unitPrice?: { amount: string; currency: string };
  monthlyUnitPrice?: { amount: string; currency: string };
  /** `null` takes the recorded original price away. */
  originalPrice?: { amount: string; currency: string } | null;
  billingCycle?: BillingCycle;
  commitmentTermMonths?: CommitmentTermMonths;
  startDate?: BusinessDate;
  endDate?: BusinessDate | null;
  renewalDate?: BusinessDate | null;
  noticeDeadline?: BusinessDate | null;
  noticePeriodDays?: number | null;
  autoRenew?: boolean;
  allowsMidTermReduction?: boolean;
  vendorMinimumSeats?: number | null;
  isPrimaryForPlan?: boolean;
  quantityChangeReason?: string;
  /** Moves the subscription to another workspace of the same vendor. */
  workspaceId?: string;
  seatCounting?: SeatCounting;
  minimumSeatsTotal?: number | null;
  invoicedLater?: boolean;
}

/**
 * The subscriptions and perpetual purchases of the plans, declared by the IT Admin (`US-04-03`, `US-04-05`). A write is
 * one transaction: the plan is locked `FOR SHARE`, the price is entered in dong and recorded with the snapshot of the same
 * currency (`QĐ-111an`: no exchange rate is read), the status is computed from what is complete, the audit event commits with the
 * row (see the standard lock order in `docs/rules/database-business.md`: subscription candidates before plan). The notice
 * deadline, its source, the alert dates and the data-quality warning are derived when a subscription is read.
 */
@Injectable()
export class SubscriptionService {
  constructor(
    private readonly subscriptions: SubscriptionRepo,
    private readonly plans: PlanFactsService,
    private readonly pricing: SubscriptionPricingService,
    private readonly views: SubscriptionViewService,
    private readonly multiLine: SubscriptionMultiLineService,
    private readonly poolRules: SubscriptionPoolService,
    private readonly audit: AuditApi,
    private readonly runner: TransactionRunner,
  ) {}

  /**
   * One page. `mine` keeps the subscriptions the caller answers for; `expiry` keeps the ones that are near or past their point of adjustment
   * (`QĐ-111o`): they are found among the subscriptions that run a period by the rule of the policy and then paged, so the total is the
   * total of the filter.
   */
  async list(
    query: {
      applicationId?: string;
      planId?: string;
      workspaceId?: string;
      status?: SubscriptionStatus;
      kind?: SubscriptionKind;
      warning?: 'NO_ALERT_ANCHOR';
      mine?: boolean;
      expiry?: 'SOON' | 'EXPIRED';
      page: number;
      pageSize: number;
    },
    callerEmployeeId: string,
  ): Promise<Page<SubscriptionView>> {
    const scope: SubscriptionListScope = {
      ...(query.applicationId ? { applicationId: query.applicationId } : {}),
      ...(query.planId ? { planId: query.planId } : {}),
      ...(query.workspaceId ? { workspaceId: query.workspaceId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.kind ? { kind: query.kind } : {}),
      ...(query.warning ? { withoutAlertAnchor: true } : {}),
      ...(query.mine ? { responsibleItAdminEmployeeId: callerEmployeeId } : {}),
    };
    const filter: SubscriptionListFilter = {
      ...scope,
      ...(query.expiry ? { ids: await this.idsWithExpiry(scope, query.expiry) } : {}),
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    };
    const { items, total } = await this.subscriptions.list(filter);

    return pageOf(await this.views.viewAll(items), total, query.page, query.pageSize);
  }

  /** The ids of the subscriptions among `scope` that stand at `state` against their point of adjustment today. */
  private async idsWithExpiry(scope: SubscriptionListScope, state: 'SOON' | 'EXPIRED'): Promise<string[]> {
    const candidates = await this.subscriptions.findExpiryCandidates(scope);
    const readings = await this.views.expiryReadings(candidates);

    return candidates.filter((record) => readings.get(record.id)?.state === state).map((record) => record.id);
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
   * `assertSubscriptionShape`, SubscriptionPriceNotVndError for a unit price that is not in dong, and the money errors of the
   * finance facade for the unit price and the original price.
   */
  async declare(actor: AuthenticatedPrincipal, input: DeclareSubscriptionInput): Promise<SubscriptionView> {
    const hasLines = input.lines !== undefined;
    const hasPlanId = input.planId !== undefined;
    if (hasLines === hasPlanId) throw new SubscriptionLinesXorPlanError();
    assertDeclarable(input.kind);
    assertDeclarableCycle(input.billingCycle);

    if (input.lines) {
      const created = await this.multiLine.declare(actor, input, input.lines);

      return (await this.views.viewAll([created]))[0];
    }

    const planId = input.planId!;
    const sentUnit = input.unitPrice ? await this.pricing.read(input.unitPrice, 'unitPrice') : undefined;
    const sentMonthly = input.monthlyUnitPrice
      ? await this.pricing.read(input.monthlyUnitPrice, 'monthlyUnitPrice')
      : undefined;
    const resolvedPrice = resolveSubscriptionPrices({
      kind: input.kind,
      billingCycle: input.billingCycle ?? null,
      cycleChanged: false,
      sentMonthly,
      sentUnit,
    });
    const originalPrice = input.originalPrice ? await this.pricing.readOriginal(input.originalPrice) : null;
    const organizationId = await this.requireOrganizationId();
    if (input.responsibleItAdminEmployeeId) await this.poolRules.requireItAdmin(input.responsibleItAdminEmployeeId);

    const record = await this.runner.run((tx) =>
      this.declareIn(
        tx,
        actor,
        { ...input, planId },
        {
          money: resolvedPrice.unitMoney,
          monthlyUnitPriceMinor: resolvedPrice.monthlyUnitPriceMinor,
          originalPrice,
          organizationId,
        },
      ),
    );

    return (await this.views.viewAll([record]))[0];
  }

  private async declareIn(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    input: DeclareSubscriptionInput & { planId: string },
    ctx: {
      money: { amountMinor: bigint; currency: string } | null;
      monthlyUnitPriceMinor: bigint | null;
      originalPrice: OriginalPriceRecord | null;
      organizationId: string;
    },
  ): Promise<SubscriptionRecord> {
    const { money, monthlyUnitPriceMinor, originalPrice, organizationId } = ctx;
    // The workspace is locked `FOR UPDATE` first (tier 5b), so two declarations into one workspace take turns; its vendor is read from the plan
    // without a lock, as it never changes.
    const [unlocked] = await this.plans.lookups([input.planId], tx);
    if (!unlocked) throw new SubscriptionPlanNotFoundError();
    assertDeclarable(input.kind, unlocked.provisioningType);
    const workspaceId = await this.poolRules.workspaceFor(tx, actor, organizationId, unlocked, input.workspaceId);
    // The plan is locked `FOR UPDATE` before anything else: no row of this subscription exists yet to lock, so the plan is what two
    // declarations of the same K2 or K4 plan take turns on (R-E02); every other writer locks a subscription first, then its plan.
    const plan = await this.plans.lockExclusive(tx, input.planId);
    if (!plan) throw new SubscriptionPlanNotFoundError();
    if (plan.applicationStatus === 'RETIRED') throw new SubscriptionApplicationRetiredError();
    await this.poolRules.assertNoLiveDuplicate(tx, plan, null, workspaceId);
    const commitmentTermMonths =
      input.commitmentTermMonths ?? (input.kind === 'TERM' ? (plan.referenceCommitmentMonths ?? undefined) : undefined);
    const state = {
      ...declaredStateOf({ ...input, commitmentTermMonths }),
      // QĐ-111g: a declaration that names nobody takes the IT Admin responsible for the application, when they still work as one.
      responsibleItAdminEmployeeId: await this.poolRules.responsibleOfDeclaration(
        tx,
        plan.id,
        input.responsibleItAdminEmployeeId,
      ),
    };
    this.assertShape(plan, input.kind, state);

    const priced = await this.pricing.priceToday(tx, money);
    const complete = subscriptionStatusOf(plan, input.kind, { ...state, ...priced });
    this.poolRules.assert(plan, input.kind, state, complete === 'ACTIVE');
    if (complete === 'ACTIVE') await this.poolRules.assertVendorAdmins(tx, plan, organizationId, workspaceId);

    return this.persistDeclaredSubscription(tx, actor, {
      plan,
      kind: input.kind,
      state,
      priced,
      monthlyUnitPriceMinor,
      originalPrice,
      status: complete,
      organizationId,
      workspaceId,
    });
  }

  private async persistDeclaredSubscription(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    params: {
      plan: LockedPlan;
      kind: SubscriptionKind;
      state: ReturnType<typeof declaredStateOf<BillingCycle, CommitmentTermMonths>> & {
        responsibleItAdminEmployeeId: string | null;
      };
      priced: Awaited<ReturnType<SubscriptionPricingService['priceToday']>>;
      monthlyUnitPriceMinor: bigint | null;
      originalPrice: OriginalPriceRecord | null;
      status: 'DRAFT' | 'ACTIVE';
      organizationId: string;
      workspaceId: string | null;
    },
  ): Promise<SubscriptionRecord> {
    const { plan, kind, state, priced, monthlyUnitPriceMinor, originalPrice, status, organizationId, workspaceId } =
      params;
    const created = await this.subscriptions.insert(tx, {
      organizationId,
      planId: plan.id,
      kind,
      ...state,
      ...priced,
      monthlyUnitPriceMinor,
      originalPrice,
      status,
      workspaceId,
    });
    await this.createK2TermLineIfNeeded({
      tx,
      actor,
      plan,
      kind,
      state,
      status,
      subscriptionId: created.id,
      monthlyUnitPriceMinor,
      organizationId,
      workspaceId,
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
   * Completes a draft once its data is whole. A price an earlier release left in another currency is no price: the draft is
   * completed once it is entered again in dong. Throws SubscriptionNotFoundError and SubscriptionStillDraftError naming
   * what is still missing. An active subscription is answered unchanged.
   */
  async complete(actor: AuthenticatedPrincipal, id: string): Promise<SubscriptionView> {
    const organizationId = await this.requireOrganizationId();

    const record = await retryOnWorkspaceMove(() =>
      this.runner.run((tx) => this.completeIn(tx, actor, id, organizationId)),
    );

    return (await this.views.viewAll([record]))[0];
  }

  private async completeIn(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    id: string,
    organizationId: string,
  ): Promise<SubscriptionRecord> {
    {
      const { current, workspaceId } = await this.lockWorkspaceThenPeriod(tx, actor, id, organizationId);
      if (current.status === 'ACTIVE') return current;
      // The subscription candidates are locked first, then the plan `FOR UPDATE`: a draft that becomes live takes its turn against the other writes of the plan.
      const plan = await this.plans.lockExclusive(tx, current.planId);
      if (!plan) throw new SubscriptionPlanNotFoundError();

      const state = { ...stateOf(current), workspaceId: workspaceId ?? current.workspace?.id ?? null };
      const missing = this.missingOf(plan, current.kind, state);
      const effectiveMissing =
        missing.includes('UNIT_PRICE') && (await this.multiLine.hasPricedLines(id, tx))
          ? missing.filter((item) => item !== 'UNIT_PRICE')
          : missing;
      if (effectiveMissing.length > 0) throw new SubscriptionStillDraftError(effectiveMissing);
      await this.poolRules.assertActivation(
        tx,
        plan,
        current.kind,
        state,
        current.renewedFromId !== null,
        organizationId,
      );
      await this.poolRules.assertNoLiveDuplicate(tx, plan, id, state.workspaceId);

      // A draft renewal period takes the flag that prices the plan from the period it continues, now that it is active (F-012).
      const takesPrimary = await this.poolRules.takePrimaryFromPrevious(tx, actor, organizationId, current);
      const completed = await this.subscriptions.update(tx, id, {
        ...state,
        status: 'ACTIVE',
        isPrimaryForPlan: takesPrimary || state.isPrimaryForPlan,
      });
      await this.multiLine.activatePeriod(tx, completed, actor.employeeId);
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
    }
  }

  /**
   * The locks of a completion in the order of the lock table: the workspace first (tier 5b), read without a lock, locked, and read again once the
   * period is locked (N5); then the period. A draft of a plan that needs a workspace and has none takes the default of its vendor. Throws
   * SubscriptionNotFoundError, SubscriptionPlanNotFoundError and SubscriptionWorkspaceMovedError.
   */
  private async lockWorkspaceThenPeriod(tx: DbTx, actor: AuthenticatedPrincipal, id: string, organizationId: string) {
    const probe = await this.subscriptions.find(id, tx);
    if (!probe) throw new SubscriptionNotFoundError();
    const [unlocked] = await this.plans.lookups([probe.planId], tx);
    if (!unlocked) throw new SubscriptionPlanNotFoundError();
    const workspaceId =
      probe.status === 'ACTIVE'
        ? null
        : await this.poolRules.workspaceFor(tx, actor, organizationId, unlocked, probe.workspace?.id);
    const current = await this.lockForComplete(tx, id);
    if ((current.workspace?.id ?? null) !== (probe.workspace?.id ?? null)) {
      throw new SubscriptionWorkspaceMovedError(current.updatedAt);
    }

    return { current, workspaceId };
  }

  /**
   * Locks the draft subscription and, when it renews a previous period, all current primary candidates of the plan together with
   * the previous period in id order before locking the plan.
   */
  private async lockForComplete(tx: DbTx, id: string): Promise<SubscriptionRecord> {
    const probe = await this.subscriptions.find(id, tx);
    if (!probe) throw new SubscriptionNotFoundError();
    if (probe.renewedFromId !== null) {
      await this.subscriptions.lockPrimaryCandidates(tx, probe.planId, [id, probe.renewedFromId]);
      const current = await this.subscriptions.find(id, tx);
      if (!current) throw new SubscriptionNotFoundError();

      return current;
    }
    const current = await this.subscriptions.lock(tx, id);
    if (!current) throw new SubscriptionNotFoundError();

    return current;
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
      planKeyBinding: plan.keyBinding,
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
      hasPrice: isPricedInDong(state),
    });
  }

  private async createK2TermLineIfNeeded(params: {
    tx: DbTx;
    actor: AuthenticatedPrincipal;
    plan: LockedPlan;
    kind: SubscriptionKind;
    state: ReturnType<typeof declaredStateOf<BillingCycle, CommitmentTermMonths>>;
    status: 'DRAFT' | 'ACTIVE';
    subscriptionId: string;
    monthlyUnitPriceMinor: bigint | null;
    organizationId: string;
    workspaceId: string | null;
  }): Promise<void> {
    const { tx, actor, plan, kind, state, status, subscriptionId, monthlyUnitPriceMinor, organizationId, workspaceId } =
      params;
    if (
      plan.provisioningType !== 'K2' ||
      kind !== 'TERM' ||
      !workspaceId ||
      monthlyUnitPriceMinor === null ||
      monthlyUnitPriceMinor <= 0n
    ) {
      return;
    }
    await this.multiLine.createForPeriod(tx, {
      organizationId,
      subscriptionId,
      workspaceId,
      startDate: state.startDate,
      status,
      recordedByEmployeeId: actor.employeeId,
      lines: [
        {
          planId: plan.id,
          monthlyUnitPriceMinor,
          minimumSeats: state.vendorMinimumSeats ?? null,
          quantity: state.purchasedQuantity ?? 0,
        },
      ],
    });
  }

  private requireOrganizationId(): Promise<string> {
    return this.multiLine.requireOrganizationId();
  }
}
