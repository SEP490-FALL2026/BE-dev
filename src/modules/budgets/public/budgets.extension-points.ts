import { Injectable } from '@nestjs/common';
import { Contributions } from '../../../core/extension/contributions';
import { Hook } from '../../../core/extension/hook';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';

// The points the budgets open for the contexts above them (ADR-0016, `core/extension`): they add to them or bind them from a
// `*.listener.ts` when their module starts, so the budgets never import them. One instance of each per application.

/**
 * What the requests that wait to be decided as spend cost in one Cost Center and year, in the reporting currency (`BR-MF1-06f`, RV-10). The
 * requests context holds the one definition of _a request that waits to be decided_ and gives it to the budgets, so the check of a request and
 * the screens of the budgets count the same requests and the budgets never import it (ADR-0016).
 */
export interface PendingSpendContribution {
  /** What the requests of the Cost Center that wait to be decided cost in the year; `exceptRequestId` is one that does not count. */
  pendingOf(costCenterId: string, year: number, exceptRequestId: string | null, tx?: DbTx): Promise<bigint>;
  pendingMany(pairs: readonly { costCenterId: string; year: number }[], tx?: DbTx): Promise<Map<string, bigint>>;
}

/**
 * The contexts that tell the budgets what waits to be decided as spend. The answers are added up. With nobody added, nothing waits: every
 * graph that loads the budgets loads the requests and adds its answer.
 */
@Injectable()
export class PendingSpendContributions extends Contributions<PendingSpendContribution> {
  constructor() {
    super('budgets.pending-spend');
  }

  /** What waits in the Cost Center and the year, from every context that adds its part. */
  async total(costCenterId: string, year: number, tx?: DbTx): Promise<bigint> {
    let sum = 0n;
    for (const contribution of this.all()) sum += await contribution.pendingOf(costCenterId, year, null, tx);

    return sum;
  }

  /** Batched answers keyed by `costCenterId:year`; no contributors means zero for every pair. */
  async totals(pairs: readonly { costCenterId: string; year: number }[], tx?: DbTx): Promise<Map<string, bigint>> {
    const totals = new Map<string, bigint>();
    if (pairs.length === 0) return totals;
    for (const contribution of this.all()) {
      for (const [key, amount] of await contribution.pendingMany(pairs, tx)) {
        totals.set(key, (totals.get(key) ?? 0n) + amount);
      }
    }
    return totals;
  }
}

/**
 * What a Cost Center carries into a year from the year before, in the reporting currency (`QĐ-111ac`, `QĐ-111k`): the amount already saved for that year
 * by the requests approved so far, a right with an end at what the approval kept of it, a right with no end at twelve months of its monthly price of
 * today. The requests context holds the one rule (the same as the pass of 01/01 that commits it), so the budget of the year after is made on the
 * number the year will really start with, and the budgets never import it (ADR-0016).
 */
export interface CarriedOverContribution {
  /** Each Cost Center that carries something into `year`, with the amount; a Cost Center that carries nothing may be left out. */
  carriedOverOf(costCenterIds: readonly string[], year: number, tx?: DbTx): Promise<Map<string, bigint>>;
}

/** The contexts that tell the budgets what is carried over into a year. The answers are added up; with nobody added, nothing is carried over. */
@Injectable()
export class CarriedOverContributions extends Contributions<CarriedOverContribution> {
  constructor() {
    super('budgets.carried-over');
  }

  /** Per Cost Center, from every context that adds its part; a Cost Center that nobody names is not in the answer. */
  async totals(costCenterIds: readonly string[], year: number, tx?: DbTx): Promise<Map<string, bigint>> {
    const totals = new Map<string, bigint>();
    if (costCenterIds.length === 0) return totals;
    for (const contribution of this.all()) {
      for (const [costCenterId, amount] of await contribution.carriedOverOf(costCenterIds, year, tx)) {
        totals.set(costCenterId, (totals.get(costCenterId) ?? 0n) + amount);
      }
    }

    return totals;
  }
}

/** What a commitment shows of the request it is held for, as the context that keeps requests tells it. */
export interface CommitmentRequestView {
  id: string;
  software: { name: string };
  plan: { name: string } | null;
  requester: { employeeCode: string; fullName: string };
  beneficiaryCount: number;
  spendApprovedAt: Date | null;
  /** Whose software it is: the vendor an invoice for the commitment is from; null for internal software. */
  vendorId: string | null;
}

/** A context that knows the requests commitments are held for, so that Finance reads a commitment with its request. */
export interface CommitmentRequestFacts {
  /** The requests with these ids, in one read; a request that cannot be read is not in the map. */
  factsOf(requestIds: readonly string[]): Promise<Map<string, CommitmentRequestView>>;
}

/** A context that knows whether the request a commitment is held for has ended, so that Finance may let the remainder go. */
export interface CommitmentReleaseGuard {
  canReleaseRemainder(requestId: string): Promise<boolean>;
}

/**
 * Whether Finance may let the remainder of a commitment go (`US-06-06` AC-6), bound by the requests context, which knows when a
 * request has ended. Every graph that loads the budgets loads the requests and binds it; unbound, releasing a remainder fails
 * instead of letting go of money a request may still spend.
 */
@Injectable()
export class CommitmentReleaseGuardHook extends Hook<CommitmentReleaseGuard> {
  constructor() {
    super('budgets.commitment-release-guard');
  }
}

/**
 * The requests behind a page of commitments and the vendor an invoice is from, bound by the requests context, which keeps the
 * requests. Every graph that loads the budgets loads the requests and binds it; unbound, reading the commitments fails instead
 * of showing commitments with no request.
 */
@Injectable()
export class CommitmentRequestFactsHook extends Hook<CommitmentRequestFacts> {
  constructor() {
    super('budgets.commitment-request-facts');
  }
}
