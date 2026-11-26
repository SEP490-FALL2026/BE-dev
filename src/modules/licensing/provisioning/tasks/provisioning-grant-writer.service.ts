import { Injectable } from '@nestjs/common';
import { termRunOf } from '../../../../core/term-limit';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import { CatalogApi } from '../../../catalog/public/catalog.api';
import type { SeatTarget } from '../../../catalog/public/catalog.types';
import { SeatLedgerApi } from '../../../catalog/public/seat-ledger.api';
import { AssignmentService } from '../../assignment/assignment.service';
import {
  AssignmentConflictError,
  GrantRequestRefusedError,
  ProvisioningPlanBoundToDeviceError,
  ProvisioningSubscriptionError,
  SeatQuantityUnknownError,
  SeatTargetNotFoundError,
} from '../../public/licensing.errors';
import { GrantRequestGateHook } from '../../public/licensing.extension-points';
import type { GrantRequestAnswer } from '../../public/licensing.types';
import type { PoolStock } from '../../shared-pool/shared-pool.policy';
import { SharedPoolService } from '../../shared-pool/shared-pool.service';
import type { ProvisioningTaskRecord } from '../provisioning-task.types';
import type { GrantInput, ProvisioningGrantPlanner } from './provisioning-grant-planner.service';
import { ProvisioningGrantTaskService } from './provisioning-grant-task.service';
import { claimMatchesAnswer, memberGrantEffectiveOn } from './provisioning-grant.policy';
import { ProvisioningHolderService } from './provisioning-holder.service';
import { ProvisioningReplacementService } from './provisioning-replacement.service';

type Planned = Awaited<ReturnType<ProvisioningGrantPlanner['plan']>>;

/**
 * Writes the grant of the seat of a request in its own transaction following the standard lock order in
 * `docs/rules/database-business.md` (`employee` -> `revocation task` -> `request` -> `subscription` -> `line` -> `plan` -> `assignment`):
 * for a personal seat the beneficiary employee is held `FOR SHARE` first, then any live revocation task on the replaced
 * assignment is locked `FOR UPDATE`, then the request is locked and claimed, the seat target is locked, any replaced right
 * is ended, the holder and assignment are written, and the manual task is inserted and claimed for the IT Admin.
 */
@Injectable()
export class ProvisioningGrantWriter {
  constructor(
    private readonly grantTasks: ProvisioningGrantTaskService,
    private readonly holders: ProvisioningHolderService,
    private readonly assignments: AssignmentService,
    private readonly catalog: CatalogApi,
    private readonly gate: GrantRequestGateHook,
    private readonly sharedPool: SharedPoolService,
    private readonly replacements: ProvisioningReplacementService,
    private readonly seatLedger: SeatLedgerApi,
  ) {}

  async write(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    input: GrantInput,
    planned: Planned,
  ): Promise<ProvisioningTaskRecord> {
    const { answer, plan, organization, today, inCharge, maxAttempts } = planned;
    const { bySubstitute, lockedRevocation } = await this.lockAndAuthorize(tx, actor, answer);
    const claimed = await this.claimGrantableRequest(tx, input, answer, plan);
    const subscriptionId = await this.subscriptionOf(
      tx,
      plan,
      input.subscriptionId,
      today,
      input.requestId,
      input.purchase !== undefined,
    );
    await this.requireGrantable(tx, plan, input.subscriptionId, today);
    const target = await this.lockTarget(tx, plan, subscriptionId, today);
    const replaced = await this.replacements.endReplacedRight(tx, actor, {
      claimed,
      target,
      requestId: input.requestId,
      today,
      organizationId: organization.id,
      lockedRevocation,
    });
    const purchase = await this.reserveSeat(tx, actor, {
      plan,
      target,
      requested: input.purchase,
      today,
      carriesOn: replaced !== null,
      requestId: input.requestId,
      beneficiaryEmployeeId: claimed.employeeId,
    });
    const { holder, assignment } = await this.createGrantAssignment(tx, actor, {
      input,
      planned,
      claimed,
      target,
      replaced,
    });

    return this.claimInsertedTask(tx, actor, {
      organizationId: organization.id,
      assignmentId: assignment.id,
      requestId: input.requestId,
      defaultResponsibleEmployeeId: inCharge?.itAdminEmployeeId ?? null,
      maxAttempts,
      provisioningType: plan.provisioningType,
      purchase,
      carriesOn: replaced !== null,
      selfExecuted: holder.selfExecuted,
      bySubstitute,
    });
  }

  private async claimGrantableRequest(tx: DbTx, input: GrantInput, answer: Planned['answer'], plan: Planned['plan']) {
    // The request is locked and moved to "being carried out" here, in the transaction of the grant: a second grant of
    // the same request finds it no longer grantable, and a request that changed since the read above is refused.
    const claimed = await this.gate.get().claimForGrant(tx, input.requestId, input.beneficiaryEmployeeId);
    if (claimed.status !== 'GRANTABLE') throw new GrantRequestRefusedError(claimed.status);
    if (!claimMatchesAnswer(claimed, answer)) throw new GrantRequestRefusedError('NOT_APPROVED');
    if (plan.keyBinding === 'DEVICE_KEY' || plan.keyBinding === 'DEVICE_BUNDLED') {
      throw new ProvisioningPlanBoundToDeviceError();
    }

    return claimed;
  }

  private claimInsertedTask(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    params: Parameters<ProvisioningGrantTaskService['insertAndClaim']>[2],
  ): Promise<ProvisioningTaskRecord> {
    return this.grantTasks.insertAndClaim(tx, actor, params);
  }

  private async createGrantAssignment(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    facts: {
      input: GrantInput;
      planned: Planned;
      claimed: Extract<GrantRequestAnswer, { status: 'GRANTABLE' }>;
      target: SeatTarget;
      replaced: string | null;
    },
  ) {
    const { input, planned, claimed, target, replaced } = facts;
    const { answer, serviceIdentifier, organization, today, holderContractEnd, holderHasTerm } = planned;
    const holder = await this.holderOf(tx, actor, { input, answer, claimed, serviceIdentifier, today });
    const k1Terms = await this.k1GrantFields(
      tx,
      target,
      replaced,
      today,
      this.endOfSeat(claimed, today, { contractEnd: holderContractEnd, hasTerm: holderHasTerm }),
    );
    const assignment = await this.assignments.createFromRequest(tx, actor, {
      organizationId: organization.id,
      requestId: input.requestId,
      departmentId: answer.seat === 'SERVICE' ? answer.serviceAccount.departmentId : answer.departmentId,
      target,
      holder,
      effectiveFrom: today,
      expectedEndDate: k1Terms.expectedEndDate,
      replacesAssignmentId: replaced,
      ...(k1Terms.k1Fields ?? {}),
    });

    return { holder, assignment };
  }

  private async lockAndAuthorize(tx: DbTx, actor: AuthenticatedPrincipal, answer: Planned['answer']) {
    if (answer.seat === 'PERSONAL') {
      await this.holders.lockPersonalEmployee(tx, answer.employeeId);
    }
    const { bySubstitute } = await this.holders.requireActingItAdmin(tx, actor, {
      beneficiaryEmployeeId: answer.employeeId,
      ...(answer.seat === 'SERVICE' ? { departmentId: answer.serviceAccount.departmentId } : {}),
    });
    const lockedRevocation =
      answer.seat === 'PERSONAL' && answer.replacesAssignmentId
        ? await this.replacements.lockLiveRevocation(tx, answer.replacesAssignmentId)
        : null;

    return { bySubstitute, lockedRevocation };
  }

  private async reserveSeat(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    facts: {
      plan: SeatTarget;
      target: SeatTarget;
      requested: GrantInput['purchase'];
      today: string;
      carriesOn: boolean;
      requestId: string;
      beneficiaryEmployeeId: string;
    },
  ) {
    const { plan, target, today, carriesOn } = facts;
    if (plan.provisioningType === 'K2' && target.seatCounting === 'MEMBERS' && target.subscriptionLineId) {
      if (!carriesOn) {
        const future = await this.seatLedger.futureMemberChanges(target.subscriptionLineId, today, tx);
        const effectiveOn = memberGrantEffectiveOn(today, future);
        await this.seatLedger.recordMember(tx, target.subscriptionLineId, 1, effectiveOn, {
          recordedByEmployeeId: actor.employeeId,
          alreadyLocked: true,
        });
      }

      return { purchased: false as const };
    }
    const { decision, stock } = await this.sharedPool.judgePurchase(tx, {
      planId: plan.planId,
      provisioningType: plan.provisioningType,
      today,
      purchase: facts.requested,
      requestId: facts.requestId,
    });
    await this.takeSeat(tx, actor, {
      plan,
      target,
      purchased: decision.purchased,
      stock,
      carriesOn,
      requestId: facts.requestId,
      beneficiaryEmployeeId: facts.beneficiaryEmployeeId,
      today,
    });

    return decision;
  }

  /**
   * The subscription the seat is taken from: the one the IT Admin names, else the one the shared pool of the plan gives (the line
   * with a free seat first, then `lineCreatedAt, subscriptionLineId`). Read before the subscription is locked; the lock that follows holds it for the grant.
   * Throws SeatTargetNotFoundError when the plan has no subscription a seat can be taken from today.
   */
  private async subscriptionOf(
    tx: DbTx,
    plan: SeatTarget,
    named: string | undefined,
    today: string,
    requestId: string,
    hasPurchase: boolean,
  ): Promise<string | undefined> {
    if (plan.provisioningType === 'K1') return undefined;
    if (named !== undefined || plan.provisioningType === 'K5') return named;
    const chosen = await this.sharedPool.chooseLine(tx, {
      planId: plan.planId,
      provisioningType: plan.provisioningType,
      today,
      requestId,
    });
    if (chosen === null) {
      if (plan.provisioningType === 'K4' && hasPurchase) return undefined;
      throw new SeatTargetNotFoundError('SUBSCRIPTION');
    }

    return chosen;
  }

  /**
   * A subscription the IT Admin names must be one a seat can be taken from today: of the plan, active, its period not over
   * and not taken over by a next period that runs, and not recorded as cancelled. Read before the subscription is locked, like the choice of one.
   * Throws ProvisioningSubscriptionError (`NOT_GRANTABLE`).
   */
  private async requireGrantable(tx: DbTx, plan: SeatTarget, named: string | undefined, today: string): Promise<void> {
    if (named === undefined || plan.provisioningType === 'K5' || plan.provisioningType === 'K1') return;
    if (plan.provisioningType === 'K4') return;
    const grantable = await this.sharedPool.grantableOf(tx, plan.planId, today);
    if (grantable.some((subscription) => subscription.subscriptionId === named)) return;
    const target = await this.catalog.findSeatTarget({ subscriptionId: named }, tx);
    if (target !== null && target.planId === plan.planId && target.status === 'ACTIVE') {
      throw new ProvisioningSubscriptionError('NOT_GRANTABLE');
    }
  }

  private async takeSeat(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    facts: {
      plan: SeatTarget;
      target: SeatTarget;
      purchased: boolean;
      stock: PoolStock | null;
      carriesOn: boolean;
      requestId: string;
      beneficiaryEmployeeId: string;
      today: string;
    },
  ): Promise<void> {
    const { plan, target, purchased, stock } = facts;
    if (plan.provisioningType === 'K1') return;
    if (plan.provisioningType === 'K4') {
      this.ensureK4LotCapacity(target, purchased, stock);

      return;
    }
    if (target.subscriptionId === null) return;
    if (purchased) {
      await this.buySubscriptionSeat(tx, actor, target, plan.provisioningType, facts);

      return;
    }
    if (stock !== null && stock.freeBySubscription.get(target.subscriptionId) === 0) {
      throw new AssignmentConflictError('SEAT_CAPACITY', 0, stock.free);
    }
  }

  private ensureK4LotCapacity(target: SeatTarget, purchased: boolean, stock: PoolStock | null): void {
    // K4 capacity lives in license_lots; never increment legacy subscriptions for K4 (P20).
    const targetId = target.licenseLotId ?? target.subscriptionId;
    if (!purchased && targetId !== null && stock !== null && stock.freeBySubscription.get(targetId) === 0) {
      throw new AssignmentConflictError('SEAT_CAPACITY', 0, stock.free);
    }
  }

  private async buySubscriptionSeat(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    target: SeatTarget,
    provisioningType: string,
    facts: { requestId: string; beneficiaryEmployeeId: string; today: string },
  ): Promise<void> {
    if (target.subscriptionId === null) return;
    if (provisioningType === 'K2' && target.subscriptionLineId) {
      const { purchase } = await this.seatLedger.buyForItems(
        tx,
        target.subscriptionLineId,
        [{ requestId: facts.requestId, beneficiaryEmployeeId: facts.beneficiaryEmployeeId }],
        facts.today,
        { actor, alreadyLocked: true, today: facts.today },
      );
      await this.seatLedger.notifySeatsBought(tx, {
        organizationId: purchase.organizationId,
        subscriptionId: target.subscriptionId,
        subscriptionLineId: target.subscriptionLineId,
        seatPurchaseId: purchase.id,
        quantity: purchase.quantity,
        responsibleItAdminEmployeeId: target.responsibleItAdminEmployeeId ?? null,
        actor,
      });

      return;
    }
    await this.catalog.incrementLegacyPoolSeat(tx, actor, target.subscriptionId, facts.requestId);
  }

  private async k1GrantFields(
    tx: DbTx,
    target: SeatTarget,
    replaced: string | null,
    today: string,
    defaultEndDate: string | null,
  ): Promise<{
    expectedEndDate: string | null;
    k1Fields: { personalCommitmentMonths: 1 | 12; billingAnchorOn: string } | null;
  }> {
    if (target.provisioningType !== 'K1') {
      return { expectedEndDate: defaultEndDate, k1Fields: null };
    }
    const replacedTerms =
      replaced !== null && typeof this.replacements.k1TermsOfReplaced === 'function'
        ? await this.replacements.k1TermsOfReplaced(tx, replaced)
        : null;
    if (replacedTerms?.personalCommitmentMonths === 12) {
      return {
        expectedEndDate: replacedTerms.expectedEndDate ?? defaultEndDate,
        k1Fields: {
          personalCommitmentMonths: 12,
          billingAnchorOn: replacedTerms.billingAnchorOn ?? today,
        },
      };
    }

    return {
      expectedEndDate: defaultEndDate,
      k1Fields: {
        personalCommitmentMonths: target.referenceCommitmentMonths ?? 1,
        billingAnchorOn: today,
      },
    };
  }

  /** The person or the service account the seat is for: a service account has the identifier and the responsible person the IT Admin gave. */
  private holderOf(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    facts: {
      input: GrantInput;
      answer: Planned['answer'];
      claimed: Extract<GrantRequestAnswer, { status: 'GRANTABLE' }>;
      serviceIdentifier: string | null;
      today: string;
    },
  ) {
    const { input, answer, claimed, serviceIdentifier, today } = facts;

    return claimed.seat === 'SERVICE' && serviceIdentifier !== null
      ? this.holders.service(tx, actor, {
          requested: { employeeId: claimed.employeeId, account: claimed.serviceAccount },
          named: input.responsibleEmployeeId,
          accountIdentifier: serviceIdentifier,
          today,
        })
      : this.holders.personal(tx, actor, {
          requestId: input.requestId,
          employeeId: answer.employeeId,
          accountIdentifier: input.accountIdentifier,
          today,
        });
  }

  /**
   * The day the seat ends: the day an older request carries, else the end of the months of use the
   * request asked for, counted from today, the day it is granted, and never cut at the end of the calendar year. A person
   * with a term is cut at the end of their contract, whenever that comes first. A right with no months and a service account
   * have no end.
   */
  private endOfSeat(
    claimed: Extract<GrantRequestAnswer, { status: 'GRANTABLE' }>,
    today: string,
    holder: { contractEnd: string | null; hasTerm: boolean },
  ): string | null {
    if (claimed.expectedEndDate !== null) return claimed.expectedEndDate;
    if (!claimed.termBound) return holder.hasTerm ? holder.contractEnd : null;

    return termRunOf({ start: today, months: claimed.termMonths, contractEndDate: holder.contractEnd }).end;
  }

  /** K5: the plan itself; K4: the license lot (`tier 6a` -> `tier 7`), or plan when purchasing a new lot; K1/K2: subscription -> plan. */
  private async lockTarget(
    tx: DbTx,
    plan: SeatTarget,
    subscriptionId: string | undefined,
    servingOn: string,
  ): Promise<SeatTarget> {
    const ref = subscriptionId
      ? plan.provisioningType === 'K4'
        ? { licenseLotId: subscriptionId, planId: plan.planId }
        : { subscriptionId, planId: plan.planId, servingOn }
      : { planId: plan.planId };
    const target = await this.catalog.lockSeatTarget(tx, ref);
    if (!target) throw new SeatTargetNotFoundError(subscriptionId ? 'SUBSCRIPTION' : 'PLAN');
    if (target.planId !== plan.planId) throw new ProvisioningSubscriptionError('PLAN_MISMATCH');
    if (target.keyBinding === 'DEVICE_KEY' || target.keyBinding === 'DEVICE_BUNDLED') {
      throw new ProvisioningPlanBoundToDeviceError();
    }
    this.assignments.assertSeatTargetUsable(target);
    if (target.kind === 'SUBSCRIPTION' && target.purchasedQuantity === null) throw new SeatQuantityUnknownError();

    return target;
  }
}
