import { Injectable } from '@nestjs/common';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import type { RuleSeat } from '../../licensing/public/licensing-ghost-seat.types';
import { GhostSeatRepo } from '../ghost-seat/ghost-seat.repo';
import { GhostSeatService } from '../ghost-seat/ghost-seat.service';
import { UNDECIDED_STATES } from '../ghost-seat/ghost-seat-state.policy';
import type { GhostSeatRecord, GhostSeatTier, NewGhostSeat } from '../ghost-seat/ghost-seat.types';
import { confidenceFactsOf, confidenceOf, type ConfidenceResult } from './confidence.policy';
import { potentialSavingOf } from './potential-saving.policy';
import {
  assessUsage,
  coveredRanges,
  daysAfter,
  daysOfChain,
  lowerThresholdOf,
  personEvidenceOf,
  type PersonEvidence,
  type UsageAssessment,
} from './usage-assessment.policy';
import { snapshotOf } from './usage-evidence-snapshot.policy';
import {
  coverageGateOf,
  evidenceGateOf,
  gateSkip,
  seatGateOf,
  type GateSkip,
  type SeatStatus,
} from './usage-gates.policy';
import { UsageNegationService } from './usage-negation.service';
import { UsageRulesRepo } from './usage-rules.repo';
import type { LeaveSpan, UsageApplicationContext, UsageRunContext } from './usage-rules.types';

const SYSTEM = { kind: 'SYSTEM' } as const;
/** The gates that look at the seat before anything that may deny a recommendation about it (`FR-4.9` gates 2-4). */
const EARLY_GATES: ReadonlySet<string> = new Set([
  'SERVICE_ACCOUNT',
  'LEAVE_OR_HANDOVER',
  'NOT_USABLE',
  'NEW_ASSIGNMENT',
]);
const RANK: Record<GhostSeatTier, number> = { MONITOR: 1, REVIEW: 2, ACTION: 3 };

interface SeatOutcome {
  skip: GateSkip | null;
  status: SeatStatus;
}

/** Everything the judgement of one seat reads, put together once. */
interface SeatCase {
  tx: DbTx;
  run: UsageRunContext;
  app: UsageApplicationContext;
  seat: RuleSeat;
  gate: GateSkip | null;
  usableOn: string | null;
  leaves: readonly LeaveSpan[];
}

/** What the days of a seat that passed every gate came to. */
interface Finding {
  assessment: UsageAssessment;
  tier: GhostSeatTier;
  group: 'G3' | 'G4';
  confidence: ConfidenceResult;
  person: PersonEvidence;
}

/**
 * One seat of the weekly pass of `G3`/`G4` (`FR-4.9`, `FR-4.10`-`FR-4.14`; `US-10-02`, `US-10-03`, `US-10-04`): the gates in their order, what a day of
 * activity does to a recommendation that exists, the sources, the identity, the coverage, the days and the tier, then the recommendation itself.
 * Every seat leaves one state for the board and, when a gate left it out, one reason. A seat is judged in a transaction of its own.
 */
@Injectable()
export class UsageRulesSeatService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly repo: GhostSeatRepo,
    private readonly ghostSeats: GhostSeatService,
    private readonly rules: UsageRulesRepo,
    private readonly negation: UsageNegationService,
  ) {}

  async assess(run: UsageRunContext, app: UsageApplicationContext, seat: RuleSeat): Promise<void> {
    const leaves = app.leaves.get(seat.employeeId) ?? [];
    const usableOn = app.usableOn.get(seat.chainRootId) ?? null;
    const gate = seatGateOf({
      kind: seat.kind,
      today: run.today,
      handingOver: run.handingOver.has(seat.employeeId),
      onLongLeave: leaves.some(
        (leave) => leave.startedOn <= run.today && (leave.endedOn === null || leave.endedOn > run.today),
      ),
      usableOn,
      graceDays: run.graceDays,
      expectedEndDate: seat.expectedEndDate,
      exemptUntil: run.exemptions.get(seat.chainRootId) ?? null,
      liveRevocation: seat.liveRevocation !== null,
    });
    const outcome = await this.runner.run((tx) => this.judge({ tx, run, app, seat, gate, usableOn, leaves }));
    if (outcome.skip) {
      run.tally.skip({
        subjectType: 'ASSIGNMENT',
        subjectId: seat.assignmentId,
        gate: outcome.skip.gate,
        detail: outcome.skip.detail,
      });
    }
  }

  private async judge(c: SeatCase): Promise<SeatOutcome> {
    if (c.gate && EARLY_GATES.has(c.gate.gate)) return this.record(c, c.gate, c.gate.status, null);
    const person = personEvidenceOf(c.app.evidence.sources, c.seat.employeeId);
    const days = c.usableOn ? daysOfChain(person.activeDates, c.usableOn) : [];
    const existing = await this.settleExisting(c, days);
    if (c.gate) return this.record(c, c.gate, c.gate.status, null);
    if (!c.usableOn) return this.record(c, null, 'EXCLUDED', null);
    const blocked = evidenceGateOf(c.app.verdict, {
      employeeId: c.seat.employeeId,
      appeared: person.appeared,
      unmatched: c.app.evidence.unmatchedIdentities,
    });
    if (blocked) return this.record(c, blocked, blocked.status, null);
    const finding = this.assessSeat(c, person, days);
    if ('skip' in finding) return this.record(c, finding.skip, finding.skip.status, null);
    const open = await this.record(c, null, finding.assessment.tier ? 'INACTIVE' : 'ACTIVE', finding.assessment);
    if (!finding.assessment.tier) return open;

    return existing ? this.keepExisting(c, existing, finding, open) : this.create(c, finding, open);
  }

  /** The recommendation the chain already has: denied by a day of activity, closed because the right is ending, flagged after a decided reclaim, or left as it is. */
  private async settleExisting(c: SeatCase, days: readonly string[]): Promise<GhostSeatRecord | null> {
    const listed = c.run.existing.get(c.seat.chainRootId);
    const existing = listed ? await this.repo.lock(c.tx, listed.id) : null;
    if (!existing || existing.state === 'CLOSED') return null;
    if (c.gate?.gate === 'TIME_BOUND_ENDING' && UNDECIDED_STATES.includes(existing.state)) {
      await this.ghostSeats.close(c.tx, existing, 'LEFT_TO_EXPIRE', SYSTEM, c.run.now);
      c.run.tally.closed();

      return null;
    }
    const reaction = await this.negation.react(c.tx, existing, days, c.run.now);
    if (reaction === 'NEGATED') {
      c.run.tally.closed();

      return null;
    }
    if (reaction === 'FLAGGED') c.run.tally.updated();

    return existing;
  }

  /** The coverage gate, then the days, the tier and the confidence; a gate that leaves the seat out comes back as `{ skip }`. */
  private assessSeat(c: SeatCase, person: PersonEvidence, days: readonly string[]): Finding | { skip: GateSkip } {
    const usableOn = c.usableOn!;
    const verdict = c.app.verdict;
    if (verdict.kind !== 'USABLE') throw new Error('the verdict of the sources was not usable');
    const leaveSpans = c.leaves.map((leave) => ({ from: leave.startedOn, until: leave.endedOn }));
    const ranges = coveredRanges({
      windows: verdict.sources.flatMap((source) => source.windows),
      usableOn,
      today: c.run.today,
      leaves: leaveSpans,
    });
    const coverage = coverageGateOf(daysAfter(ranges, null), c.app.thresholds.review);
    if (coverage) return { skip: coverage };
    const assessment = assessUsage({
      activeDates: days,
      appeared: person.appeared,
      ranges,
      thresholds: c.app.thresholds,
    });
    const tier = assessment.tier ?? 'MONITOR';
    const group = assessment.status === 'NEVER_ACTIVE' ? 'G3' : 'G4';
    const considered = daysAfter(
      coveredRanges({
        windows: [{ from: usableOn, to: c.run.today }],
        usableOn,
        today: c.run.today,
        leaves: leaveSpans,
      }),
      null,
    );
    const confidence = confidenceOf(
      confidenceFactsOf({
        person,
        usedSources: verdict.sources,
        unmatchedLastActivity: c.app.evidence.unmatchedIdentities.map((identity) => identity.lastActivityDate),
        lastActiveDate: assessment.lastActiveDate,
        coverageDays: assessment.coverageDays,
        daysConsidered: considered,
        daysOverLowerThreshold:
          group === 'G3' ? null : (assessment.inactiveDays ?? 0) - lowerThresholdOf(tier, c.app.thresholds),
      }),
    );

    return { assessment, tier, group, confidence, person };
  }

  /** The seat already has a recommendation: a watch that rose a tier is read again before it reaches a head; either way the seat is left out as `OPEN_RECOMMENDATION`. */
  private async keepExisting(
    c: SeatCase,
    existing: GhostSeatRecord,
    finding: Finding,
    open: SeatOutcome,
  ): Promise<SeatOutcome> {
    if (existing.tier === 'MONITOR' && existing.state === 'OPEN' && RANK[finding.tier] > RANK.MONITOR) {
      await this.ghostSeats.reassess(
        c.tx,
        existing,
        {
          tier: finding.tier,
          evidence: await this.evidenceOf(c, finding, null),
          confidence: finding.confidence.level,
          inactiveDays: finding.assessment.inactiveDays,
          lastActiveDate: finding.assessment.lastActiveDate,
        },
        SYSTEM,
      );
      c.run.tally.updated();
    }

    return {
      skip: gateSkip('OPEN_RECOMMENDATION', {
        reason: 'the seat already has a recommendation',
        recommendationId: existing.id,
      }),
      status: open.status,
    };
  }

  private async create(c: SeatCase, finding: Finding, open: SeatOutcome): Promise<SeatOutcome> {
    const { run, seat } = c;
    const previous = run.previous.get(seat.chainRootId) ?? null;
    const transfer = run.transfers.get(seat.employeeId);
    const input: NewGhostSeat = {
      organizationId: run.organizationId,
      group: finding.group,
      state: transfer ? 'PAUSED' : 'OPEN',
      tier: finding.tier,
      applicationId: seat.applicationId,
      planId: seat.planId,
      subscriptionId: seat.subscriptionId,
      assignmentId: seat.assignmentId,
      seatChainId: seat.chainRootId,
      employeeId: seat.employeeId,
      departmentId: seat.owningDepartmentId,
      freeSeats: null,
      countsTowardVacantCost: null,
      revocationTaskId: null,
      evidence: await this.evidenceOf(c, finding, previous),
      createdRunId: run.tally.run.id,
      usage: {
        confidence: finding.confidence.level,
        activityStatus: finding.group === 'G3' ? 'NEVER_ACTIVE' : 'INACTIVE',
        inactiveDays: finding.assessment.inactiveDays,
        lastActiveDate: finding.assessment.lastActiveDate,
        previousRecommendationId: previous?.id ?? null,
      },
      ...(transfer ? { pause: { at: run.now, transferId: transfer.transferId } } : {}),
    };
    await this.ghostSeats.create(c.tx, input, SYSTEM);
    run.tally.created();

    return open;
  }

  private async evidenceOf(
    c: SeatCase,
    finding: Finding,
    previous: { id: string; closeReason: 'KEPT' | 'EXEMPTED'; closedOn: string } | null,
  ) {
    return snapshotOf({
      group: finding.group,
      employeeId: c.seat.employeeId,
      planId: c.seat.planId,
      sources: c.app.evidence.sources,
      matchMethod: finding.person.weakestMethod,
      assessment: finding.assessment,
      thresholds: c.app.thresholds,
      confidence: finding.confidence,
      expectedEndDate: c.seat.expectedEndDate,
      potentialSaving: potentialSavingOf({
        provisioningType: c.seat.provisioningType,
        price: await c.app.price(c.seat.planId),
      }),
      previousDecision: previous
        ? { recommendationId: previous.id, closeReason: previous.closeReason, closedOn: previous.closedOn }
        : null,
    });
  }

  /** Writes the state of the seat for the board (`FR-5.10`) and gives back what the pass found. */
  private async record(
    c: SeatCase,
    skip: GateSkip | null,
    status: SeatStatus,
    assessment: UsageAssessment | null,
  ): Promise<SeatOutcome> {
    await this.rules.saveSeatState(c.tx, {
      seatChainId: c.seat.chainRootId,
      organizationId: c.run.organizationId,
      applicationId: c.seat.applicationId,
      assignmentId: c.seat.assignmentId,
      employeeId: c.seat.employeeId,
      status,
      lastActiveDate: assessment?.lastActiveDate ?? null,
      inactiveDays: assessment && assessment.status !== 'NEVER_ACTIVE' ? assessment.inactiveDays : null,
      gate: skip?.gate ?? null,
      assessedRunId: c.run.tally.run.id,
      assessedOn: c.run.today,
    });

    return { skip, status };
  }
}
