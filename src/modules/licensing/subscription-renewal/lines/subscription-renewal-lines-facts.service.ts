import { Injectable } from '@nestjs/common';
import { addDays, type BusinessDate } from '../../../../core/business-date';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import { CatalogApi } from '../../../catalog/public/catalog.api';
import { SeatLedgerApi, type SubscriptionLineRecord } from '../../../catalog/public/seat-ledger.api';
import type { RenewalPeriodFacts } from '../../../catalog/public/subscription-period.types';
import { RenewalHoldHook } from '../../public/licensing.extension-points';
import { SharedPoolService } from '../../shared-pool/shared-pool.service';
import type { RenewalLineWire } from '../subscription-renewal.dto';
import { SubscriptionRenewalAutoRepo } from '../subscription-renewal-auto.repo';
import { SubscriptionRenewalSeatRepo } from '../subscription-renewal-seat.repo';
import type { SeatsNeededFacts } from '../subscription-renewal.types';
import { SubscriptionLineTargetRepo } from './subscription-line-target.repo';
import {
  computeLineTargets,
  lineAdjustmentLabelOf,
  shortfallOf,
  type ComputedLineTarget,
  type LineNeedInputs,
  type LineProposalDecision,
} from './subscription-renewal-lines.policy';
import type { LineTargetLockedBy } from './subscription-renewal-lines.types';

export interface ComputedPeriodLineTargets {
  servingLines: SubscriptionLineRecord[];
  lines: ComputedLineTarget[];
  shortfall: number;
}

const minDate = (dates: BusinessDate[]): BusinessDate => dates.reduce((a, b) => (a <= b ? a : b));
const maxDate = (dates: BusinessDate[]): BusinessDate => dates.reduce((a, b) => (a >= b ? a : b));

/**
 * Computes per-line renewal needs/targets and persists `subscription_line_targets` & `subscription_renewals` auto columns
 * cleanly without introducing cycles between `SubscriptionRenewalLinesService` and `SubscriptionRenewalAutoService`.
 */
@Injectable()
export class SubscriptionRenewalLinesFactsService {
  constructor(
    private readonly seatLedger: SeatLedgerApi,
    private readonly seats: SubscriptionRenewalSeatRepo,
    private readonly sharedPool: SharedPoolService,
    private readonly renewalHold: RenewalHoldHook,
    private readonly targets: SubscriptionLineTargetRepo,
    private readonly autoRepo: SubscriptionRenewalAutoRepo,
    private readonly catalog: CatalogApi,
  ) {}

  async lineViewsOf(
    period: RenewalPeriodFacts,
    today: BusinessDate,
  ): Promise<{ lines: RenewalLineWire[]; shortfall: number }> {
    const computed = await this.computeForPeriod(period, today);
    if (computed.lines.length === 0) return { lines: [], shortfall: 0 };

    const planIds = [...new Set(computed.lines.map((line) => line.planId))];
    const plans = await this.catalog.getPlanSummaries(planIds);
    const planNames = new Map(plans.map((plan) => [plan.planId, plan.planName]));

    return {
      lines: computed.lines.map((line) => ({
        subscriptionLineId: line.subscriptionLineId,
        plan: { id: line.planId, name: planNames.get(line.planId) ?? '' },
        seatsToday: line.seatsToday,
        need: line.need,
        target: line.target,
        label: lineAdjustmentLabelOf(period.adjustment, today, line.seatsToday, line.target),
      })),
      shortfall: computed.shortfall,
    };
  }

  targetsOfLines(lineIds: readonly string[], tx?: DbTx) {
    return this.targets.ofLines(lineIds, tx);
  }

  async servingLinesOn(subscriptionId: string, day: BusinessDate, tx?: DbTx): Promise<SubscriptionLineRecord[]> {
    const all = await this.seatLedger.linesOfSubscription(subscriptionId, tx);

    return all.filter((line) => line.closedReason !== 'REMOVED' && (line.closedOn === null || line.closedOn >= day));
  }

  async computeForPeriod(
    period: RenewalPeriodFacts,
    today: BusinessDate,
    tx?: DbTx,
  ): Promise<ComputedPeriodLineTargets> {
    const renewalOn = period.adjustment?.end ?? today;
    const deadline = period.adjustment?.deadline ?? today;
    const refDay = period.adjustment ? addDays(renewalOn, -1) : today;
    const servingLines = await this.servingLinesOn(period.subscriptionId, refDay, tx);
    if (servingLines.length === 0) return { servingLines: [], lines: [], shortfall: 0 };

    const from = minDate([today, deadline, refDay]);
    const until = maxDate([today, deadline, refDay]);
    const lineIds = servingLines.map((line) => line.id);
    const planIds = servingLines.map((line) => line.planId);
    const seatsMap = await this.seatLedger.seatsOnDays(lineIds, from, until, tx);
    const factsByPlan = await this.seats.seatsNeededFactsByPlan(period.subscriptionId, { today, renewalOn }, tx);
    const chosen = await this.sharedPool.chosenLinesOfPlans(planIds, today, tx);

    const hold = this.renewalHold.get();
    const allEndingIds = [...factsByPlan.values()].flatMap((facts) => facts.endingAssignmentIds);
    const waiting = allEndingIds.length === 0 ? new Map() : await hold.pendingRenewalsOf(allEndingIds, tx);
    const awaitingByPlan = await this.readAwaitingForChosenLines(servingLines, chosen, tx);

    const rawInputs = servingLines.map((line) =>
      this.toLineNeedInput(line, {
        period,
        today,
        deadline,
        totalLines: servingLines.length,
        factsByPlan,
        waiting,
        seatsMap,
        chosen,
        awaitingByPlan,
      }),
    );

    const computed = computeLineTargets(rawInputs, period.minimumSeatsTotal ?? null);
    if (!period.adjustment) return { servingLines, ...computed };

    const existingTargets = await this.targets.findMany(lineIds, renewalOn, tx);
    const merged = computed.lines.map((line) => {
      const locked = existingTargets.get(line.subscriptionLineId);
      if (!locked) return line;

      return { ...line, need: locked.seatsNeeded, target: locked.target };
    });

    return {
      servingLines,
      lines: merged,
      shortfall: shortfallOf(
        merged.map((line) => line.target),
        period.minimumSeatsTotal ?? null,
      ),
    };
  }

  /** Locks target snapshot once (`lockedBy`) and optionally records proposal decision + auto metadata. */
  async persistProposalTargets(
    tx: DbTx,
    input: {
      renewalOn: BusinessDate;
      renewalId: string;
      now: Date;
      lockedBy: LineTargetLockedBy;
      decisions: readonly LineProposalDecision[];
      autoRecorded: boolean;
      minimumTotalHolderLineId: string | null;
      minimumTotalNote: string | null;
    },
  ): Promise<void> {
    for (const item of input.decisions) {
      await this.targets.lockOnce(tx, {
        subscriptionLineId: item.subscriptionLineId,
        renewalOn: input.renewalOn,
        seatsNeeded: item.seatsNeeded,
        target: item.target,
        lockedAt: input.now,
        lockedBy: input.lockedBy,
      });
      await this.targets.recordDecision(tx, item.subscriptionLineId, input.renewalOn, {
        recordedQuantity: item.recordedQuantity,
        renewalId: input.renewalId,
      });
    }
    await this.autoRepo.write(tx, input.renewalId, {
      autoRecorded: input.autoRecorded,
      minimumTotalHolderLineId: input.minimumTotalHolderLineId,
      minimumTotalNote: input.minimumTotalNote,
    });
  }

  async lockCutoffTargets(
    tx: DbTx,
    period: RenewalPeriodFacts,
    renewalOn: BusinessDate,
    today: BusinessDate,
    now: Date,
  ): Promise<boolean> {
    const computed = await this.computeForPeriod(period, today, tx);
    let wroteAny = false;
    for (const line of computed.lines) {
      const locked = await this.targets.lockOnce(tx, {
        subscriptionLineId: line.subscriptionLineId,
        renewalOn,
        seatsNeeded: line.need,
        target: line.target,
        lockedAt: now,
        lockedBy: 'SYSTEM',
      });
      if (locked) wroteAny = true;
    }

    return wroteAny;
  }

  private async readAwaitingForChosenLines(
    lines: readonly SubscriptionLineRecord[],
    chosen: ReadonlyMap<string, { subscriptionId: string; subscriptionLineId: string | null }>,
    tx?: DbTx,
  ): Promise<Map<string, number>> {
    const hold = this.renewalHold.get();
    const awaitingByPlan = new Map<string, number>();
    for (const line of lines) {
      if (chosen.get(line.planId)?.subscriptionLineId !== line.id || awaitingByPlan.has(line.planId)) continue;
      awaitingByPlan.set(line.planId, await hold.approvedAwaitingGrantOfPlan(line.planId, tx));
    }

    return awaitingByPlan;
  }

  private toLineNeedInput(
    line: SubscriptionLineRecord,
    ctx: {
      period: RenewalPeriodFacts;
      today: BusinessDate;
      deadline: BusinessDate;
      totalLines: number;
      factsByPlan: ReadonlyMap<string, SeatsNeededFacts>;
      waiting: ReadonlyMap<string, unknown>;
      seatsMap: ReadonlyMap<string, ReadonlyMap<BusinessDate, number | null>>;
      chosen: ReadonlyMap<string, { subscriptionId: string; subscriptionLineId: string | null }>;
      awaitingByPlan: ReadonlyMap<string, number>;
    },
  ): LineNeedInputs {
    const planFacts = ctx.factsByPlan.get(line.planId);
    const ledger = ctx.seatsMap.get(line.id);
    const seatsToday = ledger?.get(ctx.today) ?? ctx.period.purchasedQuantity ?? 0;

    return {
      subscriptionLineId: line.id,
      planId: line.planId,
      seatsToday,
      seatsAtDeadline: ledger?.get(ctx.deadline) ?? seatsToday,
      minimumSeats: fallbackMinimumSeats(line.minimumSeats, ctx.totalLines, ctx.period.vendorMinimumSeats),
      heldPastRenewal: planFacts?.heldPastRenewal ?? 0,
      pendingContinuations: countPendingEnding(planFacts, ctx.waiting),
      approvedAwaitingGrantForLine: awaitingForChosenLine(line, ctx.chosen, ctx.awaitingByPlan),
    };
  }
}

function fallbackMinimumSeats(lineMin: number | null, totalLines: number, periodMin: number | null): number | null {
  return lineMin ?? (totalLines === 1 ? periodMin : null);
}

function countPendingEnding(facts: SeatsNeededFacts | undefined, waiting: ReadonlyMap<string, unknown>): number {
  return facts ? facts.endingAssignmentIds.filter((id) => waiting.has(id)).length : 0;
}

function awaitingForChosenLine(
  line: SubscriptionLineRecord,
  chosen: ReadonlyMap<string, { subscriptionId: string; subscriptionLineId: string | null }>,
  awaitingByPlan: ReadonlyMap<string, number>,
): number {
  return chosen.get(line.planId)?.subscriptionLineId === line.id ? (awaitingByPlan.get(line.planId) ?? 0) : 0;
}
