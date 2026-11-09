import { Injectable } from '@nestjs/common';
import { addDays, type BusinessDate } from '../../../../core/business-date';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import { SubscriptionPeriodApi } from '../../../catalog/public/subscription-period.api';
import type { RenewalPeriodFacts } from '../../../catalog/public/subscription-period.types';
import { OrganizationReadApi } from '../../../organization/public/organization-read.api';
import { RevocationService } from '../../provisioning/revocation.service';
import { RenewalFinancialContributions } from '../../public/licensing.extension-points';
import { RenewalPartiesService } from '../subscription-renewal-parties.service';
import { RenewalDecisionTrail } from './renewal-decision-trail.service';
import { RenewalRankingService } from '../subscription-renewal-ranking.service';
import { RenewalError } from '../subscription-renewal.errors';
import { SubscriptionRenewalRepo } from '../subscription-renewal.repo';
import type {
  DecisionSnapshot,
  DeciderRole,
  HeldSeat,
  ReleasedSeat,
  RenewalChoice,
  RenewalRecord,
} from '../subscription-renewal.types';
import { checkDecider, executionPointOf, proposalIsStale, seatsToRelease } from './renewal-decision.policy';

export interface ConfirmRenewalInput {
  reason?: string;
  /** The head saw how many people use the subscription and still cancels it (`US-11-02` AC-2). */
  acknowledgeActiveUsers?: boolean;
}

/**
 * The confirmation of a renewal by the head of the department that owns the subscription (`QĐ-94d`(2), `US-11-05`): the proposal of
 * the IT Admin — renew as it is, reduce, or cancel — becomes the decision as it is, and nothing of it is chosen again here. Only the
 * head of the owner department on the day of the decision confirms, never the IT Admin who proposed it (`SoD-3`); a cancellation
 * while seats are in use is confirmed after the warning; the seats the IT Admin proposed to take back must still be exactly the
 * excess of that day, else the proposal is out of date. The decision is written with the snapshot, its execution point and its audit
 * event, and the revocations it asks for are opened through the one gate of revocations. It writes no budget commitment (`QĐ-62s`),
 * creates no new period and records no savings: that is the outcome's business. It does not wait for a Cost Center: the proposal
 * never raises the quantity (`QĐ-94m`(2)).
 */
@Injectable()
export class RenewalDecisionService {
  constructor(
    private readonly repo: SubscriptionRenewalRepo,
    private readonly periods: SubscriptionPeriodApi,
    private readonly parties: RenewalPartiesService,
    private readonly ranking: RenewalRankingService,
    private readonly revocations: RevocationService,
    private readonly financial: RenewalFinancialContributions,
    private readonly organizationReads: OrganizationReadApi,
    private readonly trail: RenewalDecisionTrail,
  ) {}

  /** Throws RenewalError and the refusals of the revocation gate; nothing is written then. */
  async confirm(
    actor: AuthenticatedPrincipal,
    id: string,
    input: ConfirmRenewalInput,
    now = new Date(),
  ): Promise<RenewalRecord> {
    const today = await this.organizationReads.businessToday(now);
    const current = await this.repo.find(id);
    if (!current) throw new RenewalError('NOT_FOUND');
    const [period] = await this.periods.getPeriods([current.subscriptionId]);
    if (!period) throw new RenewalError('NOT_FOUND');
    // Who may decide is settled before the money is read and before any row is locked: a head of another department finds no such case,
    // and a caller who is not the head of this one is refused (`NOT_DECIDER`) without the snapshot being taken.
    const scope = await this.parties.readScopeOf(actor, today);
    if (scope?.kind === 'DEPARTMENT' && scope.departmentId !== period.ownerDepartmentId) {
      throw new RenewalError('NOT_FOUND');
    }
    this.refuse(await this.deciderProblem(actor, current, period.ownerDepartmentId, today));
    const snapshot = await this.snapshotOf(period, now);

    const result = await this.trail.run(async (tx) => {
      const record = await this.repo.lock(tx, id);
      if (!record) throw new RenewalError('NOT_FOUND');
      const decider = await this.parties.deciderOf(period.ownerDepartmentId, record.proposedByEmployeeId, today, tx);
      this.refuse(await this.deciderProblem(actor, record, period.ownerDepartmentId, today, tx));
      const seats = await this.ranking.seatsOf(period.subscriptionId, today, tx);
      const choice = record.proposedChoice;
      const released = await this.repo.releasedOf(id, tx);
      let toRevoke: string[];
      try {
        toRevoke = this.toRevoke(choice, record, seats.held, released, input);
      } catch (error) {
        if (!(error instanceof RenewalError) || error.problem !== 'PROPOSAL_STALE') throw error;
        // The proposal is a dead end if it only answers 409: it is closed here, in the same transaction, and the IT Admin proposes again.
        await this.repo.closeStale(tx, id);
        await this.trail.closedStale(tx, actor, record, error.details);

        return error;
      }
      const point = executionPointOf({
        decidedOn: today,
        baseDate: record.noticeBaseDate,
        allowsMidTermReduction: period.allowsMidTermReduction,
      });
      const decided = await this.repo.recordDecision(tx, id, {
        choice,
        quantity: record.proposedQuantity,
        reason: input.reason?.trim() || null,
        decidedByEmployeeId: actor.employeeId,
        decidedByAppUserId: actor.appUserId,
        deciderRole: decider.role,
        decidedAt: now,
        decidedOn: today,
        decidedAfterDeadline: point.afterDeadline,
        executionPoint: point.point,
        activeSeatsAtDecision: seats.held.length,
        snapshot,
      });
      await this.openRevocations(tx, actor, decided, decider.role, toRevoke, now);
      await this.trail.told(tx, actor, decided, period, released);

      return decided;
    });
    if (result instanceof RenewalError) throw result;

    return result;
  }

  /** Why this caller may not confirm this case now, or null: the head of the owner department today, never its proposer, and only while it waits. */
  private async deciderProblem(
    actor: AuthenticatedPrincipal,
    record: RenewalRecord,
    ownerDepartmentId: string,
    today: BusinessDate,
    tx?: DbTx,
  ) {
    const decider = await this.parties.deciderOf(ownerDepartmentId, record.proposedByEmployeeId, today, tx);

    return checkDecider({
      actorEmployeeId: actor.employeeId,
      deciderEmployeeId: decider.employeeId,
      proposerEmployeeId: record.proposedByEmployeeId,
      waitingForDecision: record.state === 'PROPOSED',
    });
  }

  private refuse(problem: ReturnType<typeof checkDecider>): void {
    if (problem) throw new RenewalError(problem);
  }

  /**
   * What the confirmation asks to take back: every personal seat of a cancelled subscription (after the warning of the people who
   * still use it), or the seats the IT Admin proposed that are still held, which must be exactly the excess of today.
   */
  private toRevoke(
    choice: RenewalChoice,
    record: RenewalRecord,
    held: readonly HeldSeat[],
    released: readonly ReleasedSeat[],
    input: ConfirmRenewalInput,
  ): string[] {
    if (choice === 'CANCEL') {
      if (held.length > 0 && input.acknowledgeActiveUsers !== true) {
        throw new RenewalError('ACTIVE_USERS_NOT_ACKNOWLEDGED', { seatsInUse: held.length });
      }

      return held.filter((seat) => seat.kind === 'PERSONAL').map((seat) => seat.assignmentId);
    }
    const required = seatsToRelease(choice, record.proposedQuantity, held.length);
    const heldIds = new Set(held.filter((seat) => seat.kind === 'PERSONAL').map((seat) => seat.assignmentId));
    const stillHeld = released.filter((seat) => heldIds.has(seat.assignmentId)).map((seat) => seat.assignmentId);
    if (proposalIsStale({ required, stillHeld: stillHeld.length })) {
      throw new RenewalError('PROPOSAL_STALE', { required, stillHeld: stillHeld.length });
    }

    return stillHeld;
  }

  private async openRevocations(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    decided: RenewalRecord,
    role: DeciderRole,
    assignmentIds: readonly string[],
    now: Date,
  ): Promise<void> {
    const source = decided.decision?.choice === 'CANCEL' ? 'SUBSCRIPTION_CANCELLATION' : 'SUBSCRIPTION_REDUCTION';
    for (const assignmentId of assignmentIds) {
      await this.revocations.open(tx, actor, {
        assignmentId,
        source,
        decision: {
          decidedByEmployeeId: actor.employeeId,
          decidedRole: role,
          referenceKind: 'SUBSCRIPTION_RENEWAL',
          referenceId: decided.id,
        },
        now,
      });
    }
  }

  /** What the head saw of money, frozen now: the reader of the module that owns budgets, or that none is connected. */
  private async snapshotOf(period: RenewalPeriodFacts, now: Date): Promise<DecisionSnapshot> {
    const [reader] = this.financial.all();
    if (!reader) return { source: 'NOT_CONNECTED', takenAt: now.toISOString() };
    const renewalOn: BusinessDate | null = period.renewalDate ?? (period.endDate ? addDays(period.endDate, 1) : null);

    return {
      source: 'CONNECTED',
      financial: await reader.snapshotOf({
        subscriptionId: period.subscriptionId,
        ownerDepartmentId: period.ownerDepartmentId,
        renewalOn,
        purchasedQuantity: period.purchasedQuantity,
        unitPrice: period.unitPrice,
      }),
    };
  }
}
