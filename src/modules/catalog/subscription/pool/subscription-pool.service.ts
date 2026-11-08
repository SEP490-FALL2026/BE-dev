import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import { IdentityAccessApi } from '../../../identity-access/public/identity-access.api';
import { OrganizationReadApi } from '../../../organization/public/organization-read.api';
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
   * Judges a change of a subscription (`QĐ-103e`): the rules of the pool apply to a write that makes a draft active or touches the
   * commitment, the cycle or the person who answers for it; data older than the rules is otherwise left as it is. A write that
   * makes the subscription the one that prices its plan takes the flag off the others of the plan (the caller holds the plan
   * locked `FOR UPDATE`). Throws the errors of `assert` and SubscriptionPrimaryNotEligibleError.
   */
  async judgeChange(
    tx: DbTx,
    change: { plan: LockedPlan; current: SubscriptionRecord; state: SubscriptionState; input: PoolChangeInput },
  ): Promise<void> {
    const { plan, current, state, input } = change;
    const activating = current.status === 'DRAFT' && state.status === 'ACTIVE';
    const touches =
      input.billingCycle !== undefined ||
      input.commitmentTermMonths !== undefined ||
      input.responsibleItAdminEmployeeId !== undefined;
    if (activating || touches) this.assert(plan, current.kind, state, activating);
    if (input.isPrimaryForPlan) await this.makePrimary(tx, current, state);
  }

  /** Only an active subscription that no later period continues prices its plan; the flag of the others of the plan is taken off first. */
  private async makePrimary(tx: DbTx, current: SubscriptionRecord, state: SubscriptionState): Promise<void> {
    if (state.status !== 'ACTIVE') throw new SubscriptionPrimaryNotEligibleError('NOT_ACTIVE');
    if ((await this.subscriptions.successorsOf([current.id], tx)).has(current.id)) {
      throw new SubscriptionPrimaryNotEligibleError('ALREADY_RENEWED');
    }
    await this.subscriptions.clearPrimaryOfPlan(tx, current.planId, current.id);
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
