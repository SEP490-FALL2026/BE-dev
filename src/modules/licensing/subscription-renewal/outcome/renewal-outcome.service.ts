import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../../core/business-date';
import { TransactionRunner, type DbTx } from '../../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../../audit/public/audit.api';
import { SubscriptionPeriodApi } from '../../../catalog/public/subscription-period.api';
import { SubscriptionPeriodRefusedError } from '../../../catalog/public/subscription-period.errors';
import type { NextPeriodInput, RenewalPeriodFacts } from '../../../catalog/public/subscription-period.types';
import { OrganizationReadApi } from '../../../organization/public/organization-read.api';
import { licensingAuditEvent } from '../../licensing-audit-event.mapper';
import { RenewalError } from '../subscription-renewal.errors';
import { SubscriptionRenewalSeatRepo } from '../subscription-renewal-seat.repo';
import { SubscriptionRenewalRepo } from '../subscription-renewal.repo';
import type {
  OutcomeWrite,
  RenewalDecisionRecord,
  RenewalOutcomeKind,
  RenewalRecord,
} from '../subscription-renewal.types';
import { checkOutcome, realisedSavingsOf, seatsToCarry } from './renewal-outcome.policy';

export interface RecordOutcomeInput {
  outcome: RenewalOutcomeKind;
  note?: string;
  /** The new period the vendor confirmed, when there is one. */
  nextPeriod?: Omit<NextPeriodInput, 'previousSubscriptionId'>;
}

/** What the outcome writes: who and when, the follow-up left open unless as decided, the new period and the savings it shows. */
function outcomeWriteOf(
  actor: AuthenticatedPrincipal,
  input: RecordOutcomeInput,
  now: Date,
  period: RenewalPeriodFacts,
  next: RenewalPeriodFacts | null,
): OutcomeWrite {
  return {
    kind: input.outcome,
    note: input.note?.trim() || null,
    recordedByEmployeeId: actor.employeeId,
    recordedByAppUserId: actor.appUserId,
    recordedAt: now,
    vendorFollowUpOpen: input.outcome !== 'AS_DECIDED',
    nextSubscriptionId: next?.subscriptionId ?? null,
    realisedSavings: realisedSavingsOf({
      outcome: input.outcome,
      old: { ...period, quantity: period.purchasedQuantity },
      next: next && { ...next, quantity: next.purchasedQuantity },
    }),
  };
}

/**
 * The outcome the IT Admin records once the decision was carried out with the vendor outside the system (`US-11-05` AC-9 → AC-14,
 * `US-11-03`): as decided, or what really happened (the vendor refused, did something else, has not confirmed) with a follow-up
 * with the vendor left open. A new period is recorded only from what the vendor confirmed, chained once to the old one, with the
 * seats held on its first day carried to it in the same transaction — never while more seats are held than it buys (`INV-01`). A
 * cancellation is recorded only once every seat is taken back. Savings are written only for an outcome as decided whose new period
 * costs less (`QĐ-66w`); nothing here creates a budget commitment (`QĐ-62s`).
 */
@Injectable()
export class RenewalOutcomeService {
  constructor(
    private readonly repo: SubscriptionRenewalRepo,
    private readonly seats: SubscriptionRenewalSeatRepo,
    private readonly periods: SubscriptionPeriodApi,
    private readonly organizationReads: OrganizationReadApi,
    private readonly audit: AuditApi,
    private readonly runner: TransactionRunner,
  ) {}

  /** Throws RenewalError; nothing is written then. */
  async record(
    actor: AuthenticatedPrincipal,
    id: string,
    input: RecordOutcomeInput,
    now = new Date(),
  ): Promise<RenewalRecord> {
    return this.runner.run(async (tx) => {
      const { record, decision, period } = await this.awaitingOutcome(tx, id, input);
      const today = await this.organizationReads.businessToday(now, tx);
      if (decision.choice === 'CANCEL' && input.outcome === 'AS_DECIDED')
        await this.assertAllTakenBack(tx, period, today);
      const next = input.nextPeriod ? await this.continueInto(tx, actor, period, input.nextPeriod) : null;
      const recorded = await this.repo.recordOutcome(
        tx,
        id,
        outcomeWriteOf(actor, input, now, period, next?.period ?? null),
      );
      await this.trail(tx, actor, record, recorded, next?.carried ?? 0);

      return recorded;
    });
  }

  /** The audit event of the outcome: what was recorded against what was decided, the seats carried and whether it came late. */
  private async trail(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    before: RenewalRecord,
    recorded: RenewalRecord,
    carriedSeats: number,
  ): Promise<void> {
    const outcome = recorded.outcome;
    await this.audit.record(
      tx,
      licensingAuditEvent(
        actor,
        recorded.organizationId,
        'SUBSCRIPTION_RENEWAL.OUTCOME_RECORDED',
        'SubscriptionRenewal',
        recorded.id,
        null,
        {
          subscriptionId: recorded.subscriptionId,
          outcome: outcome?.kind ?? null,
          decidedChoice: before.decision?.choice ?? null,
          nextSubscriptionId: outcome?.nextSubscriptionId ?? null,
          carriedSeats,
          vendorFollowUpOpen: outcome?.vendorFollowUpOpen ?? false,
          realisedSavingsMinor: outcome?.realisedSavings?.amountMinor.toString() ?? null,
          wasFlaggedLate: before.lateFlaggedAt !== null,
          budgetCommitment: null,
        },
      ),
    );
  }

  /**
   * The case locked and waiting for its outcome, with its decision and its period locked as the seats of it are: a revocation that
   * completes meanwhile waits, so the count holds. The outcome is checked against the decision.
   */
  private async awaitingOutcome(
    tx: DbTx,
    id: string,
    input: RecordOutcomeInput,
  ): Promise<{ record: RenewalRecord; decision: RenewalDecisionRecord; period: RenewalPeriodFacts }> {
    const record = await this.repo.lock(tx, id);
    if (!record) throw new RenewalError('NOT_FOUND');
    const decision = record.decision;
    if (record.state !== 'DECIDED' || !decision) throw new RenewalError('NOT_AWAITING_OUTCOME');
    const period = await this.periods.lockPeriod(tx, record.subscriptionId);
    if (!period) throw new RenewalError('NOT_FOUND');
    const problem = checkOutcome({
      outcome: input.outcome,
      decidedChoice: decision.choice,
      decidedQuantity: decision.quantity,
      purchasedQuantity: period.purchasedQuantity,
      nextQuantity: input.nextPeriod?.purchasedQuantity ?? null,
    });
    if (problem) throw new RenewalError(problem);

    return { record, decision, period };
  }

  /** A cancellation is carried out only once no seat of the subscription is held any more (`MF-4`: every right taken back first). */
  private async assertAllTakenBack(tx: DbTx, period: RenewalPeriodFacts, today: BusinessDate): Promise<void> {
    const held = await this.seats.notEndedBy(period.subscriptionId, today, tx);
    if (held.length > 0) throw new RenewalError('EXCESS_NOT_REVOKED', { seatsInUse: held.length, quantity: 0 });
  }

  /** Records the new period and carries to it the seats held on its first day; refused while there are more than it buys. */
  private async continueInto(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    period: RenewalPeriodFacts,
    nextPeriod: Omit<NextPeriodInput, 'previousSubscriptionId'>,
  ): Promise<{ period: RenewalPeriodFacts; carried: number }> {
    const carry = seatsToCarry(
      await this.seats.notEndedBy(period.subscriptionId, nextPeriod.startDate, tx),
      nextPeriod.startDate,
    );
    if (carry.length > nextPeriod.purchasedQuantity) {
      throw new RenewalError('EXCESS_NOT_REVOKED', {
        seatsInUse: carry.length,
        quantity: nextPeriod.purchasedQuantity,
      });
    }
    const busy = carry.filter((seat) => seat.hasOpenTask).length;
    if (busy > 0) throw new RenewalError('SEATS_HAVE_OPEN_TASKS', { seats: busy });

    let next: RenewalPeriodFacts;
    try {
      next = await this.periods.recordNextPeriod(tx, actor, {
        ...nextPeriod,
        previousSubscriptionId: period.subscriptionId,
      });
    } catch (error) {
      if (error instanceof SubscriptionPeriodRefusedError)
        throw new RenewalError('PERIOD_REFUSED', { reason: error.reason });
      throw error;
    }
    if (next.status !== 'ACTIVE' && carry.length > 0) throw new RenewalError('PERIOD_REFUSED', { reason: 'DRAFT' });
    const carried = await this.seats.carry(tx, {
      assignmentIds: carry.map((seat) => seat.assignmentId),
      nextSubscriptionId: next.subscriptionId,
      startDate: nextPeriod.startDate,
      actorAppUserId: actor.appUserId,
    });

    return { period: next, carried };
  }
}
