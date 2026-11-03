# qd93-remove-hr-basis-org-writes — verify phase A (02/11/2026)

Verifier (not implementer). Repo BE, branch `feat/qd93-remove-hr-basis-org-writes`, verified HEAD `e5670a6a` (parent dev `03da6c4f`).
Evidence commit: `164f6e67` (plan.md only).

## Skills read/used
- superpowers:verification-before-completion — evidence before claims (process/verification).
- code-review-and-quality — spot-check diff vs spec/plan, test loosening (domain/review).
- git-workflow-and-versioning — single scoped commit of plan.md (process).

## Commands (real)
| Command | Exit | Counts | Log |
|---|---|---|---|
| `pnpm check` (no TEST_DATABASE_*/BOOTSTRAP_ env) | 0 | rules 0 errors; rules:test 38/38; unit 327 suites / 4453 tests; gates 16 / 326; depcruise 0 violations (1597 modules); arch:docs ok; test:scripts 272 pass / 0 fail / 2 skipped; discovery ok; build ok | A-qd93-remove-hr-basis-org-writes-verify-check.txt |
| `pnpm rules:check` | 0 | 411 files, 3339 links, 0 errors | A-qd93-remove-hr-basis-org-writes-verify-rules.txt |
| `pnpm openapi:export` + git status | 0 | no drift | A-qd93-remove-hr-basis-org-writes-verify-openapi.txt |
| `prettier --write plan.md`, `pnpm rules:check`, `pnpm rules:format` after edit | 0 | 0 errors | — |

Not run in phase A: test:http per file, test:integration per file (implementer log claims green). Deferred to phase B: full test:integration, test:integration:timing, test:e2e.

## Static checks
- openapi.json dev...HEAD: changed exactly the 10 operations + their 10 body DTO schemas; nothing else.
  hrBasis absent in all 10; present only in projectCreate/projectUpdate (in scope for sibling item).
  departmentCreate/Update name.maxLength 200, function.maxLength 1000 (dev: 1000/5000).
  409 DEPARTMENT.INACTIVE added to departmentUpdate, departmentHeadAssign, departmentSuccessorDesignate.
- personnel module untouched; profile-correction.service.ts:70 keeps after.hrBasis (CLI QĐ-87c(4)).
- Remaining hrBasis refs: project/**, hr-basis.dto.ts/types, test/support/hr-basis.ts, department-harness /projects, stale-body 422 cases. demo-dataset has no `basis`.
- No eslint-disable / ts-ignore / .skip / .only added; no migration; merged-migrations.txt untouched.
- Test case counts per file never decrease (4 files grow).

## Per task
- 1.1 done (466eab58) — new 409/no-change cases live in department-profile-http (:197, :276, :440) and department-head-http (:254, :370, :411), not department-contract-http as the plan listed (contract spec only drops hrBasis from expected audits). Behavior covered.
- 1.2 done (db95c09c, 6a4133b1). 1.3 done (a03c2884; /employees parts finished in 2.3). 1.4 done (9f5d8c13).
- Checkpoint 1: partial (check green; per-file http/integration not re-run by verifier).
- 2.1 done (d2178b0a). 2.2 done (86d78bbe). 2.3 done (9f1eb76a). 2.4 done (e5670a6a).
- Checkpoint 2: partial (same reason + phase B deferrals).
- Verification/handoff: partial — plan header still `Triển khai: not-started`, spec `draft`, Test matrix evidence column `planned`, roadmap not updated.

## Findings (no code changed by verifier)
1. FYI/Owner: test/http/platform/openapi-request-rules.http-spec.ts:78 lower bound of request date leaves lowered 96 → 92. Justified by spec (10 `hrBasis.issuedOn` leaves gone; `format: date` occurrences 119 → 109), but it is a loosened numeric assertion — Owner should acknowledge.
2. Doc gap: plan.md:8 `Triển khai: not-started`, spec Test matrix `planned`, spec status `draft` — implementer did not update (owner-side per their log).
3. Spec wording: spec.md:186 says `PATCH {}` ⟹ 200 no audit; code/test (pre-existing) answer 422 DEPARTMENT.UPDATE_EMPTY (department-profile-http :210). Not a regression; spec text should be corrected.
4. Plan file placement deviation for Task 1.1 (see above) — cosmetic.
