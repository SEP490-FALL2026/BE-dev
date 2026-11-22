import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { DecisionFollowUpService } from '../decision/decision-follow-up.service';
import { DecisionRoutingService } from '../decision/decision-routing.service';
import type { FollowUpDay } from '../decision/decision.types';
import { PolicyChecklistApi } from '../../policies/public/policy-checklist.api';
import type { ChecklistBody, ChecklistVerdict } from '../../policies/public/policy-checklist.types';
import { GhostSeatRepo } from '../ghost-seat/ghost-seat.repo';
import { GhostSeatService } from '../ghost-seat/ghost-seat.service';
import type { GhostSeatRecord } from '../ghost-seat/ghost-seat.types';
import { EscalationFactsService } from './escalation-facts.service';
import { GhostSeatEscalationKeyReusedError } from './escalation.errors';
import { escalationVerdictOf } from './escalation.policy';
import { EscalationRepo, type EscalationKey } from './escalation.repo';
import type { EscalationItemResult, EscalationOutcome } from './escalation.types';

const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex');

export interface EscalationInput {
  recommendationIds: readonly string[];
  note?: string | undefined;
  /** The answers to the questions of the step of the policy in force (`QĐ-111ap`): a No refuses the whole batch. */
  checklist: ChecklistBody;
  idempotencyKey: string;
}

/**
 * The IT Admin pushes recommendations of the watch tier to the review tier before the weekly pass would (`QĐ-111ay`, `FR-4.12`): each one that
 * `escalationVerdictOf` lets through gets the tier _review_ and goes to the queue of the head of its holder's department at once (or waits for
 * one), the way the routing of the hour would have put it; the others are named with their reason and nothing is refused for them. One batch is one
 * transaction: the key is taken first (so the same key again answers the same result and never acts twice), the recommendations are locked by id,
 * then licensing and personnel are read. Any IT Admin may push; the audit says whether it was the one in charge.
 * A key that was used before answers the batch it made and judges nothing (the push was judged when it was made); a new batch has its checklist
 * of the step judged before the key is taken (`US-2-O6`): a batch refused for an answer No holds no key, the watch stays as it was, and the
 * answers are kept, at the hour of the push, for each recommendation that was pushed. Throws GhostSeatEscalationKeyReusedError and what the checklist
 * refuses (`PolicyVersionChangedError`, `PolicyChecklistIncompleteError`, `PolicyChecklistHasNoError`).
 */
@Injectable()
export class EscalationService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly batches: EscalationRepo,
    private readonly repo: GhostSeatRepo,
    private readonly ghostSeats: GhostSeatService,
    private readonly routing: DecisionRoutingService,
    private readonly followUp: DecisionFollowUpService,
    private readonly facts: EscalationFactsService,
    private readonly checklists: PolicyChecklistApi,
  ) {}

  async escalate(
    actor: AuthenticatedPrincipal,
    input: EscalationInput,
    now: Date = new Date(),
  ): Promise<EscalationOutcome> {
    const day = await this.followUp.dayOf(now);
    if (!day) throw new Error('A batch of early pushes was made before installation');
    const ids = [...new Set(input.recommendationIds)];
    const note = input.note ?? null;
    const key: EscalationKey = {
      organizationId: day.organizationId,
      requestedByAppUserId: actor.appUserId,
      idempotencyKeyHash: sha256(input.idempotencyKey),
    };
    const requestHash = sha256(JSON.stringify({ ids: [...ids].sort(), note }));

    return this.runner.run(async (tx) => {
      // A key that was used before answers the batch it made, whatever the policy says now: the push was judged when it was made.
      if (await this.batches.findByKey(tx, key)) return this.replay(tx, key, requestHash);
      const { verdict } = await this.checklists.judge(tx, {
        organizationId: day.organizationId,
        stepCode: '5.3',
        checklist: input.checklist,
        decision: 'ESCALATE',
      });
      const id = await this.batches.claim(tx, key, { requestHash, note });
      if (id === null) return this.replay(tx, key, requestHash);
      const records = await this.repo.lockMany(tx, ids);
      const results = await this.evaluateItems(tx, actor, day, ids, { records, note, escalationId: id });
      await this.batches.saveResults(tx, id, results);
      await this.keepChecklist(tx, actor, day, { verdict, results, at: now });

      return { id, results, replayed: false };
    });
  }

  private async evaluateItems(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    day: FollowUpDay,
    ids: readonly string[],
    ctx: { records: Map<string, GhostSeatRecord>; note: string | null; escalationId: string },
  ): Promise<EscalationItemResult[]> {
    const batch = await this.facts.ofBatch(tx, day.today, [...ctx.records.values()]);
    const results: EscalationItemResult[] = [];
    const inCharge = new Map<string, { allowed: boolean; byInCharge: boolean }>();
    for (const recommendationId of ids) {
      const record = ctx.records.get(recommendationId) ?? null;
      const facts = this.facts.of(record, batch);
      const preliminary = escalationVerdictOf(facts);
      if (preliminary.kind === 'SKIP' || record === null) {
        results.push({
          recommendationId,
          outcome: 'SKIPPED',
          reason: preliminary.kind === 'SKIP' ? preliminary.reason : 'NOT_FOUND',
        });
        continue;
      }
      const departmentId = batch.placements.get(record.employeeId ?? '') ?? '';
      let access = inCharge.get(departmentId);
      if (!access) {
        access = await this.facts.departmentAccessOf(tx, departmentId, actor.employeeId);
        inCharge.set(departmentId, access);
      }
      const verdict = escalationVerdictOf({ ...facts, inChargeAllowed: access.allowed });
      if (verdict.kind === 'SKIP') {
        results.push({ recommendationId, outcome: 'SKIPPED', reason: verdict.reason });
        continue;
      }
      results.push(
        await this.push(tx, actor, day, record, {
          escalationId: ctx.escalationId,
          departmentId,
          hasNote: ctx.note !== null,
          byInCharge: access.byInCharge,
        }),
      );
    }

    return results;
  }

  /** The answers of the IT Admin, kept once for each recommendation that was pushed; nothing is kept for a batch that pushed none. */
  private async keepChecklist(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    day: FollowUpDay,
    kept: { verdict: ChecklistVerdict; results: readonly EscalationItemResult[]; at: Date },
  ): Promise<void> {
    const subjects = kept.results
      .filter((result) => result.outcome === 'ESCALATED')
      .map((result) => ({ kind: 'GHOST_SEAT_RECOMMENDATION' as const, id: result.recommendationId }));
    if (subjects.length === 0) return;
    await this.checklists.record(tx, {
      organizationId: day.organizationId,
      verdict: kept.verdict,
      decision: 'ESCALATE',
      decidedByEmployeeId: actor.employeeId,
      decidedAt: kept.at,
      subjects,
    });
  }

  /** The key was taken before: its batch answers again if the request is the same one, and is a mistake of the caller if it is not. */
  private async replay(tx: DbTx, key: EscalationKey, requestHash: string): Promise<EscalationOutcome> {
    const recorded = await this.batches.findByKey(tx, key);
    if (!recorded || recorded.requestHash !== requestHash) throw new GhostSeatEscalationKeyReusedError();

    return { id: recorded.id, results: recorded.results, replayed: true };
  }

  private async push(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    day: FollowUpDay,
    record: GhostSeatRecord,
    facts: { escalationId: string; departmentId: string; hasNote: boolean; byInCharge: boolean },
  ): Promise<EscalationItemResult> {
    const raised = await this.ghostSeats.raiseTierEarly(tx, record, { kind: 'USER', principal: actor }, facts);
    const queued = await this.routing.enterQueue(tx, raised, day, {
      departmentId: facts.departmentId,
      returned: false,
    });

    return {
      recommendationId: record.id,
      outcome: 'ESCALATED',
      state: queued.state === 'AWAITING_DECISION' ? 'AWAITING_DECISION' : 'WAITING_FOR_HEAD',
      departmentId: facts.departmentId,
    };
  }
}
