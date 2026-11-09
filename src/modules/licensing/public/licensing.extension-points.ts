import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import { Contributions } from '../../../core/extension/contributions';
import { Hook } from '../../../core/extension/hook';
import { Listeners } from '../../../core/extension/listeners';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { PendingRenewal } from './licensing-renewal.types';
import type { RenewalFinancialReader, RenewalUsageReader } from './licensing-subscription-renewal.types';
import type { SeatBaselineClosedHolder } from './licensing.types';
import type { PendingFileQuery, PendingPersonnelFile } from './licensing-service-account.types';
import type {
  GrantOutcome,
  GrantRequestAnswer,
  RevocationContext,
  RevocationReasonFacts,
  GrantOutcomeFacts,
  RevocationTaskFacts,
} from './licensing.types';

/**
 * What the grant of a seat asks of the module that owns requests, which binds it when it starts so licensing never imports it
 * (ADR-0015, the way the catalog learns how seats are held, ADR-0013 item 4).
 */
export interface GrantRequestGate {
  /**
   * The state of the request as a read without a lock: to find the plan and the person before the grant begins. A request for a
   * group is granted one person at a time, so every call names the person (`employeeId`); a request for one person ignores it.
   */
  check(requestId: string, employeeId?: string): Promise<GrantRequestAnswer>;
  /**
   * Inside the transaction of the grant: locks the request, judges it again and, only if it may be granted, moves it to
   * the state of a request being carried out (what lets it be granted once). Any answer but `GRANTABLE` leaves it as it was.
   */
  claimForGrant(tx: DbTx, requestId: string, employeeId?: string): Promise<GrantRequestAnswer>;
  /**
   * Inside the transaction that completes or closes as failed the task of a grant: says how the request ended. A completed grant also says
   * what was granted (`facts`): from the pool or not, the kind, the day, the assignment.
   */
  reportOutcome(
    tx: DbTx,
    requestId: string,
    outcome: GrantOutcome,
    employeeId?: string,
    facts?: GrantOutcomeFacts,
  ): Promise<void>;
  /**
   * Inside the transaction in which the IT Admin completes the task of an extension (`BR-MF1-08d`): the renewal the task answers for is
   * applied (the record that follows the old one is written) and the request ends, as the module of requests decides. `actor` is the IT
   * Admin who completed it.
   */
  reportExtended(tx: DbTx, actor: AuthenticatedPrincipal, requestId: string, now: Date): Promise<void>;
  /**
   * Inside the transaction in which the IT Admin closes the failed task of an extension (`BR-MF1-08d`): the extension will not be done, so
   * the renewal the task answers for fails as a failed grant does (what was held goes back) and the right keeps the end it had. A request
   * that is not a renewal waiting for the task changes nothing. `actor` is the IT Admin who closed it.
   */
  reportExtensionFailed(tx: DbTx, actor: AuthenticatedPrincipal, requestId: string, now: Date): Promise<void>;
  /** Whether the request waits for the IT Admin to close the task of its grant as cancelled: nothing else is decided on it. */
  isWithdrawing(tx: DbTx, requestId: string, employeeId?: string): Promise<boolean>;
  /**
   * Inside the transaction in which the IT Admin cancels the failed task of a withdrawn request: the request ends as withdrawn
   * and what was held for it goes back. Returns false, changing nothing, when the request was not waiting for that.
   */
  reportCancelled(tx: DbTx, requestId: string, employeeId?: string): Promise<boolean>;
}

/** The one gate of requests the provisioning asks (bound by requests; every graph that loads licensing loads it). */
@Injectable()
export class GrantRequestGateHook extends Hook<GrantRequestGate> {
  constructor() {
    super('licensing.grant-request-gate');
  }
}

/**
 * What a revocation tells the modules that extend it (`g6-handover-confirmation`, and the return of a seat of
 * `g5-return-and-renewal-requests`), in the transaction of each moment: they open their step when it opens (`OPENED`), may refuse
 * to let the work start or end by throwing at `BEFORE_WORK`, learn how the work ended (`AFTER_WORK`), and are told when the task
 * is closed as failed (`CLOSED_FAILED`) or a source takes back one of its reasons (`REASON_WITHDRAWN`). The status of the task says which moment of the work it is: before the task is taken it is
 * `QUEUED` or `RETRY_SCHEDULED`, before it is completed `IN_PROGRESS`; after it is `IN_PROGRESS` or `COMPLETED`.
 */
export type RevocationEvent =
  | {
      /**
       * A task was opened or a reason added to it. `reasons` are all the task has, the first first; `actor` is who asked for the
       * revocation and `now` the instant the source gave (or the clock): the day a deadline counts from.
       */
      moment: 'OPENED';
      task: RevocationTaskFacts;
      reasons: readonly RevocationReasonFacts[];
      context: RevocationContext;
      actor: AuthenticatedPrincipal;
      now: Date;
    }
  | {
      /**
       * A source took back one of its reasons (`withdrawRevocationReason`). `remaining` are the reasons that still stand, the first first;
       * `cancelled` is true when none stood and the task ended as cancelled (`task.status` is then `CANCELLED`).
       */
      moment: 'REASON_WITHDRAWN';
      task: RevocationTaskFacts;
      withdrawn: RevocationReasonFacts;
      remaining: readonly RevocationReasonFacts[];
      cancelled: boolean;
      now: Date;
      actor: AuthenticatedPrincipal;
    }
  | { moment: 'BEFORE_WORK'; task: RevocationTaskFacts; now: Date }
  | { moment: 'AFTER_WORK'; task: RevocationTaskFacts; now: Date; actor: AuthenticatedPrincipal }
  | {
      /** The IT Admin closed the failed task for good: the seat stays as it was. */
      moment: 'CLOSED_FAILED';
      task: RevocationTaskFacts;
      closeReason: string;
      now: Date;
      actor: AuthenticatedPrincipal;
    };

/**
 * The modules that extend a revocation, told in the order they were added and stopped at the first that throws. The handover
 * confirmation of licensing is added before the return of requests (licensing starts first); a test pins that order.
 */
@Injectable()
export class RevocationListeners extends Listeners<RevocationEvent, DbTx> {
  constructor() {
    super('licensing.revocation');
  }
}

/**
 * Whether a seat has a renewal waiting for its decision (`US-05-14` AC-4): the revocation of a right that has reached its end
 * (`g6-time-limited-access`) leaves it alone while one is. Implemented by the module of requests.
 */
export interface RenewalHold {
  hasPendingRenewal(assignmentId: string, tx?: DbTx): Promise<boolean>;
  /**
   * The renewal waiting for its decision of each of these seats, in one read: the queue of the rights that have ended
   * (`g6-time-limited-access`) keeps such an item waiting and shows where its request stands. A seat with none is absent.
   */
  pendingRenewalsOf(assignmentIds: readonly string[], tx?: DbTx): Promise<Map<string, PendingRenewal>>;
}

/** The renewals of requests that hold a seat (bound by requests). */
@Injectable()
export class RenewalHoldHook extends Hook<RenewalHold> {
  constructor() {
    super('licensing.renewal-hold');
  }
}

/**
 * The people who have a transfer that is not closed or a departure that is not closed, with the day each takes effect, earliest day
 * first (`US-03-08`): the day a person answering for a service account has to be replaced by. Implemented by the module of personnel.
 */
export interface ResponsibleDeadlineProvider {
  listPending(query: PendingFileQuery, tx?: DbTx): Promise<PendingPersonnelFile[]>;
}

/** The personnel files that bind the change of the person responsible for a service account (bound by personnel). */
@Injectable()
export class ResponsibleDeadlineHook extends Hook<ResponsibleDeadlineProvider> {
  constructor() {
    super('licensing.responsible-deadline');
  }
}

/**
 * What closing the seat baseline (step 4 of the installation) tells the modules that act on it, in the transaction of the closing
 *, once, after the closing is written and audited. `holders` are only the people who hold a seat on a subscription owned by
 * another department than their own, one entry for each person, sorted by employee id.
 */
export interface SeatBaselineClosedEvent {
  organizationId: string;
  /** The closing day in the calendar of the organization. */
  closedOn: BusinessDate;
  holders: SeatBaselineClosedHolder[];
}

/**
 * The modules told of the closing of the seat baseline (the personnel module opens the review after the installation, decided by the
 * head of the department of each holder); a listener that throws rolls the closing back. With none, closing tells nobody.
 */
@Injectable()
export class SeatBaselineClosedListeners extends Listeners<SeatBaselineClosedEvent, DbTx> {
  constructor() {
    super('licensing.seat-baseline-closed');
  }
}

/**
 * Who builds the snapshot of money a renewal is decided on (`US-11-02` AC-4, AC-5): the module that owns budgets and costs adds
 * one reader. With none added the decision is still taken, and the snapshot frozen with it says that no figure was connected
 * instead of showing a 0; with more than one the first is read.
 */
@Injectable()
export class RenewalFinancialContributions extends Contributions<RenewalFinancialReader> {
  constructor() {
    super('licensing.renewal-financial-snapshot');
  }
}

/**
 * Who tells the renewal what the evidence of use says of each seat (the last activity, an open waste recommendation): the owner of
 * usage evidence adds one reader once it exists. With none, the renewal ranks the seats without it and says the usage cannot be
 * judged; it never guesses a usage of 0.
 */
@Injectable()
export class RenewalUsageContributions extends Contributions<RenewalUsageReader> {
  constructor() {
    super('licensing.renewal-usage-evidence');
  }
}
