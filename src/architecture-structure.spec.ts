import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

/**
 * Structure gates of docs/rules/module-structure.md. Each rule fails on a NEW violation. Violations that existed when
 * the rule was introduced (18/10/2026, HEAD 186ad5f) are listed in LEGACY below, exactly, with the remediation slice of
 * docs/workspace/items/foundation-remediation-handoff-2026-10-18 that removes them. Entries are only ever removed:
 * a stale entry (the violation is gone) also fails, so the ledger cannot drift. Adding an entry needs a recorded
 * reason in that item and Owner review; it is not a way to make a red build green.
 *
 * GATE.1 (19/10/2026, Owner decision E9 = A) closed the blind spots A4-01, A4-04 and A4-05 of
 * docs/reviews/be-full-src-architecture-audit-2026-10-19 and seeded exactly the live cases that report lists, each with
 * the slice of that report (section 9) that removes it.
 */

const sourceRoot = join(process.cwd(), 'src');
const modulesRoot = join(sourceRoot, 'modules');

/** Inspection thresholds agreed in the 18/10/2026 audit. */
const MAX_FILE_LINES = 400;
const HARD_MAX_FILE_LINES = 700;
const MAX_ROOT_CONTROLLERS = 2;
const MAX_ROOT_FILES = 12;
const MAX_DIRECTORY_DEPTH = 2;
/**
 * H8-RV-01 (Prompt 21A): a unit spec of a business module is capped like a source file. A larger one is split by
 * observable use case, its shared harness in test/support/ (test/README.md). No ledger and no exception.
 */
const MAX_MODULE_SPEC_LINES = 400;

/** Module-level folders every capability of the same module may import. */
const SHARED_MODULE_FOLDERS = new Set(['dto', 'errors', 'mappers', 'policies']);

/**
 * GATE.2 (19/10/2026): the exact intra-module contracts. Inside one business module, a file of another part (another
 * capability, or a root file outside the root public surface) is public only when it is listed here, relative to src/,
 * with why it is public. A suffix such as `*.service.ts` or `*.types.ts` opens nothing: repos, the credential hasher,
 * policies, helpers, validators and implementation services stay private unless promoted here and documented as a
 * contract. Every entry must exist and keep a real consumer in another part of its module; an entry that loses its
 * last consumer must be removed (the gate below fails both ways). Listing a file is a design decision reviewed like
 * PUBLIC_CONTRACT_EXPORTS of module-graph.spec.ts, never a way to make a red build green.
 */
const INTRA_MODULE_CONTRACTS: ReadonlyMap<string, string> = new Map([
  // data-import (H8.3): the module facade reads the latest kept people import through the capability service.
  [
    'modules/data-import/employee-import/employee-import.service.ts',
    'latest kept people import read by the facade data-import.service.ts for the onboarding checklist',
  ],
  // identity-access (Wave B: capabilities reach one another through these services, types and the shared ports).
  [
    'modules/identity-access/identity-access.ports.ts',
    'session port ACCOUNT_SESSIONS: consumed by accounts and recovery, implemented by auth',
  ],
  [
    'modules/licensing/provisioning/registered-grant-request-gate.service.ts',
    'the gate the module of requests registers with the facade licensing.service.ts (G5); provisioning asks it through the token',
  ],
  [
    'modules/catalog/catalog-entry/internal-software-registration.service.ts',
    'registers internal software and its plan in the transaction of a request, read by the facade catalog.service.ts (G5)',
  ],
  [
    'modules/catalog/plan/plan.service.ts',
    'declares the plan of internal software registered on behalf of a request, called by catalog-entry/internal-software-registration.service.ts (G5)',
  ],
  [
    'modules/catalog/vendor/vendor-lookup.service.ts',
    'the name of a vendor, read by the facade catalog.service.ts for the assessment of software that is not in the catalog (G5)',
  ],
  // budgets (G5): the facade budgets.service.ts reads the figures of the check and registers the listeners of a change.
  [
    'modules/budgets/budget/budget-facts.repo.ts',
    'the current budget and the plan line the check of a request reads, behind the facade budgets.service.ts (G5)',
  ],
  [
    'modules/budgets/budget/budget-change-listeners.ts',
    'the contexts told when a budget is decided or a plan line moves, behind the facade budgets.service.ts (G5)',
  ],
  [
    'modules/budgets/budget/commitment.service.ts',
    'holds the commitments of a request in the transaction of its approval, behind the facade budgets.service.ts (G5)',
  ],
  // requests (G5): the spend capability works on the same requests and steps as the capability that sends them.
  [
    'modules/requests/access-request/access-request.repo.ts',
    'the one reader and writer of requests and their steps, used by the spend capability for the check, the review and the routing (G5)',
  ],
  [
    'modules/requests/access-request/access-request.types.ts',
    'the shapes of a request and its steps that the repository reads and writes, used by the spend capability (G5)',
  ],
  [
    'modules/requests/access-request/access-request.policy.ts',
    'the policy of a request, read by the spend capability for where a request stands (G5)',
  ],
  [
    'modules/requests/access-request/access-request.errors.ts',
    'the errors of a request, raised by the spend capability when the request does not exist (G5)',
  ],
  [
    'modules/requests/access-request/access-request.http-errors.ts',
    'maps the errors of a request, which the spend capability extends with its own (G5)',
  ],
  [
    'modules/requests/access-request/access-request-audit-event.ts',
    'builds the audit event of a change to a request, used by the spend capability (G5)',
  ],
  [
    'modules/requests/access-request/assessment.repo.ts',
    'the quote of the assessment of software that is not in the catalog, read by the check of the budget (G5)',
  ],
  [
    'modules/requests/access-request/access-request.dto.ts',
    'the state of a request and the choice of a line of the plan, shared with the DTOs of the spend capability (G5)',
  ],
  [
    'modules/requests/access-request/pricing-view.service.ts',
    'the cost of a request with its estimated tax, shown to the spending approver by the spend capability (G5)',
  ],
  [
    'modules/requests/access-request/request-preview.dto.ts',
    'the shape of the estimated cost, shared with the DTO of the spend step of the approver (G5)',
  ],
  [
    'modules/requests/access-request/repricing.service.ts',
    'what a request costs for another day, used by the supplementary file of the head (G5)',
  ],
  [
    'modules/requests/access-request/request-assessment.service.ts',
    'the operating parameters a request is judged by, read by the supplementary file of the head (G5)',
  ],
  [
    'modules/requests/access-request/access-request-query.service.ts',
    'reads a request with the names of its people for the routes of service accounts, which answer with the request they made or decided (G5)',
  ],
  [
    'modules/requests/access-request/access-request.wire.ts',
    'the wire form of a request, returned by the routes of service accounts (G5)',
  ],
  [
    'modules/requests/spend/plan-line.service.ts',
    'attaches a request to a line of the plan, called by the approval of the need step (G5)',
  ],
  [
    'modules/requests/spend/spend-entry.service.ts',
    'checks at once a request nobody can send on in a batch, called when its need or its assessment is done (G5)',
  ],
  [
    'modules/requests/spend/spend-status.service.ts',
    'where a request stands on its way to the spending approver, read by access-request-query.service.ts (G5)',
  ],
  [
    'modules/requests/spend/budget-information.service.ts',
    'closes the questions to Finance that wait, called when a request is withdrawn by withdrawal.service.ts (G5)',
  ],
  [
    'modules/requests/spend/spend-batch.repo.ts',
    'says a request left the batch it was sent in, called when it is withdrawn by withdrawal.service.ts (G5)',
  ],
  [
    'modules/requests/spend/spend-step.repo.ts',
    'closes the open steps of a request, called when it is withdrawn by withdrawal.service.ts (G5)',
  ],
  [
    'modules/requests/access-request/access-request.service.ts',
    'sends a request in the transaction of a renewal that turned out to be sent after the end of the right, called by renewal-request/renewal-request.service.ts (G5)',
  ],
  [
    'modules/requests/access-request/need-decision.policy.ts',
    'the twelve-month limit and the state an approved request goes to, read by renewal-request/renewal-request.service.ts for the renewal a head sends (G5)',
  ],
  // requests (G5, US-05-17): the request for a group is its own capability, which reads the people and the rules of the others.
  [
    'modules/requests/group-request/group-request.types.ts',
    'the state of a line and the line a request record carries, read by access-request.types.ts and grant.policy.ts, which judge a request for a group (G5)',
  ],
  [
    'modules/requests/access-request/beneficiary-eligibility.policy.ts',
    'what a person must have to be given access by the request of somebody else, shared by the head who sends for the department and the request for a group (G5)',
  ],
  [
    'modules/requests/access-request/pricing.policy.ts',
    'the payments of a request, which the request for a group lays out again for the people that stay (G5)',
  ],
  [
    'modules/requests/group-request/group-grant.service.ts',
    'claims, completes, fails and cancels the grant of one person of a request for a group, called by the grant gate access-request-grant.gate.ts (G5)',
  ],
  [
    'modules/requests/group-request/group-withdrawal.service.ts',
    'withdraws one person or all the people left of a request for a group, called by withdrawal.service.ts when the request is for a group (G5)',
  ],
  [
    'modules/requests/group-request/group-line-closure.service.ts',
    'removes one person who left from a request for a group, called by departure-cancellation.service.ts when the leaver holds the last live line (G6)',
  ],
  [
    'modules/requests/group-request/group-line-closure.policy.ts',
    'which person of a request for a group a whole-request closing means, read by departure-cancellation.service.ts (G6)',
  ],
  [
    'modules/requests/group-request/line-allocation.policy.ts',
    'lays the payments of a request out again for the people approved, read by the budget check spend/budget-check.service.ts (G5)',
  ],
  [
    'modules/requests/group-request/group-supplement.service.ts',
    'leaves the people of a group out of a supplementary file and keeps who, called by spend/supplement.service.ts (G5)',
  ],
  [
    'modules/requests/access-request/need-spend.service.ts',
    'the line of the plan and the day a head gives with an approval of the need, shared by the decision of one person and the decision of the lines of a group (G5)',
  ],
  [
    'modules/requests/access-request/withdrawal.policy.ts',
    'who withdraws a request and in which stage the head may, judged again on each line of a group by group-request/group-withdrawal.policy.ts (G5)',
  ],
  [
    'modules/requests/access-request/open-request.service.ts',
    'the requests of a person that are still open, reached through the requests facade requests.service.ts (G6, US-03-04 AC-24)',
  ],
  [
    'modules/requests/spend/spend-effects.service.ts',
    'what a spend decision does to the budget and to the step, shared by the decision of one person and the decision of the lines of a group (G5)',
  ],
  [
    'modules/requests/spend/spend-decision.policy.ts',
    'who may decide the spend step and what the check made again allows, judged for the lines of a group by group-request/group-spend-decision.service.ts (G5)',
  ],
  [
    'modules/requests/spend/spend-decision.repo.ts',
    'the one writer of the record of a spend decision, called by group-request/group-spend-record.service.ts for the lines of a group (G5)',
  ],
  [
    'modules/requests/spend/spend-routing.service.ts',
    'reopens the review of Finance when the approver checks a request again, called by group-request/group-spend-decision.service.ts (G5)',
  ],
  [
    'modules/requests/spend/budget-check.service.ts',
    'makes the check of the budget on the people of a group who were approved, called by group-request/group-spend-decision.service.ts (G5)',
  ],
  [
    'modules/requests/spend/spend.errors.ts',
    'the refusals of a spend decision, raised as they are by the decision of the lines of a group (G5)',
  ],
  [
    'modules/requests/spend/spend.http-errors.ts',
    'the answers of the spend routes, which the routes of a group fall through to for the errors that are not its own (G5)',
  ],
  [
    'modules/requests/spend/spend-approval-view.service.ts',
    'the panel of the spending approver, read after the decision of the lines of a group by group-request/group-lines.controller.ts (G5)',
  ],
  [
    'modules/requests/spend/spend-approval.dto.ts',
    'the response of the panel of the spending approver, returned by the route that decides the lines of a group (G5)',
  ],
  [
    'modules/requests/group-request/group-request.http-errors.ts',
    'the answers of the group routes, which the supplementary file of the head uses for the people left out of a group (G5)',
  ],
  [
    'modules/requests/service-account-request/service-account-request.http-errors.ts',
    'the answers of the service-account request routes, which the send of a draft of that kind uses so that it answers with the codes of the original operation (spec L.1)',
  ],
  [
    'modules/requests/renewal-request/renewal-apply.service.ts',
    'writes the record that follows when a renewal is approved in full, called by the approval of the need step and of the spend step (G5)',
  ],
  // requests (G5, FR-3.16): the reassignment of steps runs the routing tables again on the data of today.
  [
    'modules/requests/access-request/routing-facts.service.ts',
    'the facts the routing table of the need step reads on a day, read again by the reassignment of steps when the organization changes (G5)',
  ],
  [
    'modules/requests/access-request/routing.policy.ts',
    'the routing table of the need step, run again on the data of today by the reassignment of steps (G5)',
  ],
  [
    'modules/requests/spend/spend-routing.policy.ts',
    'the tables of the spend step and of the review of Finance, run again on the data of today by the reassignment of steps (G5)',
  ],
  [
    'modules/requests/reassignment/step-target.service.ts',
    'who a step is given to on the data of today, used by the spend routing to leave out a role holder who has left (G5)',
  ],
  [
    'modules/requests/reassignment/step-reassignment.service.ts',
    'the reassignment of steps, called from the module root by the sweep the worker runs (G5)',
  ],
  // requests (spec L.1, F27): the draft of a paid request is saved by its own operations and becomes the request when it is sent.
  [
    'modules/requests/access-request/request-draft.repo.ts',
    'locks the draft that is being sent and judges whose it is, called by group-request/group-request.service.ts and service-account-request/service-account-request.service.ts, which send a draft of their kind (spec L.1)',
  ],
  [
    'modules/requests/access-request/request-draft-departure.service.ts',
    'deletes the drafts of a person whose departure takes effect, called by reassignment/organization-change.listener.ts in the transaction of the change (spec L.1)',
  ],
  [
    'modules/requests/group-request/group-request.service.ts',
    'sends a request for a group, called by access-request/request-draft-submit.service.ts when a draft of a group is sent (spec L.1)',
  ],
  [
    'modules/requests/group-request/group-request.dto.ts',
    'the body of a request for a group, which a draft of a group is validated by when it is saved: the same schema as the route that sends it (spec L.1)',
  ],
  [
    'modules/requests/service-account-request/service-account-request.service.ts',
    'sends a request for a service account, called by access-request/request-draft-submit.service.ts when a draft of one is sent (spec L.1)',
  ],
  [
    'modules/requests/service-account-request/service-account-request.dto.ts',
    'the body of a request for a service account, which a draft of one is validated by when it is saved: the same schema as the route that sends it (spec L.1)',
  ],
  // requests (F43): the contexts that follow what became of a request hear it from one registry, in the transaction of the end.
  [
    'modules/requests/access-request/request-outcome-listeners.ts',
    'tells the listeners (the personnel context, through the facade requests.service.ts) how a request or a line ended, called by the services that end one: the grant gate, the decisions, the withdrawals and the closings of the IT Admin (F43)',
  ],
  // notifications (G5, FR-3.11): the facade gives an in-app notice through the inbox capability.
  [
    'modules/notifications/inbox/held-notification.service.ts',
    'the notices kept for a department without a head and handed to its first head (F67, T-11), reached through the facade notifications.service.ts',
  ],
  [
    'modules/notifications/inbox/inbox.service.ts',
    'gives an in-app notice in the transaction of the caller, read by the facade notifications.service.ts (G5)',
  ],
  // requests (G5, US-05-15): the root contract the worker calls reads the projection of the audit events into the inbox.
  [
    'modules/requests/status/request-status-projector.service.ts',
    'the projection of the audit events of the requests into the inbox, called from the module root by request-status-projector.service.ts for the worker (G5)',
  ],
  // requests (G5, FR-3.8): the root contract the worker calls runs the reminders of the late steps and the alert of a backlog.
  [
    'modules/requests/sla/step-sla.service.ts',
    'the reminders of the steps and of the queue of the head, called from the module root by step-sla-sweep.service.ts for the worker (G5)',
  ],
  [
    'modules/requests/sla/backlog-alert.service.ts',
    'the alert of a backlog to the Super Admin, called from the module root by step-sla-sweep.service.ts for the worker (G5)',
  ],
  [
    'modules/requests/sla/sla-queue-age.service.ts',
    'how long a request has waited in the queue of the head and how many reminders it had, read by spend/spend-queue.service.ts for the list of the head (G5)',
  ],
  // identity-access (G5, FR-3.16): the roles announce that they changed hands through the one registry of the facade.
  [
    'modules/identity-access/approval-roles/approval-role-change.registry.ts',
    'where the approval roles and the role of Finance announce a change of holder: announced by accounts and approval-roles, registered through the facade identity-access.service.ts (G5)',
  ],
  [
    'modules/licensing/assignment/assignment-renewal.service.ts',
    'reads a seat with its chain and renews it, read by the facade licensing.service.ts (G5)',
  ],
  [
    'modules/licensing/assignment/registered-renewal-hold.service.ts',
    'the hold the module of requests registers with the facade licensing.service.ts: whether a seat has a renewal waiting (G5)',
  ],
  [
    'modules/licensing/assignment/registered-responsible-deadline.service.ts',
    'the provider the module of personnel registers with the facade licensing.service.ts: which people have a transfer or a departure that is not closed (G6)',
  ],
  [
    'modules/licensing/assignment/service-account-duty.service.ts',
    'the open service accounts a person answers for, reached through the licensing facade licensing.service.ts (G6)',
  ],
  [
    'modules/licensing/provisioning/provisioning-cancellation.service.ts',
    'cancels the grant of a withdrawn request, read by the facade licensing.service.ts (G5)',
  ],
  [
    'modules/licensing/provisioning/provisioning-task-frame.service.ts',
    'the rule for an IT Admin who works for themselves, read by the facade licensing.service.ts for the review of a service account (G5)',
  ],
  [
    'modules/identity-access/approval-roles/approval-role-holders.service.ts',
    'who holds the approval roles now, read by the facade identity-access.service.ts for the routing of a request (G5)',
  ],
  [
    'modules/identity-access/accounts/account-directory.service.ts',
    'account lookup for access, approval-roles, auth, recovery and the facade',
  ],
  [
    'modules/identity-access/accounts/account.errors.ts',
    'account errors mapped by the shared mappers/account.http-errors.ts (accounts and auth routes)',
  ],
  [
    'modules/identity-access/accounts/account.types.ts',
    'APPROVAL_ROLE_HOLDINGS port, owned by its accounts consumer and implemented by approval-roles',
  ],
  [
    'modules/identity-access/accounts/action-link-revocation.service.ts',
    'revokes open action links when auth or recovery changes a credential',
  ],
  [
    'modules/identity-access/accounts/action-link.service.ts',
    'issues and redeems action links for auth password reset, recovery and the facade',
  ],
  [
    'modules/identity-access/accounts/credential.service.ts',
    'credential checks and writes for auth, recovery and the facade',
  ],
  [
    'modules/identity-access/accounts/invitation-redemption.service.ts',
    'invitation redemption served by the auth route',
  ],
  ['modules/identity-access/accounts/role-grant.service.ts', 'role grants for approval-roles, recovery and the facade'],
  [
    'modules/identity-access/accounts/successor-eligibility.service.ts',
    'Super Admin successor rule shared with the recovery enrolment',
  ],
  [
    'modules/identity-access/approval-roles/approval-role-directory.service.ts',
    'approval roles held now, read by the access-token verifier',
  ],
  [
    'modules/identity-access/auth/auth.errors.ts',
    'auth errors mapped by the shared mappers/auth.http-errors.ts (auth and access routes)',
  ],
  [
    'modules/identity-access/auth/password-change.service.ts',
    'password change use case behind the /me route of access',
  ],
  [
    'modules/identity-access/auth/session-directory.service.ts',
    'session state read by the access-token verifier (implements ACCOUNT_SESSIONS)',
  ],
  ['modules/identity-access/auth/token.service.ts', 'access-token verification for the access verifier'],
  [
    'modules/identity-access/recovery/recovery-ticket.service.ts',
    'waiting recovery tickets that block a password reset request (H3c)',
  ],
  // catalog (G3, ADR-0013): the application capability reaches the dictionary, the vendors and the functional groups
  // through these contracts; the name and host helpers are pure text functions every capability shares.
  [
    'modules/catalog/vendor-dictionary/vendor-matcher.ts',
    'pure name and host normalisation (searchKey, normalizeHost) shared by every catalog capability',
  ],
  [
    'modules/catalog/vendor-dictionary/vendor-dictionary-lookup.service.ts',
    'the dictionary line and its group read by the application declaration',
  ],
  [
    'modules/catalog/vendor-dictionary/vendor-proposal-intake.service.ts',
    'proposal to the dictionary raised by an application declaration outside it',
  ],
  ['modules/catalog/vendor/vendor-directory.service.ts', 'vendors found or made by the application declaration'],
  [
    'modules/catalog/vendor/vendor.errors.ts',
    'refusals of vendor-directory.service.ts that the application declaration maps to its own errors (P29-N3)',
  ],
  [
    'modules/catalog/catalog-entry/application-lookup.service.ts',
    'application locked for the plans declared under it, so it cannot be retired meanwhile',
  ],
  [
    'modules/catalog/subscription/subscription-notice.service.ts',
    'milestones of the active term subscriptions, read by the review of the terms of a plan',
  ],
  [
    'modules/catalog/plan/plan-lookup.service.ts',
    'plan facts and lock read by the subscriptions and the terms hanging off it, so its kind cannot change meanwhile',
  ],
  [
    'modules/catalog/functional-group/functional-group-lookup.service.ts',
    'active functional group chosen by the application declaration',
  ],
  // finance (G3, ADR-0013): the facade reads the two capabilities through these services; the shared mapper maps the
  // exchange-rate errors for the exchange-rate and currency routes.
  [
    'modules/finance/currency/currency.service.ts',
    'currency table read by the finance facade for parsing and conversion',
  ],
  [
    'modules/catalog/subscription/onboarding-facts.service.ts',
    'counts of applications, plans and subscriptions read through the catalog facade catalog.service.ts for the onboarding checklist',
  ],
  [
    'modules/catalog/subscription/subscription-lookup.service.ts',
    'term and end of the subscriptions of some plans, read by the retirement of an application',
  ],
  [
    'modules/catalog/subscription/seat-guard.policy.ts',
    'the K2 recommendation and its threshold, read by the application read from the same seat guards as the subscription',
  ],
  [
    'modules/catalog/subscription/seat-occupancy.registry.ts',
    'where licensing hands the catalog its reader of occupied seats (ADR-0013 item 4): the facade registers it, the subscription and the application read it',
  ],
  [
    'modules/catalog/subscription/seat-target.service.ts',
    'seat target (subscription or internal plan, its seats bought) read through the catalog facade catalog.service.ts',
  ],
  [
    'modules/licensing/assignment/assignment.service.ts',
    'seat targets, facts and the writing of baseline assignments, reached through the licensing facade licensing.service.ts',
  ],
  [
    'modules/licensing/provisioning/revocation.service.ts',
    'the one gate that opens the revocation of a seat for every source, reached through the licensing facade licensing.service.ts (G6)',
  ],
  [
    'modules/licensing/provisioning/revocation-read.service.ts',
    'the personal seats of a person and the K1 seats whose access runs on, reached through the licensing facade licensing.service.ts (G6)',
  ],
  [
    'modules/licensing/provisioning/open-grant-task.service.ts',
    'the grant tasks of a person that are not finished, reached through the licensing facade licensing.service.ts (G6, US-03-04 AC-24)',
  ],
  [
    'modules/licensing/provisioning/registered-revocation-hook.service.ts',
    'the hook the handover confirmation registers with the facade licensing.service.ts (G6); provisioning calls it at three points',
  ],
  [
    'modules/licensing/handover/handover.service.ts',
    'opens, moves and cancels the handover duties of a person who leaves, reached through the licensing facade licensing.service.ts (G6)',
  ],
  [
    'modules/licensing/provisioning/provisioning.http-errors.ts',
    'maps the refusals of the gate that opens a revocation for the route that starts one for a right that ended (G6)',
  ],
  [
    'modules/licensing/assignment/assignment-end.service.ts',
    'ends or shortens the seat a revocation gives back, called by the revocation services of provisioning (G6)',
  ],
  [
    'modules/licensing/provisioning/provisioning-failure.service.ts',
    'the entry the connector calls when a try failed, reached through the licensing facade licensing.service.ts',
  ],
  [
    'modules/licensing/seat-baseline/seat-baseline.service.ts',
    'whether the baseline is closed and the shared lock a confirmation holds, reached through the licensing facade',
  ],
  ['modules/finance/tax-profile/tax-profile.service.ts', 'tax estimate of a vendor read through the finance facade'],
  [
    'modules/finance/exchange-rate/exchange-rate-ledger.service.ts',
    'recorded exchange rates read by the finance facade; written only through the audited ExchangeRateService',
  ],
  [
    'modules/finance/exchange-rate/exchange-rate.errors.ts',
    'exchange-rate errors thrown through the facade and mapped by the shared mappers/finance.http-errors.ts',
  ],
  // personnel (G6, ADR-0017): what the capabilities of the context share.
  [
    'modules/personnel/grounds/grounds.policy.ts',
    'the basis a personnel change rests on, judged the same way by the transfer and by the flows that follow (G6)',
  ],
  [
    'modules/personnel/personnel-self-action.policy.ts',
    'whether an IT Admin may record an event about their own person, judged the same way by every personnel flow (G6)',
  ],
  [
    'modules/personnel/personnel-file-hooks.ts',
    'the hooks the flows that follow a personnel file register, called by the transfer when it is recorded, moved or cancelled (G6)',
  ],
  [
    'modules/personnel/offboarding/offboarding-blocker.registry.ts',
    'the registry of what keeps the record of a departure open, where the service accounts that wait for a new person register their count (G6)',
  ],
  [
    'modules/personnel/role-duties/role-duties.service.ts',
    'which of the roles that need someone to take over a person who leaves holds, read in one batch by the list and the case of the departure (G6)',
  ],
  [
    'modules/personnel/leave/leave-query.service.ts',
    'the days a person was on long leave, read by the facade personnel.service.ts for the rules of the recommendations (G6)',
  ],
  [
    'modules/personnel/leave/leave-departure.service.ts',
    'ends the long leave of a person who leaves and resumes it when the handover is cancelled, called by the record of a departure (G6)',
  ],
  [
    'modules/personnel/transfer/transfer-change.service.ts',
    'the transfer that waits and its cancellation inside the transaction of the record of a departure that ends before its day (G6), and the writes of the controlled procedure for the Super Admin (F19)',
  ],
  [
    'modules/personnel/transfer/transfer-guard.service.ts',
    'who the actor is to the person recorded and whether the one chosen to follow a head can take the department, judged alike by a transfer and by a departure (G6)',
  ],
  [
    'modules/personnel/notice/notice-recorder.registry.ts',
    'the registry of the recorders of a notice of a head: the transfer, the long leave and the departure each register how the event a notice announces is written (G6)',
  ],
  [
    'modules/personnel/event-notice/personnel-notifier.service.ts',
    'who is told of an event of the personnel context, written in the transaction of the event by the transfer, the long leave, the departure, the notices, the review of tools and the roles of a person who leaves (F17)',
  ],
  [
    'modules/personnel/transfer/transfer.service.ts',
    'the record of a transfer in the transaction of the caller, which the controlled procedure for the Super Admin runs with an operator actor (F19)',
  ],
  [
    'modules/personnel/transfer/transfer.errors.ts',
    'the refusals of a transfer, read by the controlled procedure to name them as the application does (F19)',
  ],
  [
    'modules/personnel/leave/leave.service.ts',
    'the writes of a long leave in the transaction of the caller, which the controlled procedure for the Super Admin runs with an operator actor (F19)',
  ],
  [
    'modules/personnel/leave/leave.errors.ts',
    'the refusals of a long leave, read by the controlled procedure to name them as the application does (F19)',
  ],
  [
    'modules/personnel/offboarding/offboarding.service.ts',
    'the record of a departure in the transaction of the caller, which the controlled procedure for the Super Admin runs with an operator actor (F19)',
  ],
  [
    'modules/personnel/offboarding/offboarding-change.service.ts',
    'the move and the cancellation of a departure in the transaction of the caller, run by the controlled procedure for the Super Admin (F19)',
  ],
  [
    'modules/personnel/offboarding/offboarding.errors.ts',
    'the refusals of a departure, read by the controlled procedure to name them as the application does (F19)',
  ],
  [
    'modules/personnel/notice/notice-handling.service.ts',
    'the record of the event a notice of a head announces in the transaction of the caller, run by the controlled procedure for the Super Admin (F19)',
  ],
  [
    'modules/personnel/notice/notice.errors.ts',
    'the refusal of a notice that a recorder raises when the person already has the event the notice announces (G6)',
  ],
  [
    'modules/personnel/notice/notice.types.ts',
    'the kinds and records of a notice that the recorders of the transfer, the long leave and the departure are given and answer with (G6)',
  ],
  // organization (Waves 2 and 3: the facade and the department use cases reach the other capabilities here; GATE2-02:
  // the shared mappers/organization.http-errors.ts maps the errors of all five capabilities for their routes).
  [
    'modules/organization/cost-center/cost-center-catalogue.service.ts',
    'installation and vacancy contract of the facade',
  ],
  [
    'modules/organization/cost-center/cost-center.errors.ts',
    'Cost Center errors mapped by the shared mappers/organization.http-errors.ts',
  ],
  [
    'modules/organization/cost-center/cost-center.types.ts',
    'code format shared with departments; Cost Center views used by department records',
  ],
  [
    'modules/organization/change-announcement/organization-change.service.ts',
    'registers the listeners of a change of the organization and tells them of it, behind the facade and the history facade (G6)',
  ],
  ['modules/organization/department/department-directory.service.ts', 'department head periods behind the facade'],
  [
    'modules/organization/department/service-account-registry.ts',
    'registry where licensing hands in the reader of the service accounts a department owns (QĐ-86c), read by the facade',
  ],
  [
    'modules/organization/department/department-use-registry.ts',
    'registry where the modules that hold the facts hand in what keeps a department (QĐ-90e) or a Cost Center (QĐ-87d(2)) in use, read by the facade',
  ],
  [
    'modules/organization/department/department.errors.ts',
    'department errors mapped by the shared mappers/organization.http-errors.ts',
  ],
  ['modules/organization/department/department.types.ts', 'department views returned by the facade'],
  ['modules/organization/employee/employee-directory.service.ts', 'employee lookup and manual entry behind the facade'],
  [
    'modules/organization/employee/employee.errors.ts',
    'employee row errors mapped by the shared mappers/organization.http-errors.ts',
  ],
  [
    'modules/organization/project/project.errors.ts',
    'project errors mapped by the shared mappers/organization.http-errors.ts',
  ],
  ['modules/organization/project/project.service.ts', 'projects listed in the department profile'],
  [
    'modules/organization/project/project.types.ts',
    'project record nested in department views and in the shared mappers/project.mapper.ts',
  ],
]);

const LEGACY = {
  /**
   * importer -> target, both relative to src/. Empty since identity-access Wave B (H5.5 to H5.7): capabilities reach
   * one another only through services and types. Stays as a gate.
   */
  crossCapabilityImports: new Set<string>(),
  /** Controller importing another controller. Empty since H4.1 (shared project mapper); stays as a gate. */
  controllerImports: new Set<string>(),
  /** Error classes declared in an orchestration file (service/controller/repo). Empty since H6.3; stays as a gate. */
  errorClassesOutsideErrorFiles: new Set<string>(),
  /** HTTP mapping (ApiException/HttpStatus) inside a business error file. Empty since H8.1; stays as a gate. */
  httpMappingInErrorFiles: new Set<string>(),
  /** Errors matched by their class name string instead of instanceof. Empty since ROOT.1 (A4-04): both CLIs read
   * `infrastructure/cli/cli-runtime.ts`, which uses instanceof. */
  errorMatchedByName: new Set<string>(),
  /** HTTP mapping (ApiException/HttpStatus) inside a business service. A4-05 (GATE.1). Empty since the catalog sample was removed (g3-catalog-foundation); stays as a gate. */
  httpMappingInServices: new Set<string>(),
  /** Raw SQL in a business file that is not a repository. Empty since H6.3 (installation lock in its repo). */
  rawSqlOutsideRepositories: new Set<string>(),
  /** File -> line cap. A listed file must not grow past its cap. */
  oversizedFiles: new Map<string, number>(),
  /** Module -> cap on controllers directly in the module root. H4. */
  rootControllers: new Map<string, number>(),
  /** Module -> cap on non-spec files directly in the module root. H4. */
  rootFiles: new Map<string, number>(),
} as const;

function listTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return entry === 'generated' ? [] : listTypeScriptFiles(path);

    return path.endsWith('.ts') && !path.endsWith('.spec.ts') ? [path] : [];
  });
}

function toSourcePath(file: string): string {
  return relative(sourceRoot, file).split(sep).join('/');
}

function relativeSpecifiers(source: string): string[] {
  return [
    ...source.matchAll(/\b(?:import|export)\b[^;'"]*?\bfrom\s*['"]([^'"]+)['"]/g),
    ...source.matchAll(/\bimport\s*['"]([^'"]+)['"]/g),
    ...source.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g),
  ]
    .map((match) => match[1])
    .filter((specifier) => specifier.startsWith('.'));
}

function resolvedImports(file: string): string[] {
  return relativeSpecifiers(readFileSync(file, 'utf8')).flatMap((specifier) => {
    const base = resolve(dirname(file), specifier);
    const target = [`${base}.ts`, join(base, 'index.ts')].find((candidate) => existsSync(candidate));

    return target === undefined ? [] : [target];
  });
}

function lineCount(file: string): number {
  const text = readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/).length;

  return text.endsWith('\n') ? lines - 1 : lines;
}

/** Every unit spec (`*.spec.ts`) below `directory`, recursively. */
function listSpecFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return entry === 'generated' ? [] : listSpecFiles(path);

    return path.endsWith('.spec.ts') ? [path] : [];
  });
}

/** The specs above the module unit spec cap, with their path relative to src/ and their line count. */
function oversizedModuleSpecs(
  specFiles: string[],
  countLines: (file: string) => number = lineCount,
): { file: string; lines: number }[] {
  return specFiles
    .map((file) => ({ file: toSourcePath(file), lines: countLines(file) }))
    .filter(({ lines }) => lines > MAX_MODULE_SPEC_LINES)
    .sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
}

/** Path segments below src/modules: [module, ...folders, file]. */
function moduleSegments(file: string): string[] {
  return relative(modulesRoot, file).split(sep);
}

function isErrorFile(file: string): boolean {
  return file.endsWith('.errors.ts') || moduleSegments(file).slice(1, -1).includes('errors');
}

function moduleDirectories(): string[] {
  return readdirSync(modulesRoot).filter((entry) => statSync(join(modulesRoot, entry)).isDirectory());
}

/**
 * Compares what the tree contains now with the legacy set: every finding must be listed, and every listed entry must
 * still be a finding. Returns both differences so a failure names exactly what to fix.
 */
function againstLedger(findings: Iterable<string>, legacy: ReadonlySet<string>) {
  const found = new Set(findings);

  return {
    newViolations: [...found].filter((finding) => !legacy.has(finding)).sort(),
    staleLedgerEntries: [...legacy].filter((entry) => !found.has(entry)).sort(),
  };
}

const CLEAN = { newViolations: [], staleLedgerEntries: [] };

const ROOT_AREA = '<module root>';
const SHARED_AREA = '<shared folder>';

/** The part of a business module a file belongs to: a capability folder, the module root or a shared folder. */
function moduleArea(file: string): { moduleName: string; area: string } {
  const [moduleName, first, ...rest] = moduleSegments(file);
  if (rest.length === 0) return { moduleName, area: ROOT_AREA };

  return { moduleName, area: SHARED_MODULE_FOLDERS.has(first) ? SHARED_AREA : first };
}

/**
 * Module-root files that are public: the Nest modules, the facade service, public types and public errors. Kept in
 * step with `isModulePublicSurface` of architecture-boundaries.spec.ts; the rest of the root is private.
 */
/**
 * ROOT-HARDEN.1: the exact root contract files besides `<module>.service.ts`; the same list as in
 * architecture-boundaries.spec.ts, which checks that both stay equal.
 */
const PUBLIC_ROOT_CONTRACT_FILES: ReadonlySet<string> = new Set([
  'notifications/email-delivery.service.ts',
  'identity-access/identity-access-inspection.service.ts',
  'identity-access/local-demo-account.service.ts',
  'requests/step-redetermination-sweep.service.ts',
  'requests/request-status-projector.service.ts',
  'requests/step-sla-sweep.service.ts',
  'organization/organization-history.service.ts',
]);

/** BEH.1: the exact shared policy files; the same list as in architecture-boundaries.spec.ts (checked by policy-ownership.spec.ts). */
const PUBLIC_ROOT_POLICY_FILES: ReadonlySet<string> = new Set(['organization/employee-placement.policy.ts']);

function isModuleRootPublicSurface(file: string): boolean {
  const [moduleName, fileName, ...rest] = moduleSegments(file);
  if (fileName === undefined || rest.length > 0) return false;
  const rootPath = `${moduleName}/${fileName}`;
  if (PUBLIC_ROOT_CONTRACT_FILES.has(rootPath) || PUBLIC_ROOT_POLICY_FILES.has(rootPath)) return true;

  return (
    fileName === `${moduleName}.module.ts` ||
    fileName.endsWith('-http.module.ts') ||
    fileName.endsWith('-facade.module.ts') ||
    fileName === `${moduleName}.service.ts` ||
    fileName.endsWith('.types.ts') ||
    fileName.endsWith('.errors.ts')
  );
}

/**
 * True when `importer` and `target` are two different parts of one business module and the import is subject to the
 * part boundary. Direction matters (GATE2-02): every part may use a shared module folder (`dto/`, `errors/`,
 * `mappers/`, `policies/`), and shared folders use one another, but a shared-folder file that reaches into a capability
 * or the root crosses a boundary like any other part. Only a Nest module file wires every provider of its module.
 */
function crossesModuleParts(importer: string, target: string): boolean {
  if (!importer.startsWith(modulesRoot + sep) || !target.startsWith(modulesRoot + sep)) return false;
  if (importer.endsWith('.module.ts')) return false;

  const from = moduleArea(importer);
  const to = moduleArea(target);

  return from.moduleName === to.moduleName && to.area !== SHARED_AREA && from.area !== to.area;
}

/**
 * True when `importer` reaches a private file of another part of its own business module. The module root is one more
 * part, not a free zone: a root file may not reach into a capability, nor a capability into the private root. Only a
 * Nest module file may wire every provider of its module. Across parts, a target is public only when it is the root
 * public surface or an exact entry of `contracts` (GATE.2) — never because of its file-name suffix.
 */
function isPrivateCrossAreaImport(
  importer: string,
  target: string,
  contracts: ReadonlyMap<string, string> = INTRA_MODULE_CONTRACTS,
): boolean {
  if (!crossesModuleParts(importer, target)) return false;
  if (contracts.has(toSourcePath(target))) return false;

  return !(moduleArea(target).area === ROOT_AREA && isModuleRootPublicSurface(target));
}

/**
 * Registry drift against the real import graph: entries whose file does not exist, and entries that exist but no file
 * of another part of the module imports any more. Both must be removed from the registry.
 */
function contractRegistryDrift(
  contracts: ReadonlyMap<string, string>,
  crossPartTargets: ReadonlySet<string>,
  fileExists: (sourcePath: string) => boolean,
) {
  const entries = [...contracts.keys()];

  return {
    missingFiles: entries.filter((entry) => !fileExists(entry)).sort(),
    unusedEntries: entries.filter((entry) => fileExists(entry) && !crossPartTargets.has(entry)).sort(),
  };
}

/** The files the `error.name` rule reads: every listed source file of src (composition roots and infrastructure too). */
function filesScannedForErrorName(sourceFiles: string[]): string[] {
  return sourceFiles.filter((file) => file.startsWith(sourceRoot + sep));
}

function matchesErrorByName(source: string): boolean {
  return /\.name\s*[!=]==\s*['"`]\w*Error['"`]/.test(source);
}

/** A business service: a `*.service.ts` file of a business module. Controllers and HTTP mappers may map HTTP. */
function isBusinessServiceFile(file: string): boolean {
  return file.startsWith(modulesRoot + sep) && file.endsWith('.service.ts');
}

/** Blanks out comments and string/template literals so a rule matches code, not prose. */
function codeOnly(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\.|[^`\\])*`/g, ' ');
}

/** True when code (not a comment or a string) builds an HTTP response: `ApiException` or `HttpStatus`. */
function mentionsHttpMapping(source: string): boolean {
  return /\b(?:ApiException|HttpStatus)\b/.test(codeOnly(source));
}

describe('module structure gates (docs/rules/module-structure.md)', () => {
  const sourceFiles = listTypeScriptFiles(sourceRoot);
  const moduleFiles = sourceFiles.filter((file) => file.startsWith(modulesRoot + sep));

  it('keeps each part of a module (capability or module root) out of the private files of another part', () => {
    const findings = moduleFiles.flatMap((file) =>
      resolvedImports(file)
        .filter((target) => isPrivateCrossAreaImport(file, target))
        .map((target) => `${toSourcePath(file)} -> ${toSourcePath(target)}`),
    );

    expect(againstLedger(findings, LEGACY.crossCapabilityImports)).toEqual(CLEAN);
  });

  it('GATE.2: lists exactly the intra-module contracts another part of the module imports, and nothing already public', () => {
    const crossPartTargets = new Set(
      moduleFiles.flatMap((file) =>
        resolvedImports(file)
          .filter((target) => crossesModuleParts(file, target))
          .map(toSourcePath),
      ),
    );
    const alreadyPublic = [...INTRA_MODULE_CONTRACTS.keys()].filter((entry) => {
      const file = join(sourceRoot, entry);

      return isModuleRootPublicSurface(file) || moduleArea(file).area === SHARED_AREA;
    });

    expect({
      ...contractRegistryDrift(INTRA_MODULE_CONTRACTS, crossPartTargets, (entry) =>
        existsSync(join(sourceRoot, entry)),
      ),
      alreadyPublic,
    }).toEqual({ missingFiles: [], unusedEntries: [], alreadyPublic: [] });
  });

  it('never lets a controller import another controller', () => {
    const findings = moduleFiles
      .filter((file) => file.endsWith('.controller.ts'))
      .flatMap((file) =>
        resolvedImports(file)
          .filter((target) => target.endsWith('.controller.ts'))
          .map((target) => `${toSourcePath(file)} -> ${toSourcePath(target)}`),
      );

    expect(againstLedger(findings, LEGACY.controllerImports)).toEqual(CLEAN);
  });

  it('has no global catch-all errors/common/shared folder', () => {
    const catchAll = ['errors', 'common', 'shared', 'utils', 'helpers'].flatMap((name) =>
      [join(sourceRoot, name), join(modulesRoot, name)].filter((path) => existsSync(path)).map(toSourcePath),
    );

    expect(catchAll).toEqual([]);
  });

  it('declares business error classes in error files, not in services, controllers or repositories', () => {
    const findings = moduleFiles
      .filter((file) => /\.(service|controller|repo)\.ts$/.test(file))
      .flatMap((file) =>
        [...readFileSync(file, 'utf8').matchAll(/\bclass\s+(\w+)\s+extends\s+\w*Error\b/g)].map(
          (match) => `${toSourcePath(file)}: ${match[1]}`,
        ),
      );

    expect(againstLedger(findings, LEGACY.errorClassesOutsideErrorFiles)).toEqual(CLEAN);
  });

  it('keeps one class per error name inside a module (no synonym at the root and in errors/)', () => {
    const declarations = new Map<string, string[]>();
    for (const file of moduleFiles) {
      for (const match of readFileSync(file, 'utf8').matchAll(/\bclass\s+(\w+)\s+extends\s+\w*Error\b/g)) {
        const key = `${moduleSegments(file)[0]}:${match[1]}`;
        declarations.set(key, [...(declarations.get(key) ?? []), toSourcePath(file)]);
      }
    }

    expect([...declarations].filter(([, files]) => files.length > 1)).toEqual([]);
  });

  it('keeps HTTP mapping out of business error files', () => {
    const findings = moduleFiles
      .filter(isErrorFile)
      .filter((file) => /\bApiException\b|\bHttpStatus\b/.test(readFileSync(file, 'utf8')))
      .map(toSourcePath);

    expect(againstLedger(findings, LEGACY.httpMappingInErrorFiles)).toEqual(CLEAN);
  });

  it('matches errors with instanceof, never by their name string', () => {
    const findings = filesScannedForErrorName(sourceFiles)
      .filter((file) => matchesErrorByName(readFileSync(file, 'utf8')))
      .map(toSourcePath);

    expect(againstLedger(findings, LEGACY.errorMatchedByName)).toEqual(CLEAN);
  });

  it('keeps HTTP mapping (ApiException, HttpStatus) out of business services', () => {
    const findings = moduleFiles
      .filter(isBusinessServiceFile)
      .filter((file) => mentionsHttpMapping(readFileSync(file, 'utf8')))
      .map(toSourcePath);

    expect(againstLedger(findings, LEGACY.httpMappingInServices)).toEqual(CLEAN);
  });

  it('runs raw SQL only in repository files', () => {
    const findings = moduleFiles
      .filter((file) => !file.endsWith('.repo.ts'))
      .filter((file) => /\$(?:query|execute)Raw/.test(readFileSync(file, 'utf8')))
      .map(toSourcePath);

    expect(againstLedger(findings, LEGACY.rawSqlOutsideRepositories)).toEqual(CLEAN);
  });

  it('keeps source files under the size thresholds, and listed files from growing', () => {
    const tooLarge = sourceFiles
      .map((file) => ({ file: toSourcePath(file), lines: lineCount(file) }))
      .filter(({ lines }) => lines > MAX_FILE_LINES);

    expect(tooLarge.filter(({ lines }) => lines > HARD_MAX_FILE_LINES)).toEqual([]);
    expect(tooLarge.filter(({ file, lines }) => lines > (LEGACY.oversizedFiles.get(file) ?? MAX_FILE_LINES))).toEqual(
      [],
    );
    expect(
      againstLedger(
        tooLarge.map(({ file }) => file),
        new Set(LEGACY.oversizedFiles.keys()),
      ),
    ).toEqual(CLEAN);
  });

  it('groups a module by capability before its root collects too many controllers or files', () => {
    const roots = moduleDirectories().map((moduleName) => {
      const direct = readdirSync(join(modulesRoot, moduleName)).filter(
        (entry) => entry.endsWith('.ts') && !entry.endsWith('.spec.ts'),
      );

      return {
        moduleName,
        controllers: direct.filter((entry) => entry.endsWith('.controller.ts')).length,
        files: direct.length,
      };
    });

    const controllerFindings = roots
      .filter(
        ({ moduleName, controllers }) => controllers > (LEGACY.rootControllers.get(moduleName) ?? MAX_ROOT_CONTROLLERS),
      )
      .map(({ moduleName, controllers }) => ({ moduleName, controllers }));
    const fileFindings = roots
      .filter(({ moduleName, files }) => files > (LEGACY.rootFiles.get(moduleName) ?? MAX_ROOT_FILES))
      .map(({ moduleName, files }) => ({ moduleName, files }));

    expect({ controllerFindings, fileFindings }).toEqual({ controllerFindings: [], fileFindings: [] });
    expect(
      againstLedger(
        roots.filter(({ controllers }) => controllers > MAX_ROOT_CONTROLLERS).map(({ moduleName }) => moduleName),
        new Set(LEGACY.rootControllers.keys()),
      ),
    ).toEqual(CLEAN);
    expect(
      againstLedger(
        roots.filter(({ files }) => files > MAX_ROOT_FILES).map(({ moduleName }) => moduleName),
        new Set(LEGACY.rootFiles.keys()),
      ),
    ).toEqual(CLEAN);
  });

  it('nests at most two directory levels inside a business module', () => {
    const tooDeep = moduleFiles
      .filter((file) => moduleSegments(file).length - 2 > MAX_DIRECTORY_DEPTH)
      .map(toSourcePath);

    expect(tooDeep).toEqual([]);
  });

  it('H8-RV-01: keeps every module unit spec at or under 400 lines (split by use case, harness in test/support/)', () => {
    expect(oversizedModuleSpecs(listSpecFiles(modulesRoot))).toEqual([]);
  });

  it('reports the ledger helper differences in both directions', () => {
    expect(againstLedger(['a', 'b'], new Set(['b', 'c']))).toEqual({
      newViolations: ['a'],
      staleLedgerEntries: ['c'],
    });
  });
});

describe('gate rules on synthetic files (A4-01, A4-04, A4-05)', () => {
  const inModule = (...parts: string[]) => join(modulesRoot, 'sample', ...parts);

  describe('A4-01: the module root is part of the capability boundary', () => {
    it('flags a capability that reaches a private file of another capability', () => {
      expect(isPrivateCrossAreaImport(inModule('alpha', 'alpha.service.ts'), inModule('beta', 'beta.repo.ts'))).toBe(
        true,
      );
    });

    it('flags a module-root file that reaches a private file inside a capability', () => {
      expect(isPrivateCrossAreaImport(inModule('sample.service.ts'), inModule('beta', 'beta.repo.ts'))).toBe(true);
    });

    it('flags a capability that reaches a private file at the module root', () => {
      expect(isPrivateCrossAreaImport(inModule('alpha', 'alpha.service.ts'), inModule('recovery.repo.ts'))).toBe(true);
    });

    it('allows the registered contracts of a capability, the root public surface and the shared folders', () => {
      const importer = inModule('alpha', 'alpha.service.ts');
      const contracts = new Map([
        ['modules/sample/beta/beta.service.ts', 'test contract'],
        ['modules/sample/beta/beta.types.ts', 'test contract'],
      ]);

      expect(
        isPrivateCrossAreaImport(inModule('sample.service.ts'), inModule('beta', 'beta.service.ts'), contracts),
      ).toBe(false);
      expect(isPrivateCrossAreaImport(importer, inModule('beta', 'beta.types.ts'), contracts)).toBe(false);
      expect(isPrivateCrossAreaImport(importer, inModule('sample.errors.ts'))).toBe(false);
      expect(isPrivateCrossAreaImport(importer, inModule('sample.types.ts'))).toBe(false);
      expect(isPrivateCrossAreaImport(importer, inModule('sample.service.ts'))).toBe(false);
      expect(isPrivateCrossAreaImport(importer, inModule('dto', 'shared.dto.ts'))).toBe(false);
    });

    it('keeps the credential hasher private inside the module', () => {
      expect(
        isPrivateCrossAreaImport(inModule('sample.service.ts'), inModule('beta', 'password-hasher.service.ts')),
      ).toBe(true);
    });

    it('lets a Nest module file wire every provider of its own module', () => {
      expect(isPrivateCrossAreaImport(inModule('sample.module.ts'), inModule('beta', 'beta.repo.ts'))).toBe(false);
    });

    it('ignores imports inside one capability, inside the root and across modules', () => {
      expect(isPrivateCrossAreaImport(inModule('alpha', 'alpha.service.ts'), inModule('alpha', 'alpha.repo.ts'))).toBe(
        false,
      );
      expect(isPrivateCrossAreaImport(inModule('recovery.service.ts'), inModule('recovery.repo.ts'))).toBe(false);
      expect(
        isPrivateCrossAreaImport(inModule('alpha', 'alpha.service.ts'), join(modulesRoot, 'other', 'other.repo.ts')),
      ).toBe(false);
    });
  });

  describe('GATE.2: a capability is public inside its module only through an exact contract list', () => {
    const importer = inModule('alpha', 'alpha.service.ts');

    it('rejects an arbitrary helper service of another capability, whatever its suffix', () => {
      expect(isPrivateCrossAreaImport(importer, inModule('beta', 'internal-helper.service.ts'))).toBe(true);
    });

    it('rejects arbitrary private types of another capability, whatever its suffix', () => {
      expect(isPrivateCrossAreaImport(importer, inModule('beta', 'private-state.types.ts'))).toBe(true);
    });

    const real = (path: string) => join(sourceRoot, ...path.split('/'));
    const realContracts: [string, string][] = [
      [
        'modules/identity-access/auth/login.service.ts',
        'modules/identity-access/accounts/account-directory.service.ts',
      ],
      ['modules/identity-access/access/jwt-access-token.verifier.ts', 'modules/identity-access/auth/token.service.ts'],
      [
        'modules/identity-access/auth/password-reset-request.service.ts',
        'modules/identity-access/recovery/recovery-ticket.service.ts',
      ],
      ['modules/organization/department/department.types.ts', 'modules/organization/project/project.types.ts'],
    ];

    it.each(realContracts)('accepts the registered Wave B/organization contract %s -> %s', (importerPath, target) => {
      expect(isPrivateCrossAreaImport(real(importerPath), real(target))).toBe(false);
    });

    it.each(realContracts)('rejects %s -> %s once the contract leaves the registry', (importerPath, target) => {
      const withoutIt = new Map([...INTRA_MODULE_CONTRACTS].filter(([entry]) => entry !== target));

      expect(isPrivateCrossAreaImport(real(importerPath), real(target), withoutIt)).toBe(true);
    });

    it('keeps the real repositories, the credential hasher and policies private', () => {
      const importer = real('modules/identity-access/auth/login.service.ts');

      for (const target of [
        'modules/identity-access/accounts/app-user.repo.ts',
        'modules/identity-access/accounts/password-hasher.service.ts',
        'modules/identity-access/accounts/account-administration.policy.ts',
        'modules/identity-access/recovery/recovery.repo.ts',
      ])
        expect({ target, isPrivate: isPrivateCrossAreaImport(importer, real(target)) }).toEqual({
          target,
          isPrivate: true,
        });
    });

    it('reports a registry entry with no file and one with no consumer in another part', () => {
      const contracts = new Map([
        ['used.service.ts', 'x'],
        ['unused.service.ts', 'x'],
        ['missing.types.ts', 'x'],
      ]);

      expect(
        contractRegistryDrift(contracts, new Set(['used.service.ts']), (entry) => entry !== 'missing.types.ts'),
      ).toEqual({ missingFiles: ['missing.types.ts'], unusedEntries: ['unused.service.ts'] });
    });
  });

  describe('GATE2-02: a shared module folder that imports is held to the same contracts', () => {
    it.each([
      ['mappers', 'x.ts', 'private.repo.ts'],
      ['policies', 'x.ts', 'internal-helper.service.ts'],
      ['dto', 'x.ts', 'private-state.types.ts'],
    ])('rejects %s/%s -> a capability file %s that is not a registered contract', (folder, file, target) => {
      expect(isPrivateCrossAreaImport(inModule(folder, file), inModule('beta', target))).toBe(true);
    });

    it('rejects a shared folder that reaches a private file at the module root', () => {
      expect(isPrivateCrossAreaImport(inModule('mappers', 'x.ts'), inModule('sample.repo.ts'))).toBe(true);
    });

    it('accepts a shared folder that reaches a registered contract or the root public surface', () => {
      const contracts = new Map([['modules/sample/beta/beta.errors.ts', 'test contract']]);

      expect(isPrivateCrossAreaImport(inModule('mappers', 'x.ts'), inModule('beta', 'beta.errors.ts'), contracts)).toBe(
        false,
      );
      expect(isPrivateCrossAreaImport(inModule('mappers', 'x.ts'), inModule('sample.errors.ts'))).toBe(false);
      expect(
        isPrivateCrossAreaImport(
          join(sourceRoot, 'modules', 'identity-access', 'mappers', 'account.http-errors.ts'),
          join(sourceRoot, 'modules', 'identity-access', 'accounts', 'account.errors.ts'),
        ),
      ).toBe(false);
    });

    it('keeps every part free to use a shared folder, and shared folders free to use one another', () => {
      expect(isPrivateCrossAreaImport(inModule('alpha', 'alpha.controller.ts'), inModule('mappers', 'x.ts'))).toBe(
        false,
      );
      expect(isPrivateCrossAreaImport(inModule('sample.service.ts'), inModule('policies', 'x.policy.ts'))).toBe(false);
      expect(isPrivateCrossAreaImport(inModule('mappers', 'x.ts'), inModule('dto', 'y.dto.ts'))).toBe(false);
    });
  });

  describe('H8-RV-01: the module unit spec cap', () => {
    it('reads only the specs below src/modules, not the gate specs at src/ or anything in test/', () => {
      const scanned = listSpecFiles(modulesRoot).map(toSourcePath);

      expect(scanned.length).toBeGreaterThan(0);
      expect(scanned.filter((file) => !file.startsWith('modules/'))).toEqual([]);
      expect(scanned.filter((file) => !file.endsWith('.spec.ts'))).toEqual([]);
      expect(scanned).not.toContain('architecture-structure.spec.ts');
    });

    it('names each spec over 400 lines with its exact count, and lets 400 lines pass', () => {
      const lines: Record<string, number> = {
        [inModule('alpha', 'big.spec.ts')]: 1084,
        [inModule('alpha', 'edge.spec.ts')]: 400,
        [inModule('beta', 'over.spec.ts')]: 401,
      };

      expect(oversizedModuleSpecs(Object.keys(lines), (file) => lines[file])).toEqual([
        { file: 'modules/sample/alpha/big.spec.ts', lines: 1084 },
        { file: 'modules/sample/beta/over.spec.ts', lines: 401 },
      ]);
    });
  });

  describe('A4-04: error.name is read in all of src', () => {
    it('scans composition roots and infrastructure, not only business modules', () => {
      const files = [
        join(sourceRoot, 'recovery-cli.ts'),
        join(sourceRoot, 'infrastructure', 'config', 'sample.ts'),
        inModule('sample.service.ts'),
      ];

      expect(filesScannedForErrorName(files)).toEqual(files);
    });

    it('matches a comparison of the name string and not instanceof', () => {
      expect(matchesErrorByName("if (error.name === 'EnvironmentValidationError') return;")).toBe(true);
      expect(matchesErrorByName('if (error instanceof EnvironmentValidationError) return;')).toBe(false);
    });
  });

  describe('A4-05: HTTP mapping stays out of business services', () => {
    it('selects business services and leaves controllers, HTTP mappers and infrastructure alone', () => {
      expect(isBusinessServiceFile(inModule('sample.service.ts'))).toBe(true);
      expect(isBusinessServiceFile(inModule('alpha', 'alpha.service.ts'))).toBe(true);
      expect(isBusinessServiceFile(inModule('sample.controller.ts'))).toBe(false);
      expect(isBusinessServiceFile(inModule('sample.http-errors.ts'))).toBe(false);
      expect(isBusinessServiceFile(join(sourceRoot, 'infrastructure', 'mail', 'mail.service.ts'))).toBe(false);
    });

    it('flags ApiException or HttpStatus used as code', () => {
      expect(mentionsHttpMapping('throw new ApiException(HttpStatus.NOT_FOUND, { code: "X" });')).toBe(true);
      expect(mentionsHttpMapping("import { HttpStatus } from '@nestjs/common';")).toBe(true);
    });

    it('ignores the words inside comments and string literals', () => {
      expect(mentionsHttpMapping('// The controller maps this to an ApiException.\nconst x = 1;')).toBe(false);
      expect(mentionsHttpMapping('/* HttpStatus is chosen by the controller */ const x = 1;')).toBe(false);
      expect(mentionsHttpMapping("const message = 'HttpStatus and ApiException are HTTP concerns';")).toBe(false);
      expect(mentionsHttpMapping('const message = `ApiException`;')).toBe(false);
    });
  });
});
