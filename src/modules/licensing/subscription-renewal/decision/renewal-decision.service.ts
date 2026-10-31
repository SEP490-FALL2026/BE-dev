import { Injectable } from '@nestjs/common';
import { addDays, type BusinessDate } from '../../../../core/business-date';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import { SubscriptionPeriodApi } from '../../../catalog/public/subscription-period.api';
import type { RenewalPeriodFacts } from '../../../catalog/public/subscription-period.types';
import { FinanceSetupIncompleteError } from '../../../organization/public/organization.errors';
import { OrganizationApi } from '../../../organization/public/organization.api';
import { RevocationService } from '../../provisioning/revocation.service';
import { RenewalFinancialContributions } from '../../public/licensing.extension-points';
import { RenewalPartiesService } from '../subscription-renewal-parties.service';
import { RenewalDecisionSupport } from './renewal-decision-support.service';
import { RenewalRankingService } from '../subscription-renewal-ranking.service';
import type { RankedSeat } from '../subscription-renewal-ranking.policy';
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
import {
  checkChoice,
  checkDecider,
  checkRelease,
  executionPointOf,
  needsChargeableOwner,
  seatsToRelease,
} from './renewal-decision.policy';

export interface DecideRenewalInput {
  choice: RenewalChoice;
  quantity?: number;
  reason?: string;
  /** A reduction carried out within the paid period, without renewing (only where the subscription allows it). */
  withinCurrentTerm?: boolean;
  /** The decider saw how many people use the subscription and still cancels it (`US-11-02` AC-2). */
  acknowledgeActiveUsers?: boolean;
  /** The seats in use chosen for revocation when reducing below them (`QĐ-66x`). */
  releasedAssignmentIds?: string[];
}

/**
 * The decision of a renewal by the person who decides spending (`US-11-02`): renew as it is, reduce, or cancel. Only the decider of
 * the case decides, never the IT Admin who proposed it (`SoD-3`); a cancellation while seats are in use is confirmed after the
 * warning; a reduction below the seats in use names the seats to take back, chosen by the decider from the ranked list. The
 * decision is written with the snapshot the decider saw, its execution point, the seats chosen and its audit event, and the
 * revocations it asks for are opened through the one gate of revocations. It writes no budget commitment (`QĐ-62s`), creates no
 * new period and records no savings: that is the outcome's business.
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
    private readonly organization: OrganizationApi,
    private readonly support: RenewalDecisionSupport,
  ) {}

  /** Throws RenewalError, FinanceSetupIncompleteError and the refusals of the revocation gate; nothing is written then. */
  async decide(
    actor: AuthenticatedPrincipal,
    id: string,
    input: DecideRenewalInput,
    now = new Date(),
  ): Promise<RenewalRecord> {
    const today = await this.organization.businessToday(now);
    const current = await this.repo.find(id);
    if (!current) throw new RenewalError('NOT_FOUND');
    const [period] = await this.periods.getPeriods([current.subscriptionId]);
    if (!period) throw new RenewalError('NOT_FOUND');
    const snapshot = await this.snapshotOf(period, now);

    return this.support.run(async (tx) => {
      const record = await this.repo.lock(tx, id);
      if (!record) throw new RenewalError('NOT_FOUND');
      const decider = await this.parties.deciderOf(record.proposedByEmployeeId, tx);
      this.refuse(
        checkDecider({
          actorEmployeeId: actor.employeeId,
          deciderEmployeeId: decider.employeeId,
          proposerEmployeeId: record.proposedByEmployeeId,
          waitingForDecision: record.state === 'PROPOSED',
        }),
      );
      await this.checkInput(tx, period, input);
      const seats = await this.ranking.seatsOf(period.subscriptionId, today, tx);
      const released = this.released(input, seats.held.length, seats.ranked);
      const point = executionPointOf({
        decidedOn: today,
        baseDate: record.noticeBaseDate,
        allowsMidTermReduction: period.allowsMidTermReduction,
        withinCurrentTerm: input.withinCurrentTerm === true,
      });
      const decided = await this.repo.recordDecision(tx, id, {
        choice: input.choice,
        quantity: input.quantity ?? null,
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
      await this.repo.insertReleased(tx, id, released);
      await this.openRevocations(
        tx,
        actor,
        decided,
        decider.role,
        this.toRevoke(input.choice, seats.held, released),
        now,
      );
      await this.support.told(tx, actor, decided, period, released);

      return decided;
    });
  }

  private refuse(problem: ReturnType<typeof checkDecider>): void {
    if (problem) throw new RenewalError(problem);
  }

  /** The choice fits the subscription, and a decision that owes more into a new period has a Cost Center to charge (`QĐ-88a`). */
  private async checkInput(tx: DbTx, period: RenewalPeriodFacts, input: DecideRenewalInput): Promise<void> {
    const withinCurrentTerm = input.withinCurrentTerm === true;
    this.refuse(
      checkChoice({
        choice: input.choice,
        quantity: input.quantity ?? null,
        purchasedQuantity: period.purchasedQuantity,
        withinCurrentTerm,
        allowsMidTermReduction: period.allowsMidTermReduction,
      }),
    );
    if (!needsChargeableOwner({ choice: input.choice, quantity: input.quantity ?? null, withinCurrentTerm })) return;
    const owner = await this.organization.getDepartmentBrief(period.ownerDepartmentId, tx);
    if (!owner?.costCenterActive) throw new FinanceSetupIncompleteError(period.ownerDepartmentId);
  }

  /** The seats chosen for revocation, checked against the ranking; a cancellation in use waits for the decider's confirmation. */
  private released(input: DecideRenewalInput, seatsInUse: number, ranked: readonly RankedSeat[]): ReleasedSeat[] {
    if (input.choice === 'CANCEL' && seatsInUse > 0 && input.acknowledgeActiveUsers !== true) {
      throw new RenewalError('ACTIVE_USERS_NOT_ACKNOWLEDGED', { seatsInUse });
    }
    const required = seatsToRelease(input.choice, input.quantity ?? null, seatsInUse);
    const selected = input.releasedAssignmentIds ?? [];
    const problem = checkRelease({ required, selected, offered: new Set(ranked.map((seat) => seat.assignmentId)) });
    if (problem) throw new RenewalError(problem, { required, selected: selected.length });
    const rankOf = new Map(ranked.map((seat) => [seat.assignmentId, seat]));

    return selected.map((assignmentId) => {
      const seat = rankOf.get(assignmentId) as RankedSeat;

      return { assignmentId, rankGroup: seat.group, position: seat.position };
    });
  }

  /** What the decision asks to take back: every personal seat of a cancelled subscription, or the seats chosen in a reduction. */
  private toRevoke(choice: RenewalChoice, held: readonly HeldSeat[], released: readonly ReleasedSeat[]): string[] {
    if (choice === 'CANCEL') return held.filter((seat) => seat.kind === 'PERSONAL').map((seat) => seat.assignmentId);

    return released.map((seat) => seat.assignmentId);
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

  /** What the decider saw of money, frozen now: the reader of the module that owns budgets, or that none is connected. */
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
