# ADR-0008: No derived MANAGER for Super Admins; block accounts of terminated employees

## Status

**Accepted** 2026-10-03 by the project Owner (Docs decision log `QĐ-41a` for the status-only block; `QĐ-41b` for recovery). **Accepted is not implemented:** work package WP-01 implements it. Amends ADR-0006 §2 (_Effective roles_) and closes the item ADR-0006 lists as _Open_ under _Consequences_. ADR-0006 stays accepted for everything else; per `docs/rules/documentation.md` it is not edited except for a one-line note saying that §2 was amended by ADR-0008 (added 2026-10-03).

Not implemented. Work package **WP-01** of `docs/architecture/s0-core-design.md` implements it.

_Note added 2026-10-03:_ [ADR-0009](0009-single-super-admin-and-transfer.md) (**Proposed**, awaiting the Owner's review) would supersede **decision 4's usable-Super-Admin count** and the `LAST_SUPER_ADMIN` guard, because the Owner decided on 2026-10-03 (`QĐ-44`) that an organization has at most one Super Admin. Until ADR-0009 is Accepted this ADR stands as written; decisions 1–3, 5 and 6, the actor re-check and the lock discipline of decision 4 are unaffected.

## Date

2026-10-03

**Authority annotation — 2026-10-03:** [ADR-0010](0010-native-password-authentication.md) now supersedes the OIDC-specific flow inherited from ADR-0006 and explicitly retains the single-Super-Admin business invariant. The old usable-holder count is historical context, not permission to create multiple holders while ADR-0009 remains Proposed. Native enforcement/transfer/recovery details remain subject to design review. “Slice 1 today” and references to existing S0 services below describe the pre-restore audit, not current HEAD `78cb675`.

## Context

Two Owner decisions recorded on 2026-10-02 (Docs `Decisions/project-decisions.md`, **Owner decisions, not confirmed by the supervisor/GVHD**) contradict what slice 1 built:

| Decision                                   | Rule                                                                                                                                                                                                                                                                                         | Slice 1 today                                                                                                 |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `QĐ-39b(3)`, BRD `FR-8.7`, `US-01-02` AC-6 | An account holding `SUPER_ADMIN` never receives the derived `MANAGER` role, even with direct reports. Their reports' need-step goes to the Super Admin's own manager (C4). The org tree and tree-based reports do not change.                                                                | `ResolvePrincipalService.resolve` adds `MANAGER` whenever `isManagerToday` is true                            |
| `QĐ-39d`, BRD `FR-8.9`, `US-03-04` AC-9    | From the moment the employee becomes **TERMINATED**, every operation of the linked account is refused at once, without anyone acting. The account status is **not** changed by the system; the Super Admin is reminded to lock it. _In handover_ and _long leave_ do not affect the account. | the employee's status is never read during principal resolution; a terminated employee's ACTIVE account works |

Owner decision of 2026-10-03 (recorded as `QĐ-41a`): the block is keyed on the **status** `TERMINATED` only. An employee _in handover_ whose last working date has passed but who has not yet been moved to `TERMINATED` (the automatic transition is an S2 job; IT can terminate manually in S0) is **not** blocked by a date rule. The gap is covered operationally by a list, not by a new permission rule.

Interaction found while designing: the last-Super-Admin guard (`QĐ-39c`) counts accounts with status `ACTIVE` and an active `SUPER_ADMIN` grant. Once terminated holders are blocked, such an account can no longer act, yet it would still be counted. Two Super Admins locking each other concurrently while a third, terminated Super Admin exists would both succeed and leave no usable Super Admin.

## Decision

1. **Effective roles** (replaces the sentence in ADR-0006 §2):
   effective roles = active direct grants
   \+ `MANAGER` **iff** the employee has a direct report whose manager period contains today (organization time zone) **and** the account holds no active `SUPER_ADMIN` grant
   \+ approval kinds from `approval_role_holders` (when that table exists; never for a Super Admin — `QĐ-39b(2)`, enforced on write in WP-03).
   `GET /me` returns `isManager = false` for such an account. Nothing in the organization tree changes.
2. **Access check order** in `ResolvePrincipalService` (every authenticated request, after token verification):
   1. resolve the account through `identity_links` (or the tier-2 first-sign-in path);
   2. account `LOCKED` ⟹ `403 ACCOUNT_LOCKED` (explicit administrative state wins);
   3. linked employee `status = TERMINATED` ⟹ `403 ACCOUNT_HOLDER_TERMINATED`;
   4. compute effective roles; `@RequireRoles` runs after.
      The employee status is read through the `organization` facade in the same request (no caching), so a valid access token issued before the termination is refused on its next use.
3. **First sign-in (ADR-0006 tier 2)** checks the employee status inside the locking transaction: a terminated employee's unlinked account gets `403 ACCOUNT_HOLDER_TERMINATED`, and **no** link and **no** audit row are written.
4. **"Active Super Admin" means usable**: account `ACTIVE`, active `SUPER_ADMIN` grant **and** employee not `TERMINATED`. The last-Super-Admin count uses this predicate.
   **Every account write** (create, lock, unlock, grant, revoke, bind identity) first takes the per-organization advisory lock already used for the Super Admin set — today only lock/unlock/grant/revoke take it; create and bind are added so that all account writes serialize in one order and cannot deadlock on each other's rows — then re-reads the **actor** (account status, active grants, employee status) inside the transaction and refuses with `403 ACCOUNT_LOCKED` / `403 ACCOUNT_HOLDER_TERMINATED` / `403 FORBIDDEN` if the actor is no longer a usable Super Admin. This closes the window between the guard's check and the write. The actor's `app_users` and `employees` rows are read `FOR SHARE`, and handover/termination (WP-04) take the same Super Admin advisory lock before locking the employee row, so a concurrent termination of the actor is serialised with the account write (lock order: `docs/architecture/s0-core-design.md` §2.2).
5. **Reminder to lock** (S0 part of `QĐ-39d`): `GET /app-users` accepts `employeeStatus` (`ACTIVE`, `LONG_LEAVE`, `TERMINATED`) so a Super Admin can list `status=ACTIVE&employeeStatus=TERMINATED`, and the app-user read model exposes `requiresLock = (status = ACTIVE ∧ employee.status = TERMINATED)`. The pushed notification belongs to the notification slice (C8) and is **not** built here. A separate IT-facing list "in handover, last working date passed, not terminated" belongs to the organization slice (WP-04) as an operational aid; it changes no permission.
6. **Not changed:** Super Admin operations on a terminated holder's account (lock, view, revoke) stay allowed; unlocking such an account succeeds but the account stays blocked by rule 2.3. No automatic status change of the account; no automatic seat reclaim (`SoD-6`).

## Error contract

| Code                        | HTTP | When                                         | `details`                                                |
| --------------------------- | ---- | -------------------------------------------- | -------------------------------------------------------- |
| `ACCOUNT_HOLDER_TERMINATED` | 403  | rule 2.3 or 3; also actor re-check in rule 4 | none (the caller is the subject; no other person's data) |

Guard-level, unprefixed, like `ACCOUNT_LOCKED`. Denials are logged at `warn` with `appUserId` and reason only — no e-mail, no token.

## Consequences

- Account writes of one organization are serialized (low volume; acceptable).
- One more indexed read per request when the organization facade cannot return employee status and direct-report existence in one call; WP-01 adds such a call (`getPrincipalContext`).
- No schema change and no data migration: no approval step exists yet (C4 not built), so no task is assigned to a Super Admin or to a terminated person.
- C4 must route the need-step of a Super Admin's reports to that Super Admin's manager (or the root fallback approver) and re-determine pending steps when manager periods change (`US-05-12`); blocking an account does not by itself reassign anything. Recorded for the C4 design.
- `LR-15` (no usable Super Admin left, e.g. the last one was terminated) is **not** solved here: termination is an IT action and `QĐ-39c` does not apply to it. WP-04 adds a warning. Recovery **cannot** use the bootstrap seed, which runs only when no organization exists; it is a separate offline procedure specified as WP-11 in `docs/architecture/s0-core-design.md` (no API endpoint, no authentication bypass). Per `QĐ-41b` the Owner approves in writing and an infrastructure operator runs it; on a shared environment approver ≠ operator and recipient ≠ operator; WP-11 must be verified before flows that can remove the last usable Super Admin are deployed to a shared environment. WP-11 does not block WP-01.
