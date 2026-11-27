import { Injectable } from '@nestjs/common';
import { TransactionRunner, type DbTx } from '../../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import { SubscriptionPeriodApi } from '../../../catalog/public/subscription-period.api';
import type { PeriodAdjustment, RenewalPeriodFacts } from '../../../catalog/public/subscription-period.types';
import type { BusinessDate } from '../../../../core/business-date';
import { OrganizationReadApi } from '../../../organization/public/organization-read.api';
import {
  isLateAnnualProposal,
  validateProposeLines,
  type LineProposalDecision,
} from '../lines/subscription-renewal-lines.policy';
import { SubscriptionRenewalLinesService } from '../lines/subscription-renewal-lines.service';
import { RenewalOutcomeService, type RecordOutcomeNextPeriodInput } from '../outcome/renewal-outcome.service';
import type { SeatsNeededCounts } from '../seats-needed/renewal-seats-needed.policy';
import { RenewalSeatsNeededService } from '../seats-needed/renewal-seats-needed.service';
import { RenewalError } from '../subscription-renewal.errors';
import { SubscriptionRenewalRepo } from '../subscription-renewal.repo';
import type { RenewalChoice, RenewalOutcomeKind, RenewalRecord } from '../subscription-renewal.types';
import { RenewalRecordTrail, type RecordedBy } from './renewal-record-trail.service';
import {
  countsRefusal,
  decidedCancelOf,
  existingCaseOf,
  nextPeriodProblem,
  nextStartProblem,
  noticeBasisOf,
  pointOf,
  preflightOf,
  type RecordRefusal,
} from './renewal-record.policy';

export interface RecordRenewalInput {
  subscriptionId: string;
  choice?: RenewalChoice;
  /** The seats of the next period; none for a cancellation. Only for single-line periods (`LINES_REQUIRED` when multi-line). */
  proposedQuantity?: number;
  /** Per-line proposed quantities. */
  lines?: readonly { subscriptionLineId: string; quantity: number }[];
  minimumTotalHolderLineId?: string;
  minimumTotalNote?: string;
  /** The evidence of the vendor minimum, when the seats are that minimum above the need. */
  note?: string;
  outcome: RenewalOutcomeKind;
  outcomeNote?: string;
  /** The new period the vendor confirmed, when there is one. */
  nextPeriod?: RecordOutcomeNextPeriodInput;
  /** What closing a subscription asks the IT Admin to confirm (`QĐ-99i`): only with a cancellation. */
  closure?: { dataExported: boolean; adminsTransferred: boolean };
}

/** What the checks of the request found under the lock of the period: its point, choice, and the seats counted. */
interface Checked {
  adjustment: PeriodAdjustment;
  counts: SeatsNeededCounts;
  choice: RenewalChoice;
  quantity: number | null;
  note: string | null;
  lineDecisions: LineProposalDecision[];
}

const textOf = (value: string | undefined): string | null => value?.trim() || null;

const errorOf = (refusal: RecordRefusal): RenewalError => new RenewalError(refusal.problem, refusal.details);

const nextTotalOf = (nextPeriod?: RecordOutcomeNextPeriodInput): number | null => {
  if (!nextPeriod) return null;
  if (nextPeriod.lines) return nextPeriod.lines.reduce((sum, item) => sum + item.quantity, 0);

  return nextPeriod.purchasedQuantity ?? null;
};

/**
 * The result of the adjustment of a subscription of the shared pool, recorded by the IT Admin in one write (`QĐ-103e`, `QĐ-104d`, `QĐ-106i`,
 * `SBF-20` §4.4): the choice the system counts for the next period, the decision — the IT Admin in charge decides alone, no head and no
 * spending approver — and what the vendor did, in ONE transaction under the lock of the period, so the case never waits for anybody. Only
 * the usable IT Admin responsible for the subscription records. Finance is told of the new period; a renewal the vendor made that was not chosen is told to everyone it
 * concerns at once. It creates no budget commitment and opens no revocation.
 */
@Injectable()
export class RenewalRecordService {
  constructor(
    private readonly repo: SubscriptionRenewalRepo,
    private readonly periods: SubscriptionPeriodApi,
    private readonly seatsNeeded: RenewalSeatsNeededService,
    private readonly outcomes: RenewalOutcomeService,
    private readonly organizationReads: OrganizationReadApi,
    private readonly trail: RenewalRecordTrail,
    private readonly runner: TransactionRunner,
    private readonly lines: SubscriptionRenewalLinesService,
  ) {}

  /**
   * Throws RenewalError; nothing is written then.
   */
  async record(actor: AuthenticatedPrincipal, input: RecordRenewalInput, now = new Date()): Promise<RenewalRecord> {
    return this.runner.run(async (tx) => {
      const period = await this.periods.lockPeriod(tx, input.subscriptionId);
      if (!period) throw new RenewalError('NOT_FOUND');
      const who = await this.trail.recordingAccessOf(actor, period, tx);
      if (!who.allowed) throw new RenewalError('NOT_RESPONSIBLE');
      const today = await this.organizationReads.businessToday(now, tx);
      const checked = await this.check(tx, period, input, today);
      const decided = await this.writeCase(tx, actor, period, input, checked, who, { today, now });
      const result = await this.outcomes.recordIn(
        tx,
        actor,
        decided,
        { outcome: input.outcome, note: input.outcomeNote, nextPeriod: input.nextPeriod },
        { today, now },
        {
          endingBy: checked.adjustment.end,
          audit: {
            closure: input.closure ?? null,
            lateRenewal: today > checked.adjustment.end,
            substitute: who.substitute,
            responsibleItAdminEmployeeId: who.responsibleItAdminEmployeeId,
          },
        },
      );
      await this.trail.told(tx, result.recorded, period, checked.adjustment, who, {
        outcome: input.outcome,
        nextQuantity: nextTotalOf(input.nextPeriod),
      });

      return result.recorded;
    });
  }

  /** The refusals of `SBF-20` §4.4 steps 2 to 7, in the order the route answers, under the lock of the period. */
  private async check(
    tx: DbTx,
    period: RenewalPeriodFacts,
    input: RecordRenewalInput,
    today: BusinessDate,
  ): Promise<Checked> {
    const note = textOf(input.note);
    const cases = (await this.repo.ofSubscriptions([period.subscriptionId], tx)).get(period.subscriptionId) ?? [];
    const ending =
      (await this.repo.endingAmong([period.subscriptionId], tx)).has(period.subscriptionId) &&
      decidedCancelOf(cases) === null;
    const computedLines = await this.lines.computeForPeriod(period, today, tx);

    const { adjustment, counts, choice, quantity, lineDecisions } = input.lines
      ? await this.checkLineProposal(tx, period, ending, today, input, note, computedLines)
      : await this.checkLegacyOrSingleProposal(tx, period, ending, today, input, note, computedLines);

    const standing = existingCaseOf(cases, adjustment.deadline);
    if (standing) throw new RenewalError('ALREADY_PROPOSED', { renewalId: standing.id });
    const nextPeriod = nextPeriodProblem({
      choice,
      outcome: input.outcome,
      hasNextPeriod: input.nextPeriod !== undefined,
      commitment: adjustment.commitment,
    });
    if (nextPeriod) throw errorOf(nextPeriod);
    const startRefusal = input.nextPeriod && nextStartProblem(adjustment, input.nextPeriod.startDate);
    if (startRefusal) throw errorOf(startRefusal);

    return { adjustment, counts, choice, quantity, note, lineDecisions };
  }

  private async checkLineProposal(
    tx: DbTx,
    period: RenewalPeriodFacts,
    ending: boolean,
    today: BusinessDate,
    input: RecordRenewalInput,
    note: string | null,
    computedLines: Awaited<ReturnType<SubscriptionRenewalLinesService['computeForPeriod']>>,
  ) {
    const found = pointOf(period, ending);
    if ('refusal' in found) throw errorOf(found.refusal);
    const { adjustment } = found;
    if (today < adjustment.point) {
      throw new RenewalError('BEFORE_ADJUSTMENT_POINT', {
        adjustmentPointOn: adjustment.point,
        deadline: adjustment.deadline,
      });
    }
    const verdict = validateProposeLines({
      targets: computedLines.lines,
      shortfall: computedLines.shortfall,
      adjustment,
      today,
      proposedLines: input.lines!,
      minimumTotalHolderLineId: input.minimumTotalHolderLineId,
      minimumTotalNote: input.minimumTotalNote,
      note,
    });
    if ('refusal' in verdict) throw errorOf(verdict.refusal);
    const { accepted } = verdict;
    if (input.choice === 'CANCEL' && accepted.totalQuantity > 0) throw new RenewalError('QUANTITY_INVALID');

    const counts = await this.readCounts(tx, period, adjustment, today);
    if (accepted.choice === 'CANCEL') {
      const cancelRefusal = countsRefusal(counts, { choice: 'CANCEL', quantity: null, note });
      if (cancelRefusal) throw errorOf(cancelRefusal);
    }

    return {
      adjustment,
      counts,
      choice: input.choice ?? accepted.choice,
      quantity: accepted.quantity,
      lineDecisions: accepted.lineDecisions,
    };
  }

  private async checkLegacyOrSingleProposal(
    tx: DbTx,
    period: RenewalPeriodFacts,
    ending: boolean,
    today: BusinessDate,
    input: RecordRenewalInput,
    note: string | null,
    computedLines: Awaited<ReturnType<SubscriptionRenewalLinesService['computeForPeriod']>>,
  ) {
    const lineCount = computedLines.servingLines.length;
    if (lineCount > 1) throw new RenewalError('LINES_REQUIRED', { lineCount });

    const choice = input.choice ?? 'RENEW';
    const quantity = input.proposedQuantity ?? null;
    const ready = preflightOf({ period, ending, today, choice, quantity });
    if ('refusal' in ready) throw errorOf(ready.refusal);
    const { adjustment } = ready;
    const counts = await this.readCounts(tx, period, adjustment, today);

    const lateSingle = lineCount === 1 && isLateAnnualProposal(adjustment, today);
    if (lateSingle) {
      const line = computedLines.lines[0];
      const given = quantity ?? 0;
      if (given < line.seatsAtDeadline) {
        throw new RenewalError('REDUCTION_AFTER_DEADLINE', {
          lines: [{ subscriptionLineId: line.subscriptionLineId, minimum: line.seatsAtDeadline }],
        });
      }
    } else {
      const refusal = countsRefusal(counts, { choice, quantity, note });
      if (refusal) throw errorOf(refusal);
    }

    const lineDecisions = this.singleLineDecisions(computedLines.servingLines, counts, quantity);

    return { adjustment, counts, choice, quantity, lineDecisions };
  }

  private singleLineDecisions(
    servingLines: readonly { id: string }[],
    counts: SeatsNeededCounts,
    quantity: number | null,
  ): LineProposalDecision[] {
    if (servingLines.length !== 1) return [];

    return [
      {
        subscriptionLineId: servingLines[0].id,
        seatsNeeded: counts.seatsNeeded,
        target: counts.target,
        recordedQuantity: quantity ?? 0,
      },
    ];
  }

  private readCounts(tx: DbTx, period: RenewalPeriodFacts, adjustment: PeriodAdjustment, today: BusinessDate) {
    return this.seatsNeeded.countFor(
      {
        subscriptionId: period.subscriptionId,
        planId: period.planId,
        vendorMinimumSeats: period.vendorMinimumSeats,
        minimumSeatsTotal: period.minimumSeatsTotal ?? null,
        isPrimaryForPlan: period.isPrimaryForPlan,
        renewalOn: adjustment.end,
        today,
      },
      tx,
    );
  }

  /** Writes the case and its decision, the IT Admin in charge deciding alone, and returns what the outcome is recorded against. */
  private async writeCase(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    period: RenewalPeriodFacts,
    input: RecordRenewalInput,
    checked: Checked,
    who: RecordedBy,
    when: { today: BusinessDate; now: Date },
  ): Promise<{ record: RenewalRecord; decision: NonNullable<RenewalRecord['decision']>; period: RenewalPeriodFacts }> {
    const { adjustment, counts, choice, quantity, lineDecisions } = checked;
    const organization = await this.organizationReads.getOrganization(tx);
    if (!organization) throw new Error('A renewal was recorded before installation');
    const proposed = await this.repo.insert(tx, {
      organizationId: organization.id,
      subscriptionId: period.subscriptionId,
      noticeBasis: noticeBasisOf(adjustment.kind, period.notice.source),
      noticeBaseDate: adjustment.deadline,
      proposedChoice: choice,
      proposedQuantity: quantity,
      proposalNote: checked.note,
      seatsNeeded: counts.seatsNeeded,
      proposedByEmployeeId: actor.employeeId,
      proposedByAppUserId: actor.appUserId,
    });
    // The lock of the period serializes two IT Admins; the unique index of the period is the last word all the same.
    if (!proposed) throw new RenewalError('ALREADY_PROPOSED');
    await this.trail.proposed(tx, actor, proposed, counts, who);
    const record = await this.repo.recordDecision(tx, proposed.id, {
      choice,
      quantity,
      reason: null,
      decidedByEmployeeId: actor.employeeId,
      decidedByAppUserId: actor.appUserId,
      deciderRole: 'IT_ADMIN_IN_CHARGE',
      decidedAt: when.now,
      decidedOn: when.today,
      decidedAfterDeadline: when.today > adjustment.deadline,
      executionPoint: 'AS_PLANNED',
      activeSeatsAtDecision: counts.heldPastRenewal,
      snapshot: { source: 'NOT_CONNECTED', takenAt: when.now.toISOString() },
    });
    if (lineDecisions.length > 0) {
      await this.lines.persistProposalTargets(tx, {
        renewalOn: adjustment.end,
        renewalId: proposed.id,
        now: when.now,
        lockedBy: 'IT_ADMIN',
        decisions: lineDecisions,
        autoRecorded: false,
        minimumTotalHolderLineId: input.minimumTotalHolderLineId ?? null,
        minimumTotalNote: textOf(input.minimumTotalNote),
      });
    }
    const decision = record.decision;
    if (!decision) throw new Error('The decision just written is missing');

    return { record, decision, period };
  }
}
