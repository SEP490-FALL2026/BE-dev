import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../../audit/public/audit.api';
import { IdentityAccessApi } from '../../../identity-access/public/identity-access.api';
import { OrganizationReadApi } from '../../../organization/public/organization-read.api';
import { catalogAuditEvent } from '../../catalog-audit-event.mapper';
import { PlanFactsService, type LockedPlan } from '../../plan/plan-facts.service';
import { needsVendorAdmins } from '../../plan/plan-vendor-admins.policy';
import { PoolSeatNotAddableError } from '../../public/catalog.errors';
import { SeatBaselinePhaseHook } from '../../public/catalog.extension-points';
import {
  SubscriptionDuplicatePlanError,
  SubscriptionPrimaryNotEligibleError,
  SubscriptionResponsibleNotItAdminError,
  SubscriptionStaleError,
  SubscriptionWorkspaceMovedError,
} from '../subscription.errors';
import {
  assertPoolTerms,
  assertResponsibleNamed,
  assertVendorAdminsRecorded,
  defaultResponsibleOf,
  isPooledPlan,
  liveIdsByPlan,
  liveSiblingsOf,
} from './subscription-pool.policy';
import { SubscriptionSeatIncreaseService } from '../seat-increase/subscription-seat-increase.service';
import { WorkspaceForSubscriptionService } from '../../workspace/workspace-for-subscription.service';
import { stateOf } from '../subscription.mapper';
import { SubscriptionRepo } from '../subscription.repo';
import type {
  BillingCycle,
  CommitmentTermMonths,
  SeatCounting,
  SubscriptionKind,
  SubscriptionRecord,
  SubscriptionState,
} from '../subscription.types';

/** How many times a write whose workspace moved under it starts again before it says the subscription is stale (W3-14, N5). */
const WORKSPACE_MOVE_TRIES = 3;

/**
 * Runs a write that locks the workspace of a subscription before its period: it reads the workspace without a lock, locks it, locks the period, and
 * reads the workspace again; when it moved the write rolls back and starts again (the work throws SubscriptionWorkspaceMovedError). Three tries,
 * then SubscriptionStaleError.
 */
export async function retryOnWorkspaceMove<T>(work: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await work();
    } catch (error) {
      if (!(error instanceof SubscriptionWorkspaceMovedError)) throw error;
      if (attempt >= WORKSPACE_MOVE_TRIES) throw new SubscriptionStaleError(error.currentUpdatedAt);
    }
  }
}

/** What an update of a subscription names of the fields the shared pool governs. */
export interface PoolChangeInput {
  billingCycle?: BillingCycle;
  commitmentTermMonths?: CommitmentTermMonths;
  responsibleItAdminEmployeeId?: string;
  isPrimaryForPlan?: boolean;
  /** How the seats are counted and the payment day: a write that names them is judged by the members rules (W3-11). */
  seatCounting?: SeatCounting;
  renewalDate?: string | null;
}

/** A change of a subscription as the pool judges it: who writes, in which organization, and the state the write leaves. */
export interface PoolChange {
  plan: LockedPlan;
  current: SubscriptionRecord;
  state: SubscriptionState;
  input: PoolChangeInput;
  actor: AuthenticatedPrincipal;
  organizationId: string;
}

/**
 * The rules of the shared pool a subscription meets when it is declared, completed or changed (`QĐ-103e`, `QĐ-103v`(4), R-E01, R-E03,
 * R-G01): what the pure policy cannot know, namely who may answer for it. The person is read without a lock: a role taken away a
 * moment after the check is not stopped by it.
 */
@Injectable()
export class SubscriptionPoolService {
  constructor(
    private readonly identity: IdentityAccessApi,
    private readonly organizationReads: OrganizationReadApi,
    private readonly subscriptions: SubscriptionRepo,
    private readonly audit: AuditApi,
    private readonly baselinePhase: SeatBaselinePhaseHook,
    private readonly planFacts: PlanFactsService,
    private readonly seatIncrease: SubscriptionSeatIncreaseService,
    private readonly workspaces: WorkspaceForSubscriptionService,
  ) {}

  /**
   * The workspace a subscription of this plan is held in, locked for the rest of the transaction (W3-11, W3-14): the one named, else the default
   * of the vendor for a plan the company administers there. Taken before the plan and the period are locked. Throws WorkspaceNotFoundError,
   * WorkspaceVendorMismatchError and WorkspaceRequiredError.
   */
  workspaceFor(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    organizationId: string,
    plan: LockedPlan,
    named: string | null | undefined,
  ): Promise<string | null> {
    return this.workspaces.resolveAndLock(
      tx,
      actor,
      organizationId,
      {
        vendorId: plan.applicationVendorId ?? null,
        needsWorkspace: needsVendorAdmins(plan.provisioningType, plan.hasAdminConsole),
      },
      named,
    );
  }

  /** Locks the workspaces of a move in id order, each held at the vendor of the plan. */
  lockWorkspaces(tx: DbTx, plan: LockedPlan, ids: readonly (string | null)[]): Promise<void> {
    return this.workspaces.lockBoth(tx, ids, plan.applicationVendorId ?? null);
  }

  /**
   * The IT Admin a subscription being declared answers to (`QĐ-111g`): the one the declaration names, else the one responsible for the
   * application of its plan while they are a usable IT Admin, else none. The one responsible is read through the plan, one column and not
   * the whole application row. Read inside the transaction of the declaration.
   */
  async responsibleOfDeclaration(tx: DbTx, planId: string, named: string | undefined): Promise<string | null> {
    if (named !== undefined) return named;
    const responsible = await this.planFacts.responsibleItAdminIdOf(planId, tx);
    const usable =
      responsible === null ? new Set<string>() : await this.identity.findUsableItAdminEmployeeIds([responsible], tx);

    return defaultResponsibleOf({
      named,
      applicationResponsible: responsible,
      applicationResponsibleIsUsable: responsible !== null && usable.has(responsible),
    });
  }

  /**
   * The commitment, the K1 plan and the IT Admin who answers for it, judged on the state a write leaves. Throws the errors of
   * `assertPoolTerms` and SubscriptionResponsibleRequiredError. `activating` is true when the write makes the subscription active.
   */
  assert(
    plan: LockedPlan,
    kind: SubscriptionKind,
    state: {
      billingCycle: BillingCycle | null;
      commitmentTermMonths: CommitmentTermMonths | null;
      responsibleItAdminEmployeeId: string | null;
      seatCounting?: SeatCounting | undefined;
      renewalDate?: string | null | undefined;
    },
    activating: boolean,
  ): void {
    assertPoolTerms({
      kind,
      planProvisioningType: plan.provisioningType,
      billingCycle: state.billingCycle,
      commitmentTermMonths: state.commitmentTermMonths,
      activating,
      seatCounting: state.seatCounting,
      renewalDate: state.renewalDate,
    });
    assertResponsibleNamed(state.responsibleItAdminEmployeeId, activating);
  }

  /**
   * The rules for a subscription that becomes active with the data it holds (a draft completed): the commitment, the K1 plan and the
   * IT Admin it names, who must still work, hold the role and be able to sign in now, not only when the name was written. A draft that is
   * not the period of a renewal is a new subscription and also needs at least two working vendor admins once the baseline phase is closed
   * (`continuesPeriod` false); the period a renewal continues never does. Throws the errors of `assert`,
   * SubscriptionResponsibleNotItAdminError and SubscriptionVendorAdminsRequiredError.
   */
  async assertActivation(
    tx: DbTx,
    plan: LockedPlan,
    kind: SubscriptionKind,
    state: {
      billingCycle: BillingCycle | null;
      commitmentTermMonths: CommitmentTermMonths | null;
      responsibleItAdminEmployeeId: string | null;
      seatCounting?: SeatCounting | undefined;
      renewalDate?: string | null | undefined;
    },
    continuesPeriod: boolean,
    organizationId: string,
  ): Promise<void> {
    this.assert(plan, kind, state, true);
    await this.requireItAdmin(state.responsibleItAdminEmployeeId as string, tx);
    if (!continuesPeriod) await this.assertVendorAdmins(tx, plan, organizationId);
  }

  /**
   * A plan that needs admins at the vendor (`K2`, or `K4` with an admin console) is activated, or its pool made, only when at least two
   * distinct recorded IT Admins are still working once the seat baseline phase is closed (or when no baseline hook is bound); while the
   * baseline phase is open it is let through. The plan is locked by the caller. Throws SubscriptionVendorAdminsRequiredError.
   */
  async assertVendorAdmins(tx: DbTx, plan: LockedPlan, organizationId: string): Promise<void> {
    const needs = needsVendorAdmins(plan.provisioningType, plan.hasAdminConsole);
    if (!needs) return;
    // Nobody to say the baseline is still open: take it as closed, so nothing is let through by accident.
    const closed = !this.baselinePhase.isBound() || (await this.baselinePhase.get().isClosed(tx, organizationId));
    if (!closed) return;
    const profile = (await this.planFacts.vendorAdminsOf([plan.id], tx)).get(plan.id);
    const memberIds = [...new Set(profile?.members.map((member) => member.employeeId) ?? [])];
    const working = await this.planFacts.workingAdminsAmong(memberIds, tx);
    assertVendorAdminsRecorded({
      needs,
      given: working.size,
      planId: plan.id,
    });
  }

  /**
   * Judges a change of a subscription: the rules of the pool apply to a write that makes a draft active or touches the
   * commitment or the cycle; data older than the rules is otherwise left as it is. A write that
   * makes the subscription the one that prices its plan takes the flag off the others of the plan (the caller holds the plan
   * locked `FOR UPDATE`). Throws the errors of `assert` and SubscriptionPrimaryNotEligibleError.
   */
  async judgeChange(tx: DbTx, change: PoolChange): Promise<void> {
    const { plan, current, state, input, organizationId } = change;
    const activating = current.status === 'DRAFT' && state.status === 'ACTIVE';
    // Changing only the person who answers does not judge a commitment and cycle the write did not touch (F-009).
    const touches =
      input.billingCycle !== undefined ||
      input.commitmentTermMonths !== undefined ||
      input.seatCounting !== undefined ||
      input.renewalDate !== undefined;
    if (activating) {
      await this.assertActivation(tx, plan, current.kind, state, current.renewedFromId !== null, organizationId);
    } else if (touches) this.assert(plan, current.kind, state, false);
    if (input.isPrimaryForPlan) await this.makePrimary(tx, change);
  }

  /**
   * A second live subscription of a K2 or K4 plan (`QĐ-104k`(3), R-E02): while the seat baseline is open it is let through (the read answers
   * `SHOULD_MERGE`), once closed it is refused. The caller holds the plan `FOR UPDATE`, so two writes of the plan take turns. A renewal is
   * never a duplicate: the period it continues is no longer live. `selfId` is the subscription being completed, none for a new one. Throws
   * SubscriptionDuplicatePlanError.
   */
  async assertNoLiveDuplicate(
    tx: DbTx,
    plan: LockedPlan,
    selfId: string | null,
    organizationId: string,
  ): Promise<void> {
    if (!isPooledPlan(plan.provisioningType)) return;
    const today = await this.organizationReads.businessToday(new Date(), tx);
    const rows = await this.subscriptions.findLivenessOfPooledPlans([plan.id], tx);
    const siblings = liveSiblingsOf(liveIdsByPlan(rows, today), plan.id, selfId);
    if (siblings.length === 0) return;
    // Nobody to say the baseline is still open: take it as closed, so nothing is let through by accident.
    const closed = !this.baselinePhase.isBound() || (await this.baselinePhase.get().isClosed(tx, organizationId));
    if (closed) throw new SubscriptionDuplicatePlanError(siblings);
  }

  /**
   * Whether the period that is being completed continues one that priced its plan: the flag moves to it from the previous period in this
   * transaction (F-012), the previous one being the one a draft renewal had to leave it on. True when the flag moved.
   */
  async takePrimaryFromPrevious(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    organizationId: string,
    current: SubscriptionRecord,
  ): Promise<boolean> {
    if (current.renewedFromId === null) return false;
    const previous = await this.subscriptions.find(current.renewedFromId, tx);
    if (!previous?.isPrimaryForPlan) return false;
    await this.releasePrimary(tx, actor, organizationId, previous.id);

    return true;
  }

  /**
   * Buys one more seat on the subscription, in the transaction of the caller, which holds the subscription `FOR UPDATE` (a grant that finds
   * the pool empty, or a K1 grant that buys its own seat): `purchased_quantity` rises by one, on a term bought by the year too, with an
   * audit event. No gate of a Cost Center is asked: the request that takes the seat is charged to the department of its beneficiary
   * (`QĐ-103d`(2)). Throws PoolSeatNotAddableError.
   */
  async addSeat(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    subscriptionId: string,
    requestId: string | null = null,
  ): Promise<number> {
    const current = await this.subscriptions.find(subscriptionId, tx);
    if (!current) throw new PoolSeatNotAddableError('NOT_FOUND');
    if (current.status !== 'ACTIVE') throw new PoolSeatNotAddableError('NOT_ACTIVE');
    const organization = await this.organizationReads.getOrganization(tx);
    if (!organization) throw new Error('A seat was bought before installation');

    const next = (current.purchasedQuantity ?? 0) + 1;
    await this.subscriptions.update(tx, current.id, { ...stateOf(current), purchasedQuantity: next });
    await this.audit.record(
      tx,
      catalogAuditEvent(
        actor,
        organization.id,
        'SUBSCRIPTION.UPDATED',
        'Subscription',
        current.id,
        { purchasedQuantity: current.purchasedQuantity },
        { purchasedQuantity: next, cause: 'SEAT_BOUGHT_WITH_GRANT' },
      ),
    );
    // The IT Admin who answers for a K2 or K4 pool is told of the seat bought for a request (`QĐ-110v`); a K1 purchase tells nobody (`S-4`).
    await this.seatIncrease.told(tx, {
      organizationId: organization.id,
      subscriptionId: current.id,
      planProvisioningType: current.planProvisioningType,
      status: current.status,
      responsibleItAdminEmployeeId: current.responsibleItAdminEmployeeId,
      from: current.purchasedQuantity,
      to: next,
      requestId,
      actor,
    });

    return next;
  }

  /** Only an active subscription that no later period continues prices its plan; the flag of the others of the plan is taken off first. */
  private async makePrimary(tx: DbTx, change: PoolChange): Promise<void> {
    const { current, state, actor, organizationId } = change;
    if (state.status !== 'ACTIVE') throw new SubscriptionPrimaryNotEligibleError('NOT_ACTIVE');
    if ((await this.subscriptions.successorsOf([current.id], tx)).has(current.id)) {
      throw new SubscriptionPrimaryNotEligibleError('ALREADY_RENEWED');
    }
    const released = await this.subscriptions.clearPrimaryOfPlan(tx, current.planId, current.id);
    for (const id of released) await this.auditRelease(tx, actor, organizationId, id);
  }

  /** The subscription stops pricing its plan because a later period takes the flag over (a renewal): the flag leaves it with an audit record. */
  async releasePrimary(tx: DbTx, actor: AuthenticatedPrincipal, organizationId: string, id: string): Promise<void> {
    await this.subscriptions.clearPrimary(tx, id);
    await this.auditRelease(tx, actor, organizationId, id);
  }

  private auditRelease(tx: DbTx, actor: AuthenticatedPrincipal, organizationId: string, id: string): Promise<void> {
    return this.audit.record(
      tx,
      catalogAuditEvent(
        actor,
        organizationId,
        'SUBSCRIPTION.UPDATED',
        'Subscription',
        id,
        { isPrimaryForPlan: true },
        { isPrimaryForPlan: false },
      ),
    );
  }

  /** Whether the person works, holds the IT Admin role and can sign in. */
  async isUsableItAdmin(employeeId: string, tx?: DbTx): Promise<boolean> {
    const usable = await this.identity.findUsableItAdminEmployeeIds([employeeId], tx);
    const employee = usable.has(employeeId) ? await this.organizationReads.getEmployee(employeeId, tx) : null;

    return employee?.status === 'ACTIVE' && employee.workState === 'WORKING';
  }

  /** Throws SubscriptionResponsibleNotItAdminError unless the person works, holds the IT Admin role and can sign in. */
  async requireItAdmin(employeeId: string, tx?: DbTx): Promise<void> {
    if (!(await this.isUsableItAdmin(employeeId, tx))) throw new SubscriptionResponsibleNotItAdminError();
  }
}
