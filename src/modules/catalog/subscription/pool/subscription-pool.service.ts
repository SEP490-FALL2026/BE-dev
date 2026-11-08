import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../../audit/public/audit.api';
import { IdentityAccessApi } from '../../../identity-access/public/identity-access.api';
import { OrganizationReadApi } from '../../../organization/public/organization-read.api';
import { catalogAuditEvent } from '../../catalog-audit-event.mapper';
import type { LockedPlan } from '../../plan/plan-facts.service';
import { SubscriptionPrimaryNotEligibleError, SubscriptionResponsibleNotItAdminError } from '../subscription.errors';
import { assertPoolTerms, assertResponsibleNamed } from './subscription-pool.policy';
import { SubscriptionRepo } from '../subscription.repo';
import type {
  BillingCycle,
  CommitmentTermMonths,
  SubscriptionKind,
  SubscriptionRecord,
  SubscriptionState,
} from '../subscription.types';

/** What an update of a subscription names of the fields the shared pool governs. */
export interface PoolChangeInput {
  billingCycle?: BillingCycle;
  commitmentTermMonths?: CommitmentTermMonths;
  responsibleItAdminEmployeeId?: string;
  isPrimaryForPlan?: boolean;
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
  ) {}

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
    },
    activating: boolean,
  ): void {
    assertPoolTerms({
      kind,
      planProvisioningType: plan.provisioningType,
      billingCycle: state.billingCycle,
      commitmentTermMonths: state.commitmentTermMonths,
      activating,
    });
    assertResponsibleNamed(state.responsibleItAdminEmployeeId, activating);
  }

  /**
   * The rules for a subscription that becomes active with the data it holds (a draft completed): the commitment, the K1 plan and the
   * IT Admin it names, who must still work, hold the role and be able to sign in now, not only when the name was written (R-E03).
   * Throws the errors of `assert` and SubscriptionResponsibleNotItAdminError.
   */
  async assertActivation(
    plan: LockedPlan,
    kind: SubscriptionKind,
    state: {
      billingCycle: BillingCycle | null;
      commitmentTermMonths: CommitmentTermMonths | null;
      responsibleItAdminEmployeeId: string | null;
    },
  ): Promise<void> {
    this.assert(plan, kind, state, true);
    await this.requireItAdmin(state.responsibleItAdminEmployeeId as string);
  }

  /**
   * Judges a change of a subscription (`QĐ-103e`): the rules of the pool apply to a write that makes a draft active or touches the
   * commitment or the cycle; data older than the rules is otherwise left as it is. A write that
   * makes the subscription the one that prices its plan takes the flag off the others of the plan (the caller holds the plan
   * locked `FOR UPDATE`). Throws the errors of `assert` and SubscriptionPrimaryNotEligibleError.
   */
  async judgeChange(tx: DbTx, change: PoolChange): Promise<void> {
    const { plan, current, state, input } = change;
    const activating = current.status === 'DRAFT' && state.status === 'ACTIVE';
    // Changing only the person who answers does not judge a commitment and cycle the write did not touch (F-009).
    const touches = input.billingCycle !== undefined || input.commitmentTermMonths !== undefined;
    if (activating) await this.assertActivation(plan, current.kind, state);
    else if (touches) this.assert(plan, current.kind, state, false);
    if (input.isPrimaryForPlan) await this.makePrimary(tx, change);
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

  /** Throws SubscriptionResponsibleNotItAdminError unless the person works, holds the IT Admin role and can sign in. */
  async requireItAdmin(employeeId: string): Promise<void> {
    const usable = await this.identity.findUsableItAdminEmployeeIds([employeeId]);
    const employee = usable.has(employeeId) ? await this.organizationReads.getEmployee(employeeId) : null;
    if (employee?.status !== 'ACTIVE' || employee.workState !== 'WORKING') {
      throw new SubscriptionResponsibleNotItAdminError();
    }
  }
}
