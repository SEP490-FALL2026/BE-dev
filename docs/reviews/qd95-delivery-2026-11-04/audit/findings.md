# QĐ-95 / seed / CI audit — findings ledger

Base: Codex tip `5e42e186` (`feat/unified-seed-reset`). Fix branch: `fix/qd95-seed-audit` (worktree `Code/BE-qd95-audit`).
Full run w1 on `5e42e186`; summaries of w1/w2/w3 are in [README](../README.md#kiểm-chứng) (raw logs not kept).

## CI + self-service reviewer (verified by orchestrator before fixing)

| ID  | Sev     | Tag      | Item                                                                | Fix                                          |
| --- | ------- | -------- | ------------------------------------------------------------------- | -------------------------------------------- |
| A1  | Medium  | CODE     | concurrency group keeps 1 pending run → pending push runs cancelled | group unique per run for non-PR              |
| A2  | High    | CODE     | ci-trial probe needs e2e-smoke skipped on push                      | trial note: dispatch run (branch not merged) |
| A3  | Low     | CODE     | select fails if BASE missing                                        | fall back to ALL                             |
| A4  | Low-Med | CODE     | in-band starts for any paths                                        | emit timing flag                             |
| A5  | Low     | CODE     | SKIP_DEPLOY_DEV skips dispatch                                      | add event_name == push                       |
| A6  | Low     | CODE     | fetch-depth 0 on shard/in-band                                      | drop                                         |
| A7  | Low     | TEST     | structure test misses select/concurrency/PR filter                  | add asserts                                  |
| A8  | Low     | DOC      | spec/plan status                                                    | update                                       |
| B1  | High    | TEST     | requests-dashboard-facts expects null for SA                        | expect 0                                     |
| B2  | High    | FORMAT   | self-service plan table not prettier                                | prettier                                     |
| B3  | Medium  | CONTRACT | employee dashboard DTO description NO_DATA_SOURCE for SA            | reword + openapi                             |
| B4  | Medium  | TEST     | no non-zero AC-27 assertion                                         | add                                          |
| B5  | Low     | TEST     | scoping only on access-requests                                     | add                                          |
| B6  | Low     | DOC      | module READMEs                                                      | update                                       |
| B7  | Low     | CONTRACT | return 403 example from access-request examples                     | own mapper examples                          |
| B8  | Low     | SPEC     | SA/C1 count may be >0 from old requests                             | keep (own requests), drop unused roles param |
| B9  | Nit     | TEST     | names                                                               | rename                                       |

## Seed reviewer

| ID  | Sev     | Tag  | Item                                                                                                    | Fix                                                                     |
| --- | ------- | ---- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| S1  | High    | CODE | seed.sh trap treats apply failure after successful reset as reset failure; signals after DROP unhandled | RESET_DONE flag; trap on any non-zero while DROP_STARTED && !RESET_DONE |
| S2  | Medium  | CODE | check exit 1 path may skip secrets validation before wipe                                               | check prints SECRETS ok; wrappers require it                            |
| S3  | Medium  | CODE | seed-local SHARED guard only for reset; fails open                                                      | refuse migrate/apply/reset when SHARED or unknown                       |
| S4  | Medium  | CODE | --allow-bootstrap writes before proving API target; later refusals exit 3                               | probe API before bootstrap; post-bootstrap refusal → exit 1             |
| S5  | Medium  | CODE | seed-local hides diagnostics                                                                            | Refusal messages, print check output, forward stderr                    |
| S6  | Med-Low | CODE | seed.sh report misses stderr/header/status                                                              | 2>&1, header, status                                                    |
| S7  | Low-Med | CODE | NOT_MIGRATED path skips reconcile/restart/ready                                                         | reuse steps                                                             |
| S8  | Low-Med | CODE | seed-local leaks passwords into child env                                                               | strip SEED_* and derived keys                                           |
| S9  | Low     | CODE | POSTGRES_DB from .env vs container                                                                      | use container value, assert match                                       |
| S10 | Low     | CODE | lock opened with exec 9> (truncate, symlink)                                                            | copy deploy-release lock logic                                          |
| S11 | Low     | CODE | compose calls inherit stdin                                                                             | </dev/null                                                              |
| S12 | Low     | CODE | missing current-image → exit 1; .partial left                                                           | refuse 3; cleanup partial                                               |
| S13 | Low     | CODE | seed-local doesn't strip `--`; SIGINT code overwritten                                                  | fix                                                                     |
| S14 | Low     | CODE | bootstrap ignores runInNestContext result                                                               | check result                                                            |
| S15 | Low     | CODE | seedState holders:1 hard-coded                                                                          | use real count                                                          |
| S16 | -       | TEST | missing matrix rows                                                                                     | add key ones                                                            |
| S17 | -       | TEST | rule-2 gate always passes                                                                               | slice main                                                              |
| S18 | -       | TEST | fragile tests (serial order, year 2026)                                                                 | fix                                                                     |
| S19 | -       | SPEC | R2 planLine changed without QĐ                                                                          | revert to off-plan                                                      |
| S20 | Low     | DOC  | leftovers/dead code                                                                                     | clean                                                                   |

## One-role reviewer

| ID  | Sev     | Tag      | Item                                                                                  | Fix                                                            |
| --- | ------- | -------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| R1  | Blocker | TEST     | 28 provisioning-grant `.expect(201)` changed to 200 in 22 files                       | restore 201                                                    |
| R2  | High    | TEST     | audit-query-http newAccount sends roles[]                                             | send role                                                      |
| R3  | High    | TEST     | mobile-session-roles :186 :482 send roles[]                                           | send role; drop duplicate case                                 |
| R4  | High    | TEST     | account-invitation-constraints expects combination trigger                            | expect 23505 one_role index; finally restore SA; drop 3rd test |
| R5  | Medium  | TEST     | dev-seed integration expects role (now initialRole) — file deleted later by seed item | check at tip                                                   |
| R6  | Low     | TEST     | helpers take arrays use roles[0]                                                      | role?: string                                                  |
| R7  | Medium  | SPEC-GAP | US-03-06 IT_ADMIN/FINANCE head/successor tests missing                                | add                                                            |
| R8  | Low     | SPEC-GAP | AC-23 creation rows (FINANCE 409, roles 422 http, MANAGER no head period)             | add                                                            |
| R9  | Low     | SPEC-GAP | AC-21 successor → EMPLOYEE/SA; AC-17 spend refused; DS1-ITOH head check               | add                                                            |
| R10 | Low     | CODE     | revokedAt Node time vs granted_at DB default                                          | one DB now for both                                            |
| R11 | Low     | CODE     | SpendingApproverHeadsDepartmentError dead                                             | delete check+mapping                                           |
| R12 | Low     | TEST     | raw SQL leaves zero-grant accounts                                                    | fix via changeRole                                             |
| R13 | Low     | TEST     | duplicated/stale test titles                                                          | fix                                                            |
| R14 | Low     | DOC      | stale comments, README lock order                                                     | fix                                                            |

## w1 results (5e42e186)

- http: 1 fail — openapi-presentation expects 312 ops, now 311 → update constant.

## Fix status (branch fix/qd95-seed-audit, local commits)

| Commit   | Scope                                                                                                                    |
| -------- | ------------------------------------------------------------------------------------------------------------------------ |
| fb6caebb | A1–A7 CI                                                                                                                 |
| effd28f0 | R1–R4, B1, w1 red tests (201, role bodies, 23505 index, SA count 0, seed test setup, openapi 311)                        |
| 41f361c8 | S1–S14 wrappers + seed CLI; S17 gate slices main                                                                         |
| f155a51f | S20 docs/rules Vietnamese, dead findByCode helpers, retention header                                                     |
| 4451534d | B3 DTO+openapi, B4 AC-27 non-zero, B5 software scoping, B6 READMEs, B8 employeeId param                                  |
| a893ce57 | R10 one timestamp (change-role + SA transfer), R7 IT_ADMIN/FINANCE head+successor, R8 creation rows, R13 harness comment |

Closed without change (reason):

- S15 holders:1 — DB unique index allows at most one effective SUPER_ADMIN; value exact when a holder exists.
- S18 year literals — seed-calendar fakes Date; deterministic regardless of real date. Serial order within a file is Jest default.
- S19 R2 planLine — own spec OD-S5 says R1/R2 carry planLine; Codex fix conforms; reviewer wrong.
- B2 — rules:format already green.
- B7 — ACCESS_REQUEST_ERROR_EXAMPLES is shared by 9 request controllers; same pattern.
- R5 — dev-seed test file deleted by seed item.
- R6 — test helper array signature: style only.
- R9 — AC-17 covered (mobile-session-roles MANAGER/IT_ADMIN; QĐ-93 approver suites); AC-21 covered (account-role-change).
- R11 — SpendingApproverHeadsDepartmentError kept as mapping of DB trigger role_grants_spending_approver_not_head (backstop).
- R12 — zero-grant raw SQL only in constraint tests.
- S3 exit-1 local reset kept per Owner spec (schema unreadable), now gated by SECRETS ok.

Env note: scripts/verify/bootstrap-installation.test.mjs template test red locally only: worktree checkout CRLF (core.autocrlf=true); HEAD content LF; CI Linux unaffected.

## w2 (a893ce57) + w3 results

- w2 targeted: build ok; http 3/4 (openapi leak of "QĐ-95d" in my own DTO text → fixed b873ff1a, w3 rerun 13/13); integration 40/40 suites, 457 tests; serial seed-check-runtime 3/3; e2e 2/2.
- w3 pnpm check: rules/format/prisma/lint/typecheck/unit 343 suites 4558 tests/gates 16 suites 325/arch/arch docs green; test:scripts 302/306 pass, 2 fail = env only (CRLF checkout of .env.bootstrap.example; includes('BOOTSTRAP_') matches runner-exported TEST_DATABASE_BOOTSTRAP_URL); test:discovery + build green.
- Missing anchor (shared-demo-dataset spec → demo-dataset.md#1-…) fixed in 9d2e3cd7.
