import { Injectable } from '@nestjs/common';
import { addDays, type BusinessDate } from '../../../../core/business-date';
import { TransactionRunner, type DbTx } from '../../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../../audit/public/audit.api';
import { SubscriptionPeriodApi } from '../../../catalog/public/subscription-period.api';
import { SubscriptionPeriodRefusedError } from '../../../catalog/public/subscription-period.errors';
import type {
  NextPeriodInput,
  PeriodAuditActor,
  RenewalPeriodFacts,
} from '../../../catalog/public/subscription-period.types';
import type { AuditValue } from '../../../audit/public/audit.types';
import { OrganizationReadApi } from '../../../organization/public/organization-read.api';
import { carriedPast, seatsToCarry } from '../../assignment/assignment.policy';
import { AssignmentService } from '../../assignment/assignment.service';
import { licensingAuditEvent } from '../../licensing-audit-event.mapper';
import { isSystemActor, type SystemActor } from '../../public/licensing.types';
import { RenewalError } from '../subscription-renewal.errors';
import { RenewalPartiesService } from '../subscription-renewal-parties.service';
import { SubscriptionRenewalSeatRepo } from '../subscription-renewal-seat.repo';
import { SubscriptionRenewalRepo } from '../subscription-renewal.repo';
import type {
  HeldSeat,
  OutcomeWrite,
  RenewalDecisionRecord,
  RenewalOutcomeKind,
  RenewalRecord,
} from '../subscription-renewal.types';
import { checkOutcome, validateOutcomeLineQuantities } from './renewal-outcome.policy';

const SYSTEM_ACTOR_ID = '00000000-0000-0000-0000-000000000000';

export interface RecordOutcomeLineInput {
  subscriptionLineId: string;
  quantity: number;
  monthlyUnitPrice?: { amount: string; currency: string };
}

export interface RecordOutcomeNextPeriodInput extends Omit<
  NextPeriodInput,
  'previousSubscriptionId' | 'lines' | 'purchasedQuantity' | 'unitPrice'
> {
  purchasedQuantity?: number;
  unitPrice?: { amount: string; currency: string };
  lines?: readonly RecordOutcomeLineInput[];
}

export interface RecordOutcomeInput {
  outcome: RenewalOutcomeKind;
  note?: string;
  /** The new period the vendor confirmed, when there is one. */
  nextPeriod?: RecordOutcomeNextPeriodInput;
}

/** The case an outcome is recorded against: the case itself, its decision and its period locked. */
export interface OutcomeCase {
  record: RenewalRecord;
  decision: RenewalDecisionRecord;
  period: RenewalPeriodFacts;
}

/** What only the one-write renewal adds to the core of the outcome (`SBF-20` §4.4 steps 8 and 9). */
export interface OutcomeExtras {
  /**
   * The renewal day: a seat whose last day is this day or before is not carried to the new period (`QĐ-106i`(2), R2-2), since the count of the
   * seats needed leaves it out. Without it the seats held on the first day of the new period are carried, as they always were.
   */
  endingBy?: BusinessDate;
  /** What the audit event of the outcome says besides what it always says. */
  audit?: { [key: string]: AuditValue };
}

/** What recording the outcome did: the case as it stands, the new period when there is one and how many seats went into it. */
export interface RecordedOutcome {
  recorded: RenewalRecord;
  next: RenewalPeriodFacts | null;
  carried: number;
}

/** What the outcome writes: who and when, the follow-up left open unless as decided, and the new period (savings deferred to first invoice confirm). */
function outcomeWriteOf(
  actor: AuthenticatedPrincipal | SystemActor,
  input: RecordOutcomeInput,
  now: Date,
  next: RenewalPeriodFacts | null,
): OutcomeWrite {
  return {
    kind: input.outcome,
    note: input.note?.trim() || null,
    recordedByEmployeeId: isSystemActor(actor) ? SYSTEM_ACTOR_ID : actor.employeeId,
    recordedByAppUserId: isSystemActor(actor) ? SYSTEM_ACTOR_ID : actor.appUserId,
    recordedAt: now,
    vendorFollowUpOpen: input.outcome !== 'AS_DECIDED',
    nextSubscriptionId: next?.subscriptionId ?? null,
    realisedSavings: null,
  };
}

function nextTotalQuantityOf(nextPeriod: RecordOutcomeNextPeriodInput | undefined): number | null {
  if (!nextPeriod) return null;
  if (nextPeriod.lines) return nextPeriod.lines.reduce((sum, item) => sum + item.quantity, 0);

  return nextPeriod.purchasedQuantity ?? null;
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
    private readonly assignments: AssignmentService,
    private readonly periods: SubscriptionPeriodApi,
    private readonly parties: RenewalPartiesService,
    private readonly organizationReads: OrganizationReadApi,
    private readonly audit: AuditApi,
    private readonly runner: TransactionRunner,
  ) {}

  /** Throws RenewalError; nothing is written then. For a case of before the one-write renewal, left `DECIDED` and waiting for its outcome. */
  async record(
    actor: AuthenticatedPrincipal,
    id: string,
    input: RecordOutcomeInput,
    now = new Date(),
  ): Promise<RenewalRecord> {
    return this.runner.run(async (tx) => {
      const found = await this.awaitingOutcome(tx, id);
      const access = await this.parties.recordingAccessOf(actor, found.period, tx);
      if (!access.allowed) throw new RenewalError('NOT_RESPONSIBLE');
      const today = await this.organizationReads.businessToday(now, tx);

      return (await this.recordIn(tx, actor, found, input, { today, now })).recorded;
    });
  }

  /**
   * The core of the outcome, in the transaction of the caller, which holds the case and its period locked: the outcome checked against the
   * decision, a cancellation only once every seat is taken back, the new period chained and the seats carried to it, the outcome written
   * and its audit event. The one-write renewal (`SBF-20` §4.4) calls it with the decision it has just written.
   */
  async recordIn(
    tx: DbTx,
    actor: AuthenticatedPrincipal | SystemActor,
    found: OutcomeCase,
    input: RecordOutcomeInput,
    when: { today: BusinessDate; now: Date },
    extras: OutcomeExtras = {},
  ): Promise<RecordedOutcome> {
    const { record, decision, period } = found;
    await this.assertFits(tx, found, input, when.today);
    await this.closeLinesIfCancelled(tx, decision, period, input.outcome, when.today);
    const next = input.nextPeriod
      ? await this.continueInto(tx, actor, period, input.nextPeriod, extras.endingBy)
      : null;
    const recorded = await this.repo.recordOutcome(
      tx,
      record.id,
      outcomeWriteOf(actor, input, when.now, next?.period ?? null),
    );
    await this.trail(tx, actor, record, recorded, next?.carried ?? 0, extras.audit ?? {});

    return { recorded, next: next?.period ?? null, carried: next?.carried ?? 0 };
  }

  private async closeLinesIfCancelled(
    tx: DbTx,
    decision: RenewalDecisionRecord,
    period: RenewalPeriodFacts,
    outcome: RenewalOutcomeKind,
    today: BusinessDate,
  ): Promise<void> {
    if (decision.choice !== 'CANCEL' || outcome !== 'AS_DECIDED') return;
    const closedOn = period.endDate ?? (period.adjustment ? addDays(period.adjustment.end, -1) : today);
    await this.periods.closeExpiredLines(tx, period.subscriptionId, closedOn);
  }

  /** The audit event of the outcome: what was recorded against what was decided, the seats carried and whether it came late. */
  private async trail(
    tx: DbTx,
    actor: AuthenticatedPrincipal | SystemActor,
    before: RenewalRecord,
    recorded: RenewalRecord,
    carriedSeats: number,
    extra: { [key: string]: AuditValue },
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
          ...extra,
        },
      ),
    );
  }

  /** The outcome fits the decision, and a cancellation as decided finds no seat still held (`MF-4`). */
  private async assertFits(
    tx: DbTx,
    { record, decision, period }: OutcomeCase,
    input: RecordOutcomeInput,
    today: BusinessDate,
  ): Promise<void> {
    const problem = checkOutcome({
      outcome: input.outcome,
      decidedChoice: decision.choice,
      decidedQuantity: decision.quantity,
      purchasedQuantity: period.purchasedQuantity,
      nextQuantity: nextTotalQuantityOf(input.nextPeriod),
    });
    if (problem) throw new RenewalError(problem);
    if (input.nextPeriod) {
      await this.assertLineQuantitiesFit(tx, record.id, input.nextPeriod);
    }
    if (decision.choice === 'CANCEL' && input.outcome === 'AS_DECIDED') {
      await this.assertAllTakenBack(tx, period, today);
    }
  }

  private async assertLineQuantitiesFit(
    tx: DbTx,
    renewalId: string,
    nextPeriod: RecordOutcomeNextPeriodInput,
  ): Promise<void> {
    const targets = await this.repo.lineTargetsOfRenewal(renewalId, tx);
    const proposed = targets.filter((t) => t.recordedQuantity !== null);
    if (proposed.length === 0) return;
    if (!nextPeriod.lines) {
      if (proposed.length > 1) throw new RenewalError('LINES_REQUIRED', { lineCount: proposed.length });

      return;
    }
    const proposedByLine = new Map(proposed.map((t) => [t.subscriptionLineId, t.recordedQuantity!]));
    const mismatches = validateOutcomeLineQuantities(proposedByLine, nextPeriod.lines);
    if (mismatches) throw new RenewalError('QUANTITY_INVALID', { lines: mismatches });
  }

  /**
   * The case locked and waiting for its outcome, with its decision and its period locked as the seats of it are: a revocation that
   * completes meanwhile waits, so the count holds.
   */
  private async awaitingOutcome(tx: DbTx, id: string): Promise<OutcomeCase> {
    const record = await this.repo.lock(tx, id);
    if (!record) throw new RenewalError('NOT_FOUND');
    const decision = record.decision;
    if (record.state !== 'DECIDED' || !decision) throw new RenewalError('NOT_AWAITING_OUTCOME');
    const period = await this.periods.lockPeriod(tx, record.subscriptionId);
    if (!period) throw new RenewalError('NOT_FOUND');

    return { record, decision, period };
  }

  /** A cancellation is carried out only once no seat of the subscription is held any more (`MF-4`: every right taken back first). */
  private async assertAllTakenBack(tx: DbTx, period: RenewalPeriodFacts, today: BusinessDate): Promise<void> {
    const held = await this.seats.notEndedBy(period.subscriptionId, today, tx);
    if (held.length > 0) throw new RenewalError('EXCESS_NOT_REVOKED', { seatsInUse: held.length, quantity: 0 });
  }

  private async assertCarryCapacity(
    tx: DbTx,
    periodId: string,
    carry: readonly HeldSeat[],
    nextPeriod: RecordOutcomeNextPeriodInput,
  ): Promise<void> {
    if (nextPeriod.lines) {
      await this.assertPerLineCarryCapacity(tx, periodId, carry, nextPeriod.lines);
    }
    const totalNextQty = nextTotalQuantityOf(nextPeriod) ?? 0;
    if (carry.length > totalNextQty) {
      throw new RenewalError('EXCESS_NOT_REVOKED', { seatsInUse: carry.length, quantity: totalNextQty });
    }
  }

  private async assertPerLineCarryCapacity(
    tx: DbTx,
    periodId: string,
    carry: readonly HeldSeat[],
    lines: NonNullable<RecordOutcomeNextPeriodInput['lines']>,
  ): Promise<void> {
    const periodLines = await this.periods.linesOfSubscription(periodId, tx);
    const lineToPlan = new Map(periodLines.map((line) => [line.id, line.planId]));
    const qtyByPlan = new Map<string, number>();
    for (const item of lines) {
      const planId = lineToPlan.get(item.subscriptionLineId);
      if (planId) qtyByPlan.set(planId, item.quantity);
    }
    const inUseByPlan = new Map<string, number>();
    for (const seat of carry) {
      if (seat.planId) inUseByPlan.set(seat.planId, (inUseByPlan.get(seat.planId) ?? 0) + 1);
    }
    for (const [planId, seatsInUse] of inUseByPlan) {
      const allowed = qtyByPlan.get(planId) ?? 0;
      if (seatsInUse > allowed) {
        throw new RenewalError('EXCESS_NOT_REVOKED', { seatsInUse, quantity: allowed, planId });
      }
    }
  }

  /**
   * Records the new period and carries to it the seats held on its first day; refused while there are more than it buys. With `endingBy`, the
   * seats whose last day is that day or before stay on the old period (`QĐ-106i`(2)).
   */
  private async continueInto(
    tx: DbTx,
    actor: AuthenticatedPrincipal | SystemActor,
    period: RenewalPeriodFacts,
    nextPeriod: RecordOutcomeNextPeriodInput,
    endingBy?: BusinessDate,
  ): Promise<{ period: RenewalPeriodFacts; carried: number }> {
    const held = seatsToCarry(
      await this.seats.notEndedBy(period.subscriptionId, nextPeriod.startDate, tx),
      nextPeriod.startDate,
    );
    const carry = endingBy === undefined ? held : carriedPast(held, endingBy);
    await this.assertCarryCapacity(tx, period.subscriptionId, carry, nextPeriod);
    const busy = carry.filter((seat) => seat.hasOpenTask).length;
    if (busy > 0) throw new RenewalError('SEATS_HAVE_OPEN_TASKS', { seats: busy });

    const { lines: outcomeLines, ...restNextPeriod } = nextPeriod;
    const mappedLines = outcomeLines?.map((item, idx) => ({
      previousLineId: item.subscriptionLineId,
      quantity: item.quantity,
      ...(item.monthlyUnitPrice
        ? { monthlyUnitPrice: item.monthlyUnitPrice, monthlyUnitPricePath: `nextPeriod.lines.${idx}.monthlyUnitPrice` }
        : {}),
    }));
    const periodActor: PeriodAuditActor = isSystemActor(actor) ? { systemCorrelationId: actor.correlationId } : actor;

    let next: RenewalPeriodFacts;
    try {
      next = await this.periods.recordNextPeriod(tx, periodActor, {
        ...restNextPeriod,
        ...(mappedLines ? { lines: mappedLines } : {}),
        previousSubscriptionId: period.subscriptionId,
        // `nextPeriod` of both routes that record a result: a money error points at the field of their body.
        unitPricePath: 'nextPeriod.unitPrice',
      });
    } catch (error) {
      if (error instanceof SubscriptionPeriodRefusedError)
        throw new RenewalError('PERIOD_REFUSED', { reason: error.reason });
      throw error;
    }
    if (next.status !== 'ACTIVE' && carry.length > 0) throw new RenewalError('PERIOD_REFUSED', { reason: 'DRAFT' });
    const carried = await this.assignments.carry(tx, {
      assignmentIds: carry.map((seat) => seat.assignmentId),
      nextSubscriptionId: next.subscriptionId,
      startDate: nextPeriod.startDate,
      actorAppUserId: isSystemActor(actor) ? SYSTEM_ACTOR_ID : actor.appUserId,
    });

    return { period: next, carried };
  }
}
