# QĐ-93 remaining (Gemini) — findings ledger (03/11/2026 evening)

Branch `fix/qd93-remaining-audit` (worktree `BE-qd93-audit2`) from Gemini `7102293e`, base `dev` `30d14ac4`.

## My own read (migrations)
- 20261103120000 + 130000: INV-20 trigger BEFORE DELETE keeps the last placement; exception only for a future
  placement referenced by a non-cancelled offboarding case (D-S17). Concern: an employee row delete cascading to its
  placements would be refused — check if any path deletes employees (tests/cleanup).
- 20261103140000/140100: attachment kinds + table/guard trigger follow the spec closely (shape check rebuilt with `"kind"::text`).
- 20261103160000: rewritten super-admin function = previous definition minus the approval-role branch ✔; guards raise P0001 ✔.
- 20261103160100/160200: draft JSON cleanup + drops ✔ (path `policy->'draft'` to confirm).

## V2 — dashboard (r2-review-v2.md)
| ID | Sev | Finding | Decision |
|---|---|---|---|
| V2-H1 | High (report) | Gemini report invents Super Admin fields; code wires the right Employee `requests` / Manager `needApprovals` | Note in final report; code OK |
| V2-M1 | Medium | OpenAPI/DTO texts still say "not available" (4 places) | FIX + openapi:export |
| V2-M2 | Medium | Tests would not catch a wrong filter (no closed/withdrawn/on-behalf/own-request cases; ">0" relies on other describe) | FIX: exact-count cases |
| V2-L1..L8 | Low | misplaced JSDoc, dead guard, stale comments, spec status | FIX cheap ones (L1, L3, L4, L6) |

## V4a — attachments business/contract (r2-review-v4a.md)
| ID | Sev | Finding | Decision |
|---|---|---|---|
| V4-B1 | Blocker | raw `SELECT *` in repo lock/lockManyAsc/pageByVersionAsLastSent/findExpiredCandidates → snake_case keys, toRecord reads camelCase → uploader never matches (head cannot send with files), remove/discard 404, sweeper TypeError, head list 500. VERIFIED by me (repo.ts:47-63) | FIX: lock ids with SELECT id … FOR UPDATE then Prisma read; findMany for page |
| V4-B2 | Blocker | proposal submit/resubmit map errors with toBudgetApiException → NOT_ATTACHABLE becomes 500 | FIX: toBudgetAttachmentApiException in both catches |
| V4-H1 | High | new integration tests assert `uploadToken` (field never returned) → cannot pass, never run | FIX tests |
| V4-H2 | High | AC rows untested: US-06-10 AC-15/16, US-06-11 AC-11, AC-25 partial, D-S24 removed-before-send + resend, limits, 503, link expiry | FIX key ones (D-S24, AC-15, AC-11, AC-16) |
| V4-H3 | High | sweeper SKIP LOCKED outside tx → waits on locked rows | FIX: candidate select + lock inside tx with SKIP LOCKED |
| V4-M1 | Medium | final copy under `documents/` prefix, spec `budget-documents/` | FIX |
| V4-M2 | Medium | failed completeProposal leaves final copy; temp upload never removed | FIX if cheap |
| V4-M3 | Medium | `.gitattributes` `-text` line for samples required by spec missing; GATE-EOL test allows only openapi.json → conflict | DECIDE: keep GATE (Owner), make sample test eol-independent |
| V4-M4 | Medium | quarantine/expire during complete without row lock (suspected) | check |
| V4-L* | Low | state free string, contentType case, UPLOAD_EXPIRED code, sweep limit 50 vs 100 | FIX cheap |
| Report | — | Gemini report false on routes/tables/virus scan/sha256/quota | note |

## V4b — attachments security/data (r2-review-v4b.md)
Confirms V4-B1, V4-B2. Additional:
| ID | Sev | Finding | Decision |
|---|---|---|---|
| V4b-H2 | High | index name `budget_attachments_uploaded_by_status_created_at_idx` ≠ Prisma default → CI `migrate diff --exit-code` fails (suspected strongly) | FIX: `map:` in schema or rename in migration (migration not deployed yet) |
| V4b-M1 | Medium | complete flow: quarantine/expire without lock (500 on race); PROPOSAL path leaves orphan copy on failure; VERSION path withdraws copy unconditionally even if DB committed; pending upload not deleted | FIX: follow catalog document completion pattern |
| V4b-M2 | Medium | no IDOR tests (other CC head on proposal list/link, Employee/IT on link, other manager on UPLOADED file, SA on writes) | FIX: add IDOR integration cases |
| V4b-L* | Low | scope 'documents' vs 'budget-documents'; sweep limit 50; SKIP LOCKED claim; dup constant; contentType casing; discard deletes one key; mapper attachedAt fallback | FIX cheap ones |

## V5 — legacy removal (r2-review-v5.md)
| ID | Sev | Finding | Decision |
|---|---|---|---|
| V5-B1 | Blocker | kept integration suites still use dropped table / removed 409: qd93-role-migration (applied() all migrations → guard trips), step-reassignment-paid, spend-approval (STEP_AWAITING_CONVERSION), reassignment-harness, dev-seed, direct-approval-roles(+concurrency) read approval_role_holders | FIX tests (migration test deploys `through:` its migration) |
| V5-B2 | Blocker | unit need-decision-queue.mapper.spec expects 'legacy' text; mapper null-branch dead | FIX |
| V5-H1 | High | guard misses spec (iii) pending spend step held by someone never granted SPENDING_APPROVER, and (i) open request with SA as party; message lists no rows | FIX guard (string_agg like 20261102082906) |
| V5-H2 | High | migration test regex matches migration name (vacuous); no legacy-reason / row 3-4 / row-4 NO_DEPARTMENT_HEAD-not-blocking cases; SA case passes even if function not rewritten | FIX tests |
| V5-M1 | Medium | SPENDING_APPROVER_IS_PARTY half removed: still written by spend-routing; guard treats as legacy | FIX: it is a CURRENT reason → drop from guard list |
| V5-M2 | Medium | REWAIT removed — but spec keeps REWAIT as everyday rule (plan note "REWAIT/đóng băng Task 3 giữ nguyên"); my addendum wrongly said remove REWAIT | FIX: restore REWAIT (not freeze); restore its unit test |
| V5-M3 | Medium | project_label / projects drops have no guard (rule 6) | FIX: guard RAISE if rows exist |
| V5-M4 | Medium | Task 2.3 docs (containers.md deploy condition, stale lines) | FIX docs |
| V5-L* | Low | unused IdentityAccessApi injection, stale comments; rows 3/4/8 throw (unreachable) | FIX cheap |

## V1 — small fixes (r2-review-v1.md)
| ID | Sev | Finding | Decision |
|---|---|---|---|
| V1-M1 | Medium | XLSX size guard bypassable (lying sizes; entry count 0) — reproduced: 815 KB → 800 MB inflate | FIX: walk CD by signature, count match, reject ZIP64/multi-disk, pre-inflate each entry with zlib maxOutputLength; unit tests |
| V1-L1 | Low | preview 422 example uses SPENDING_APPROVER (preview only throws UNPLACED) | FIX example/description |
| V1-L2 | Low | OpenAPI upload 422 lacks UNCOMPRESSED_SIZE_EXCEEDED/20 MB | FIX |
| V1-L3 | Low | seat-baseline uppercase test does not cover lookupNamesOf | FIX test |
| V1-L4 | Low | directory page-past-end asserts >=; not.toContain only page 1 | FIX tests |
| V1-Nit | — | escapeLikePattern placement, BOM in script | FIX cheap |
| Report | — | claims (template route, BOM export, INV-20 check, sort regex, separate policy file) false | note |

## V3 — unplaced offboarding (r2-review-v3.md) — no Blocker
| ID | Sev | Finding | Decision |
|---|---|---|---|
| V3-H1 | High | email-outbox.integration-spec:137 changed to `/activate-account#token=` but code builds `/activate#token=` (unrelated, unreported) | FIX: revert assertion |
| V3-M1 | Medium | direct-roles-world.clearPeople deletes all placements → new trigger 23001 in direct-roles-preflight afterEach | FIX |
| V3-M2 | Medium | code `EMPLOYEE.EMPLOYEE_LEAVING` vs spec `EMPLOYEE.FIRST_PLACEMENT_EMPLOYEE_LEAVING`; family already differs from spec | KEEP family naming (EMPLOYEE.ALREADY_PLACED, EMPLOYEE_INACTIVE, EMPLOYEE_LEAVING); document deviation; fix 409 description |
| V3-M3 | Medium | "no head duty" test vacuous (no seat) | FIX: seat + openFromTask + lock + mark-left |
| V3-M4 | Medium | missing: last day == validFrom & normal flow after; trigger refuses today/past; unplaced IT Admin leaving → ROLE_HOLDER_LEAVING; IT Admin empty scope | FIX key ones |
| V3-M5 | Medium | placement-coverage check weakened; A.2 cases missing | FIX: restore + cases |
| V3-L* | Low | dead EMPLOYEE_UNPLACED codes, unused getUnplacedEmployeeIds, no FIRST_PLACEMENT_PENDING example, READMEs, empty-string departmentId placeholder, inspect test finally, no-op SELECT 1, 50 ms sleep | FIX cheap |

## Baseline full run on 7102293e (r1b, 19:20→20:09)
integration 43 failed suites / 150 tests (of 322); e2e 11/11, timing 7/7, serial 11/11 pass; test:http 62/62 (r1); check: rules:format fails on scripts/README.md (prettier).
Real failures beyond the reviews, assigned:
- unit-only-upgrade-history (schema drift code 2), budget-rejection-compatibility (draft not detached after withdraw), budget-lifecycle-guards (resubmit 404 instead of 409) → attachments fixer.
- employee-manual-http, employee-import-confirm-http (placement-coverage check weakened; 22 violations) → offboarding fixer.
- approval_role_holders / STEP_AWAITING_CONVERSION suites → legacy fixer; email-outbox → offboarding fixer.
Load-related (TransientDatabaseError / timeouts / lock-wait): budget-notices, transfer-review-still-needed, long-leave-return, mobile-inbox-isolation, step-sla-finance-question, license-key-reveal-quota, department-use-subscriptions, return-request-handover, offboarding-self, personnel-department-open-work, request-timings, offboarding-integrity, group-request-supplement, job-title-lifecycle-migration, installation-minimal-env, migration-setup, demo-dataset-rerun/calendar, cost-center-direction-cli, subscription-owner-*, spend-decision-constraints (503), request-status-projection, direct-approval-roles-transfer-concurrency → rerun at low concurrency after merge.
- scripts/README.md prettier → fix at merge.

## Fix round (03/11 20:00–21:45)
- Fix branches merged: fix/r2-small a0a446a3, fix/r2-offboarding f5221512, fix/r2-legacy 00a2b0aa, fix/r2-attachments 53c0ca98 → merges aac9ad27, 1118314c, 92d2b102, e8df21a4; prettier effea964; re-review lows 45d44b78.
- Re-review (r2-review-refix.md): every original Blocker/High fixed in code; no new Blocker/High/Medium; 5 Lows → 4 fixed in 45d44b78, #5 (assertion for a spend-step holder without grant) not added: unreachable after Phase B guard (iii).
- Judgement calls accepted: guard does not block on approval_role_holders rows (nothing on dev writes the table; a row could never be closed); no `.gitattributes -text` (GATE-EOL=A), samples test EOL-independent; `EMPLOYEE.EMPLOYEE_LEAVING` kept (logged in spec); REWAIT restored; proposal.service = base + ProposalSender.
- Run r2 (20:52): test:http 62/62 (1 510), unit 4 610, gates 327; integration aborted at 21:09 — Docker Desktop backend died (API 500), all later files "Cannot provision a disposable database". Docker restarted 21:40; final run r3 started.
