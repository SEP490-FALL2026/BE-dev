import { Injectable } from '@nestjs/common';
import { Hook } from '../../../core/extension/hook';
import { Listeners } from '../../../core/extension/listeners';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';

// The points the budgets open for the contexts above them (ADR-0016, `core/extension`): they add to them or bind them from a
// `*.listener.ts` when their module starts, so the budgets never import them. One instance of each per application.

/** A budget of a Cost Center and a year changed in a way a request waiting on it must hear of. */
export interface BudgetVersionEvent {
  costCenterId: string;
  year: number;
  versionId: string;
}

/** A version the spending approver did not approve: refused, or sent back to Finance to look again. */
export interface BudgetRefusalEvent extends BudgetVersionEvent {
  decision: 'REJECTED' | 'CHANGES_REQUESTED';
}

/** A purchase window of a plan line moved in place; `versionIds` are all the versions of that Cost Center and year. */
export interface PlanLineMovedEvent {
  costCenterId: string;
  year: number;
  position: number;
  /** Why Finance moved it, as written on the history of the line. */
  reason: string;
  versionIds: readonly string[];
}

/**
 * What another context does when a budget changes, one method for each kind of change. It runs in the transaction of the change,
 * so a request is never left waiting on a budget that has already moved, and a failure undoes the change as well. The listener
 * adds `budgetChangeHandler(itself)` to `BudgetChangeListeners` when its module starts.
 */
export interface BudgetChangeListener {
  /**
   * Takes, before the budget year lock, the locks of the rows this listener will change for the Cost Center and the year when a
   * version is decided or the year is closed. The order of the whole system is the row of the request first, then the year: a
   * listener that locked its rows only after the year lock would wait for a writer that holds its row and waits for the year.
   */
  lockWaiting(tx: DbTx, scope: { costCenterId: string; year: number }): Promise<void>;
  versionApproved(tx: DbTx, actor: AuthenticatedPrincipal, event: BudgetVersionEvent): Promise<void>;
  /**
   * The spending approver refused a version or sent it back to Finance: the year still has no new budget. `decision` is what
   * the approver decided, so a request that waits for the version is told which of the two it was.
   */
  versionRefused(tx: DbTx, actor: AuthenticatedPrincipal, event: BudgetRefusalEvent): Promise<void>;
  /**
   * The year-end closure closed a version that never became current (`QĐ-91e`): the system does it, so there is no actor.
   * A version that was current stays as the reference budget of the year and is not told here.
   */
  versionExpired(tx: DbTx, event: BudgetVersionEvent): Promise<void>;
  planLineMoved(tx: DbTx, actor: AuthenticatedPrincipal, event: PlanLineMovedEvent): Promise<void>;
}

/**
 * One change of a budget, as `BudgetChangeListeners` tells it: the kind names the method of `BudgetChangeListener` that hears it.
 * `LOCK_WAITING` is emitted before the budget year lock is taken, the others once the change is written.
 */
export type BudgetChange =
  | { kind: 'LOCK_WAITING'; scope: { costCenterId: string; year: number } }
  | { kind: 'VERSION_APPROVED'; actor: AuthenticatedPrincipal; event: BudgetVersionEvent }
  | { kind: 'VERSION_REFUSED'; actor: AuthenticatedPrincipal; event: BudgetRefusalEvent }
  | { kind: 'VERSION_EXPIRED'; event: BudgetVersionEvent }
  | { kind: 'PLAN_LINE_MOVED'; actor: AuthenticatedPrincipal; event: PlanLineMovedEvent };

/**
 * The contexts told when a budget changes, in the transaction of the change and in the order they were added; one that throws
 * rolls the change back. With nobody added a change is told to nobody.
 */
@Injectable()
export class BudgetChangeListeners extends Listeners<BudgetChange, DbTx> {
  constructor() {
    super('budgets.change-listeners');
  }
}

/** The handler `BudgetChangeListeners.add` takes for a listener with one method for each kind of change. */
export function budgetChangeHandler(listener: BudgetChangeListener): (tx: DbTx, change: BudgetChange) => Promise<void> {
  return (tx, change) => {
    switch (change.kind) {
      case 'LOCK_WAITING':
        return listener.lockWaiting(tx, change.scope);
      case 'VERSION_APPROVED':
        return listener.versionApproved(tx, change.actor, change.event);
      case 'VERSION_REFUSED':
        return listener.versionRefused(tx, change.actor, change.event);
      case 'VERSION_EXPIRED':
        return listener.versionExpired(tx, change.event);
      case 'PLAN_LINE_MOVED':
        return listener.planLineMoved(tx, change.actor, change.event);
    }
  };
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
