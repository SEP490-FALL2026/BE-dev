import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { BusinessDate } from '../../../core/business-date';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { RuleSeat } from '../../licensing/public/licensing-ghost-seat.types';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { PolicyChecklistApi } from '../../policies/public/policy-checklist.api';
import type { ChecklistBody, ChecklistVerdict } from '../../policies/public/policy-checklist.types';
import { GhostSeatDecisionRepo, type GhostSeatChoice } from '../ghost-seat/ghost-seat-decision.repo';
import { GhostSeatRepo } from '../ghost-seat/ghost-seat.repo';
import { GhostSeatService } from '../ghost-seat/ghost-seat.service';
import type { GhostSeatRecord } from '../ghost-seat/ghost-seat.types';
import { DecisionReclaimService } from './decision-reclaim.service';
import { DecisionTransferService } from './decision-transfer.service';
import { GhostSeatDecisionRefusedError, type DecisionItemProblem } from './decision.errors';
import { decidableVerdictOf, exemptionProblemOf, isLeftToExpire, isSelfDecided, lockOrderOf } from './decision.policy';

export interface DecisionInput {
  recommendationIds: readonly string[];
  choice: GhostSeatChoice;
  reason: string;
  exemptUntil?: BusinessDate;
  /** The answers to the questions of the step of the policy in force (`QĐ-111ap`): a No leaves the head only the reclaim. */
  checklist: ChecklistBody;
}

/** How one recommendation of a batch ended. */
export interface DecisionOutcome {
  recommendationId: string;
  choice: GhostSeatChoice;
  outcome: 'KEPT' | 'EXEMPTED' | 'RECLAIM_DECIDED' | 'LEFT_TO_EXPIRE';
  revocationTaskId: string | null;
  notBefore: BusinessDate | null;
  selfDecided: boolean;
}

interface Day {
  organizationId: string;
  today: BusinessDate;
  now: Date;
}

/**
 * The head of a department keeps, reclaims or exempts what the system recommends about a seat of their department (`FR-4.12`, `US-10-06`
 * AC-2 to AC-5, AC-8, AC-17, AC-18): one choice and one reason for a batch of up to 50, all or nothing (`Q-94`). The recommendations are
 * locked in ascending id order before licensing is called (`DA6-23`). _Keep_ and _exempt_ close the recommendation; _reclaim_ opens the
 * revocation through the gate of licensing with the grace of the decision, unless the right ends within a month, then it is left to end.
 * Multi-seat reclaims follow the standard lock order (`docs/rules/database-business.md`): processed by `(subscriptionId, assignmentId, id)`
 * while preserving the input `ids` order in returned outcomes.
 */
@Injectable()
export class DecisionService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly repo: GhostSeatRepo,
    private readonly decisions: GhostSeatDecisionRepo,
    private readonly ghostSeats: GhostSeatService,
    private readonly organizationReads: OrganizationReadApi,
    private readonly transfers: DecisionTransferService,
    private readonly reclaims: DecisionReclaimService,
    private readonly checklists: PolicyChecklistApi,
  ) {}

  /**
   * Throws GhostSeatDecisionRefusedError (nothing saved), the errors of the checklist of the step (a version left behind, answers missing, an
   * answer No for a keep or an exemption) and the errors of the gate of the revocation it maps.
   */
  async decide(
    actor: AuthenticatedPrincipal,
    input: DecisionInput,
    now: Date = new Date(),
  ): Promise<DecisionOutcome[]> {
    const organization = await this.organizationReads.getOrganization();
    const ids = lockOrderOf(input.recommendationIds);
    if (!organization)
      throw new GhostSeatDecisionRefusedError(ids.map((id) => ({ recommendationId: id, code: 'NOT_FOUND' })));
    const today = await this.organizationReads.businessToday(now);
    await this.transfers.pauseIfTransferred(ids, today, now);

    return this.runner.run((tx) =>
      this.decideIn(tx, actor, ids, input, { organizationId: organization.id, today, now }),
    );
  }

  private async decideIn(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    ids: readonly string[],
    input: DecisionInput,
    day: Day,
  ): Promise<DecisionOutcome[]> {
    const records = await this.repo.lockMany(tx, ids);
    const headed = await this.organizationReads.getHeadedDepartment(actor.employeeId, day.today, tx);
    const found = ids.flatMap((id) => records.get(id) ?? []);
    const seats =
      input.choice === 'RECLAIM' ? await this.reclaims.openSeatsOf(tx, day.today, found) : new Map<string, RuleSeat>();
    const problems = this.problemsOf(ids, records, headed?.departmentId ?? null, input, day, seats);
    if (problems.length > 0) throw new GhostSeatDecisionRefusedError(problems);
    const { verdict } = await this.checklists.judge(tx, {
      organizationId: day.organizationId,
      stepCode: '5.4',
      checklist: input.checklist,
      decision: input.choice,
      reason: input.reason,
    });
    const graceDays = input.choice === 'RECLAIM' ? await this.reclaims.graceDays(tx) : 0;
    const batchId = ids.length > 1 ? randomUUID() : null;
    const ordered =
      input.choice === 'RECLAIM'
        ? [...found].sort((a, b) => compareSeatOrder(seats.get(a.id), a.id, seats.get(b.id), b.id))
        : found;
    const byId = new Map<string, DecisionOutcome>();
    for (const record of ordered) {
      byId.set(
        record.id,
        await this.applyOne(
          tx,
          actor,
          record,
          input,
          { ...day, graceDays, batchId, departmentId: headed?.departmentId ?? '' },
          seats.get(record.id),
        ),
      );
    }
    await this.keepChecklist(tx, actor, found, { verdict, choice: input.choice, decidedAt: day.now });

    // Decided in the order of the locks, answered in the order the caller sent the ids (each once).
    return [...new Set(input.recommendationIds)].map((id) => byId.get(id)!);
  }

  /** The answers of the head, kept once for each recommendation decided (one batch answers once). */
  private keepChecklist(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    records: readonly GhostSeatRecord[],
    kept: { verdict: ChecklistVerdict; choice: GhostSeatChoice; decidedAt: Date },
  ): Promise<void> {
    return this.checklists.record(tx, {
      organizationId: records[0].organizationId,
      verdict: kept.verdict,
      decision: kept.choice,
      decidedByEmployeeId: actor.employeeId,
      decidedAt: kept.decidedAt,
      subjects: records.map((record) => ({ kind: 'GHOST_SEAT_RECOMMENDATION' as const, id: record.id })),
    });
  }

  private problemsOf(
    ids: readonly string[],
    records: ReadonlyMap<string, GhostSeatRecord>,
    callerDepartmentId: string | null,
    input: DecisionInput,
    day: Day,
    seats: ReadonlyMap<string, RuleSeat>,
  ): DecisionItemProblem[] {
    const problems: DecisionItemProblem[] = [];
    for (const id of ids) {
      const record = records.get(id);
      if (!record || record.organizationId !== day.organizationId) {
        problems.push({ recommendationId: id, code: 'NOT_FOUND' });
        continue;
      }
      const verdict = decidableVerdictOf({
        state: record.state,
        deciderDepartmentId: record.deciderDepartmentId,
        callerHeadedDepartmentId: callerDepartmentId,
      });
      if (verdict !== 'OK') problems.push({ recommendationId: id, code: verdict });
      else if (input.choice === 'RECLAIM' && !seats.has(id)) {
        problems.push({ recommendationId: id, code: 'SEAT_NOT_REVOCABLE' });
      }
    }
    if (problems.length > 0 || input.choice !== 'EXEMPT') return problems;
    const exemption = exemptionProblemOf(day.today, input.exemptUntil);

    return exemption === null
      ? []
      : ids.map((id) => ({
          recommendationId: id,
          code: exemption === 'REQUIRED' ? ('EXEMPTION_REQUIRED' as const) : ('EXEMPTION_TOO_LONG' as const),
        }));
  }

  private async applyOne(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    record: GhostSeatRecord,
    input: DecisionInput,
    ctx: Day & { graceDays: number; batchId: string | null; departmentId: string },
    seat: RuleSeat | undefined,
  ): Promise<DecisionOutcome> {
    const selfDecided = isSelfDecided(record.employeeId, actor.employeeId);
    const user = { kind: 'USER', principal: actor } as const;
    const base = { recommendationId: record.id, choice: input.choice, selfDecided };
    if (input.choice === 'RECLAIM' && seat && isLeftToExpire(seat.expectedEndDate, ctx.today)) {
      await this.ghostSeats.close(tx, record, 'LEFT_TO_EXPIRE', user, ctx.now);
      await this.ghostSeats.note(tx, record, 'GHOST_SEAT.LEFT_TO_EXPIRE', user, {
        expectedEndDate: seat.expectedEndDate,
        selfDecided,
      });
      await this.reclaims.tellCancelled(tx, record, ctx.organizationId);

      return { ...base, outcome: 'LEFT_TO_EXPIRE', revocationTaskId: null, notBefore: null };
    }
    const decision = await this.decisions.insertDecision(tx, {
      organizationId: ctx.organizationId,
      recommendationId: record.id,
      choice: input.choice,
      reason: input.reason,
      exemptUntil: input.choice === 'EXEMPT' ? (input.exemptUntil ?? null) : null,
      decidedOn: ctx.today,
      decidedByEmployeeId: actor.employeeId,
      decidedByAppUserId: actor.appUserId,
      deciderDepartmentId: ctx.departmentId,
      deciderRoles: actor.roles,
      selfDecided,
      batchId: ctx.batchId,
    });
    const facts = { choice: input.choice, selfDecided, batchId: ctx.batchId, decisionId: decision.id };
    if (input.choice === 'RECLAIM' && seat) return this.reclaimOne(tx, actor, record, input, ctx, seat, facts, base);
    await this.ghostSeats.note(tx, record, 'GHOST_SEAT.DECIDED', user, facts);

    return this.closeOne(tx, actor, record, input, ctx, decision.id, base);
  }

  /** A reclaim: the revocation is opened through licensing with the grace, and the recommendation holds the task. */
  private async reclaimOne(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    record: GhostSeatRecord,
    input: DecisionInput,
    ctx: Day & { graceDays: number },
    seat: RuleSeat,
    facts: { [key: string]: string | boolean | null },
    base: Pick<DecisionOutcome, 'recommendationId' | 'choice' | 'selfDecided'>,
  ): Promise<DecisionOutcome> {
    const opened = await this.reclaims.open(tx, actor, record, seat, {
      reason: input.reason,
      today: ctx.today,
      graceDays: ctx.graceDays,
    });
    await this.ghostSeats.transition(
      tx,
      record,
      'RECLAIM_DECIDED',
      { revocationTaskId: opened.taskId, revocationNotBefore: opened.notBefore },
      'GHOST_SEAT.DECIDED',
      { kind: 'USER', principal: actor },
      { ...facts, revocationNotBefore: opened.notBefore },
    );

    return { ...base, outcome: 'RECLAIM_DECIDED', revocationTaskId: opened.taskId, notBefore: opened.notBefore };
  }

  /** A keep or an exemption closes the recommendation (an exemption also writes what the rules of `G3`/`G4` read). */
  private async closeOne(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    record: GhostSeatRecord,
    input: DecisionInput,
    ctx: Day,
    decisionId: string,
    base: Pick<DecisionOutcome, 'recommendationId' | 'choice' | 'selfDecided'>,
  ): Promise<DecisionOutcome> {
    const exempt = input.choice === 'EXEMPT';
    if (exempt && input.exemptUntil && record.seatChainId) {
      await this.decisions.insertExemption(tx, {
        organizationId: ctx.organizationId,
        seatChainId: record.seatChainId,
        recommendationId: record.id,
        decisionId,
        exemptUntil: input.exemptUntil,
      });
    }
    await this.ghostSeats.close(tx, record, exempt ? 'EXEMPTED' : 'KEPT', { kind: 'USER', principal: actor }, ctx.now);
    await this.reclaims.tellCancelled(tx, record, ctx.organizationId);

    return { ...base, outcome: exempt ? 'EXEMPTED' : 'KEPT', revocationTaskId: null, notBefore: null };
  }
}

function compareText(left: string, right: string): number {
  if (left < right) return -1;

  return left > right ? 1 : 0;
}

function compareSeatOrder(
  leftSeat: RuleSeat | undefined,
  leftId: string,
  rightSeat: RuleSeat | undefined,
  rightId: string,
): number {
  return (
    compareText(leftSeat?.subscriptionId ?? '', rightSeat?.subscriptionId ?? '') ||
    compareText(leftSeat?.assignmentId ?? '', rightSeat?.assignmentId ?? '') ||
    compareText(leftId, rightId)
  );
}
