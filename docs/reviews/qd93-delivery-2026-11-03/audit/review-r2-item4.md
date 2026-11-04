# Review r2-item4 — qd93-direct-manager-spending-approver-roles (10e4a56d..99b7234e)

Skills read/used:
- `code-review-and-quality` (C:\Users\Asus\.claude\skills\code-review-and-quality\SKILL.md) — five-axis review method, severity labels (domain/review skill, required by the brief).
- `superpowers:verification-before-completion` — every claim below is backed by a file:line I read; no test was run (brief: read-only, no pnpm). Process skill mapping: the brief itself is the process (read spec/plan → diff → findings).

Method: read spec.md, plan.md, QĐ-93b/d text, both migrations, every production file in `src/modules/identity-access/{access,accounts,approval-roles,public}`, the three rule-10 listeners, `department-head.service.ts`, `transfer.policy.ts`/`transfer-guard.service.ts`, `organization-history.api.ts` (head-period writers), CLI refusal mapper, demo dataset steps, preflight repo/policy; diffed `test/**` deletions against commit messages (1013155e, c5594eac, e7d3a935) and the implementer log. All file:line refer to revision `99b7234e`.

## Verified correct (no finding)
- Rule order #1→#12 in `account-status.service.ts:139-223` + `spending-approver-grant.service.ts:32-47` matches the spec table; DB 23505/23514 mapped by constraint name (`account-constraints.errors.ts:14-29`), revoke wrapped (no 500).
- Lock protocol: SPENDING_APPROVER grant/revoke = advisory → employee FOR SHARE → account FOR UPDATE (`account-status.service.ts:112-123`), same order as `ApprovalRoleService.set` (`approval-role.service.ts:~89`). Head assignment = department FOR UPDATE → employee → account FOR SHARE then roles read in a separate statement (`account-record.service.ts:171-176`, `department-head.service.ts:274-295`). Revoke MANAGER = account FOR UPDATE then periods. All races (grant/revoke ↔ head/successor/transfer) serialize on the `app_users` row; no lock cycle found. `valid_to` is exclusive everywhere (repo, triggers, `headPeriodsFrom`), so "heads today or later" is consistent.
- Only two head-period writers exist (`DepartmentHeadService.startHeadPeriod` and `OrganizationHistoryApi.scheduleHeadHandover`); both are gated by `requireCandidate` / `successorRefusal` with SPENDING_APPROVER before MANAGER.
- Principal: `authorizingRoles` drops MANAGER unless heading today (`effective-roles.policy.ts:9-11`); verifier reads head period only when MANAGER is granted; `/me` = `directRoles` + `managerScope` (only when `principal.roles` has MANAGER) + `selfServiceOnly = roles.length === 0` (D-S19). No authz path reads `directRoles`.
- Migrations: empty-DB safe; enum values split; guard (a)–(d); unique index + three triggers as spec.
- Demo dataset: MANAGER granted before head assignment, SPENDING_APPROVER via role-grants, DS1-CEO is not a head.

## Findings

### High
H1. Deleted the only test of a KEPT SoD-8 check (decide-time "reviewer is the approver").
- Code kept: `src/modules/requests/budget-information/spend-effects.service.ts:39-43` (`refuseReviewer` → `SPEND.REVIEWER_IS_APPROVER`, used by spend decision and group-line decision).
- Test deleted in 1013155e: `test/integration/requests/spend-awaiting-budget.integration-spec.ts` (old 10e4a56d:299-356, "refuses the person who completed the review … when they decide its spend step (SoD-8, the other direction)"). After the change no test in `src/**/*.spec.ts` or `test/**` exercises `refuseReviewer` (grep `REVIEWER_IS_APPROVER` in test: only the OpenAPI example registry; `finance-review.policy.spec.ts:91` covers only the review-time direction).
- Why the deletion rationale ("SoD-8 now at the role layer", QĐ-93b) is wrong: the case is temporal, not simultaneous. Finance person F completes the review → Super Admin revokes FINANCE → grants SPENDING_APPROVER to F (rule 4 passes, rule 10 does not count a reviewer) → `ApprovalRoleChange` assigns the pending spend step to F → only `refuseReviewer` stops F. Still reachable through the public routes.
- Same pattern, lower impact: `budget-decisions.integration-spec.ts` (old ~397) "is not the person who built and sent the version" (`BUDGET.OWN_VERSION`) deleted; rule kept in `budget.policy.ts:149`, only unit-covered (`budget.policy.spec.ts:244-245`), integration wiring no longer tested.
- Fix: rewrite both cases with the real path (revoke FINANCE, grant SPENDING_APPROVER via role-grants, no SQL on step assignee) and keep the assertions (409 `SPEND.REVIEWER_IS_APPROVER`, step still PENDING; 403 `BUDGET.OWN_VERSION`). Confidence: verified by reading.

### Medium
none.

### Low
L1. `createAccount` refuses a forbidden role set with an empty `conflictingRoles`: `account-invitation.service.ts:55` throws `new RoleCombinationForbiddenError()` though `forbiddenPairInSet` already knows the pair; spec rule #4 / US-01-03 AC-11 want "kèm vai xung đột". Fix: pass the pair's first role (or the conflicting roles) to the error. Verified.
L2. OpenAPI text of `DELETE /app-users/{id}/role-grants/{role}` 422 (`app-users.controller.ts:393`) says "or the person cannot be the spending approver (employee not working, account not usable, the substitute)" — copy of the grant text; revoke never returns those. Fix: keep only the SUPER_ADMIN sentence. Verified.
L3. Dead production code: `forbidsCombination` (`account-administration.policy.ts:40-42`) has no caller left in `src` (was used by `account-status.service.ts` at 10e4a56d); only its spec uses it. Fix: delete function + spec block, or use it. Verified.
L4. No concurrency test for grant SPENDING_APPROVER ↔ head assignment/successor of the same person (rule 9 vs `requireCandidate`). Only one direction has a DB backstop (`role_grants_spending_approver_not_head` on insert of the grant); a head period written after the grant has none and relies solely on the account-row lock. Lock reasoning is sound by reading; add both commit orders to `direct-approval-roles-concurrency.integration-spec.ts`. Offboarding-successor ↔ revoke MANAGER race is likewise untested (shares the transfer code). Suspected gap in coverage, not a code bug.
L5. `ServiceAccountSpendingApproverGrantCheck.blockersOf` reads plan labels with `catalog.getPlanSummaries(...)` outside the grant transaction (`licensing/assignment/service-account-duty/spending-approver-grant.listener.ts`) while the grant holds advisory + row locks — a second pool connection per grant. Nit; pass `tx` if the API allows.

## Not reported (accepted / out of scope)
Grant 201 / revoke 200; PUT /approval-roles, FALLBACK_APPROVER, CONFLICT_SUBSTITUTE still present (item #6); no Request-creation block (item #6 phase A); data-conversion edge cases (empty DB per Owner); lint-debt ceilings 54→53/113→112 explained by the pruned `approval-role.service` suppression; deleted cases whose premise is "approver heads a department / holds IT_ADMIN" (commit c5594eac, 1013155e) other than H1.
