import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { DecisionFollowUpService } from '../decision/decision-follow-up.service';
import { DecisionRoutingService } from '../decision/decision-routing.service';
import type { FollowUpDay } from '../decision/decision.types';
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
  idempotencyKey: string;
}

/**
 * The IT Admin pushes recommendations of the watch tier to the review tier before the weekly pass would (`QĐ-111ay`, `FR-4.12`): each one that
 * `escalationVerdictOf` lets through gets the tier _review_ and goes to the queue of the head of its holder's department at once (or waits for
 * one), the way the routing of the hour would have put it; the others are named with their reason and nothing is refused for them. One batch is one
 * transaction: the key is taken first (so the same key again answers the same result and never acts twice), the recommendations are locked by id,
 * then licensing and personnel are read. Any IT Admin may push; the audit says whether it was the one in charge.
 * Throws GhostSeatEscalationKeyReusedError.
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
      const id = await this.batches.claim(tx, key, { requestHash, note });
      if (id === null) return this.replay(tx, key, requestHash);
      const records = await this.repo.lockMany(tx, ids);
      const batch = await this.facts.ofBatch(tx, day.today, [...records.values()]);
      const results: EscalationItemResult[] = [];
      const inCharge = new Map<string, boolean>();
      for (const recommendationId of ids) {
        const record = records.get(recommendationId) ?? null;
        const verdict = escalationVerdictOf(this.facts.of(record, batch));
        if (verdict.kind === 'SKIP' || record === null) {
          results.push({
            recommendationId,
            outcome: 'SKIPPED',
            reason: verdict.kind === 'SKIP' ? verdict.reason : 'NOT_FOUND',
          });
          continue;
        }
        const departmentId = batch.placements.get(record.employeeId ?? '') ?? '';
        if (!inCharge.has(departmentId)) {
          inCharge.set(departmentId, await this.facts.isInCharge(tx, departmentId, actor.employeeId));
        }
        results.push(
          await this.push(tx, actor, day, record, {
            escalationId: id,
            departmentId,
            hasNote: note !== null,
            byInCharge: inCharge.get(departmentId) === true,
          }),
        );
      }
      await this.batches.saveResults(tx, id, results);

      return { id, results, replayed: false };
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
