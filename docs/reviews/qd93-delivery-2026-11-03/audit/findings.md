# QĐ-93 audit — findings ledger (orchestrator, 03/11/2026)

Fixes go on `fix/qd93-final` (worktree `D:\FPT\FALL2026\Code\BE-qd93-audit`) ONLY after the background full run
(`qd93-logs/audit/w1w2/summary.log` shows ALLDONE) — editing sources mid-run corrupts it.

## r1 — items #1–#3 (review-r1-items1-3.md)
| ID | Sev | Item | Finding | Decision |
|---|---|---|---|---|
| A-01 | High→N/A | #2 | Deleted transfer HTTP spec covered trigger approval-role half + `APPROVAL_ROLE_HELD`/`HEADS_DEPARTMENT`; restored only in #4 | N/A: the stack merges to dev as one (Owner merges the top branch), no interim dev state. Record in report. |
| A-02 | Medium | #2 | AC-5 concurrency test `super-admin-recovery-role.integration-spec.ts:317` does not force overlap | FIX: hold `FOR UPDATE` on holder row from a separate client, start both, release; mutation-check |
| A-03 | Low | #1 | OpenAPI `departmentDeactivate`/`departmentSuccessorClear` requestBody.required true with `{}` | FIX: optional body; re-export openapi at final tip |
| A-04 | Low | #2 | Stale comments: `successor-eligibility.service.ts:24`, `approval-role-facts.service.ts:8`, `identity-access/README.md:46` | FIX (check against final tip — #6 may have rewritten these files) |
| A-05 | Low | #2 | Lost variants: eligibility long-leave/hand-over; AC-8 holder left ⟹ 401 | FIX if cheap (add cases) |
| A-06 | Nit | #1 | `departmentUpdate` 200 description mentions hrBasis 422 | FIX with A-03 |
| A-07 | Nit? | #2 | `APPROVER_IS_HOLDER` compares typed `--holder-email` only (`recovery-procedure.policy.ts:40`) | VERIFY first |

## r3 — item #5 (review-r3-item5.md) — no Blocker/High/Medium
| ID | Sev | Item | Finding | Decision |
|---|---|---|---|---|
| C-01 | Low | #5 | `plan.md:231` mapping row says floor dropped by one leaf; really 93→91 (two `hrBasis.issuedOn` of project bodies) | FIX text |
| C-02 | Low | #5 | `department-profile-http.integration-spec.ts:50` toMatchObject — no absence check for projects keys | FIX: add `not.toHaveProperty('projects'/'projectTotal')` |
| C-03 | Low | #5 | `api-collection-contract.gate-spec.ts:108-112` stale docstring; no negative fixture for non-closed QĐ finding | FIX docstring; add negative fixture if cheap |
| C-04 | Low | #5 | Stale wording: organization README 4-5,71; `access-request.dto.ts:6,13`; `group-request.dto.ts:25`; `departments.http-spec.ts:12-14`; AC-7 test name/duplicate preview in access-request-preview | FIX (check vs final tip) |
| C-05 | Low | #5 | No guard against `projectLabel` returning to schemas; DoD row for BE-side FE docs (a07 spec 88/90, a09 mobile 155) missing | FIX: add DoD row note; guard optional (skip) |
| C-06 | Nit | #5 | removedByDecision params; draft key comment "QD-93h" no date; codec spec cross-capability import | skip / FIX comment spelling |

## r2 — item #4 (review-r2-item4.md)
| ID | Sev | Item | Finding | Decision |
|---|---|---|---|---|
| B-01 | High | #4 | Only integration test of kept `SPEND.REVIEWER_IS_APPROVER` (`spend-effects.service.ts:39-43` refuseReviewer, SoD-8) deleted in 1013155e (`spend-awaiting-budget` old 299-356); reachable: F reviews → revoke FINANCE → grant SPENDING_APPROVER → step moves to F. Same for `BUDGET.OWN_VERSION` integration case (`budget-decisions`) — only unit left. Orchestrator verified: no test calls refuseReviewer path. | FIX at final tip: rewrite both via revoke FINANCE + grant (role-grants route), old assertions; mutation-check |
| B-02 | Low | #4 | `account-invitation.service.ts:55` ROLE_COMBINATION_FORBIDDEN with empty conflictingRoles | FIX: pass pair from forbiddenPairInSet |
| B-03 | Low | #4 | `app-users.controller.ts:393` revoke 422 text copied from grant | FIX |
| B-04 | Low | #4 | `forbidsCombination` (`account-administration.policy.ts:40`) dead outside spec | FIX: delete fn + spec cases (dead code, test of removed fn) |
| B-05 | Low | #4 | Missing concurrency cases: grant SPENDING_APPROVER vs head/successor naming; revoke MANAGER vs offboarding successor | FIX if time (add to direct-approval-roles-concurrency) |
| B-06 | Nit | #4 | licensing open-work check calls catalog.getPlanSummaries outside tx | skip unless trivial |

## Full run on 3f93c788 (w1w2/summary.log, 00:22→05:35)
- integration: 33 suites / 158 tests FAIL (of 302 / 3703). 9 suites ran ~11 800–12 100 s ⇒ machine likely slept ~3h mid-run → timeouts; run contaminated. e2e 10/10 ✓, timing 7/7 ✓, serial 1 FAIL (database-roles-upgrade-rehearsal, 4458 s), check: 1 unit FAIL (identity-access-inspection.api.spec.ts).
- Rerun of the 33 + serial + unit started 05:40 (w1w2/rerun-summary.log) to separate real failures from sleep timeouts.
- Owner 03/11 ~05:40: #6 Task 12 dropped (N/A, DB mới); extension-wiring exceptions accepted (re-check reason text "emit only for FINANCE" now also SPENDING_APPROVER — stale wording).
