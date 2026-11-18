import { Injectable } from '@nestjs/common';
import { Contributions } from '../../../core/extension/contributions';
import { Listeners } from '../../../core/extension/listeners';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AppRole, ApprovalRoleChange } from './identity-access.types';

// The points identity-access opens for the modules above it (`core/extension`): they add to them from a `*.listener.ts` when
// their module starts, so identity-access never imports them. One instance of each per application.

/**
 * A module that acts when an approval role or the role of Finance changes hands. It is called in the transaction of the change,
 * in the order the listeners were added; throwing rolls the change back with it.
 */
export interface ApprovalRoleChangeListener {
  onChange(tx: DbTx, change: ApprovalRoleChange): Promise<void>;
}

/**
 * The modules told when an approval role or the role of Finance changes hands, in the transaction of the change (`FR-3.16`): the
 * account services emit it with an `id` made for the change. Held by the facade module, so the API and the worker each hear the
 * changes of their own graph; with nobody added a change is told to nobody.
 */
@Injectable()
export class ApprovalRoleChangeListeners extends Listeners<ApprovalRoleChange, DbTx> {
  constructor() {
    super('identity-access.approval-role-change-listeners');
  }
}

/** What kind of open work stands in the way of the grant of SPENDING_APPROVER (`QĐ-93d`(3)). */
export type SpendingApproverBlockerKind = 'REQUEST' | 'RETURN_REQUEST' | 'BUDGET_PROPOSAL';

/** One piece of open work the person is a party of: what the refusal shows the Super Admin so they can finish or hand it on. */
export interface SpendingApproverBlocker {
  kind: SpendingApproverBlockerKind;
  id: string;
  /** A short description of the work, never a name or a reason a person wrote. */
  label: string;
  /** How the person stands in the work, when that is not obvious from the kind. */
  partyRole?: 'REQUESTER' | 'BENEFICIARY' | 'RESPONSIBLE';
}

/** How many pieces of open work the refusal lists; it says when it cut the list. */
export const SPENDING_APPROVER_BLOCKER_LIMIT = 50;

/** A module that knows work which keeps a person from becoming the spending approver. */
export interface SpendingApproverGrantCheck {
  /**
   * The open work that stops this employee from being given the role. Called in the transaction of the grant, after the account was
   * locked `FOR UPDATE`, so what a Request of the same person just committed is seen. The refusal shows at most
   * `SPENDING_APPROVER_BLOCKER_LIMIT` items, so a check need not read more than one over that.
   */
  blockersOf(tx: DbTx, employeeId: string): Promise<SpendingApproverBlocker[]>;
}

/**
 * Who tells the grant of SPENDING_APPROVER of the work that is still open (`QĐ-93d`(3), `US-01-03` AC-12, AC-13): the Request and the budget
 * proposal sit in modules above identity-access, which add one check each from a `*.listener.ts`. Held by the
 * facade module, one per application; with nobody added a grant finds no work.
 */
@Injectable()
export class SpendingApproverGrantChecks extends Contributions<SpendingApproverGrantCheck> {
  constructor() {
    super('identity-access.spending-approver-grant-checks');
  }
}

/** A policy in force that a person owes an acknowledgement of: what `GET /me` lists so the interface can ask before the dashboard (`QĐ-111ar`). */
export interface PendingPolicyAcknowledgement {
  code: string;
  title: string;
  versionNumber: number;
}

/** The person to ask about: the account and the roles it holds, as `GET /me` knows them. */
export interface PolicyReader {
  appUserId: string;
  employeeId: string;
  roles: readonly AppRole[];
}

/** A module that knows policies the person has not acknowledged yet. */
export interface PendingPolicyAcknowledgementSource {
  pendingFor(reader: PolicyReader): Promise<PendingPolicyAcknowledgement[]>;
}

/**
 * Who tells `GET /me` which policies the caller owes an acknowledgement of (`QĐ-111ar`): the library of policies sits in a module above
 * identity-access, which adds one source from a `*.listener.ts`. Held by the facade module, one per application; with nobody added the
 * list is empty. The route only tells: no other route refuses a person who has not acknowledged.
 */
@Injectable()
export class PendingPolicyAcknowledgements extends Contributions<PendingPolicyAcknowledgementSource> {
  constructor() {
    super('identity-access.pending-policy-acknowledgements');
  }
}
