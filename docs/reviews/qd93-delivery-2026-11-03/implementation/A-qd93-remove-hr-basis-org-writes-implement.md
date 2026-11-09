# qd93-remove-hr-basis-org-writes — implement log (continuation run)

Branch `feat/qd93-remove-hr-basis-org-writes` (from dev 03da6c4f).

## Prior run (not this run): tasks 1.1–1.4
- 466eab58 task 1.1 red tests
- db95c09c, 6a4133b1 task 1.2 (DTO/service/audit, schema limits, 409)
- a03c2884 task 1.3 harnesses/specs
- 9f5d8c13 task 1.4 OpenAPI export, manifest, demo dataset (department calls)

## This run
Skills read: test-driven-development (red-green), verification-before-completion (evidence before claims), incremental-implementation (thin slices, commit each).
Env: TEST_DATABASE_ADMIN_URL / TEST_DATABASE_BOOTSTRAP_URL = local slm-test-db (127.0.0.1:55432).

### Phase 1 checkpoint (verification of previous run's work, before Phase 2)
- `pnpm test:http -- test/http/organization/departments.http-spec.ts test/http/platform`: 13 suites / 281 tests pass.
- Task 1.3 integration command 1 (7 files): 129 pass; command 2 (6 files): 90 pass; command 3 (5 files): 100 pass (all exit 0, local test DB).
- `pnpm check` run at the end (see final section). Not run: timing spec / e2e (deferred to phase B, D-S26).

### Task 2.1 red tests
Files: test/http/organization/employees.http-spec.ts, test/http/data-import/employee-imports.http-spec.ts, test/integration/organization/employee-manual-http.integration-spec.ts, test/integration/notifications/employee-maintenance-http.integration-spec.ts, test/integration/data-import/employee-import-wire-http.integration-spec.ts.
Each uses a local HR_BASIS_BODY const (stale body) for the new "body with hrBasis => 422" cases (no import of test/support/hr-basis).
Red: `pnpm test:http -- test/http/organization/employees.http-spec.ts test/http/data-import` => 3 failed (exactly the 3 new hrBasis=>422 cases), 109 passed.
Deviation: the integration specs' own `hrBasis` removals in the head-creation bodies of employee-import-wire spec were done in 2.1 (same file, otherwise it breaks after 2.2); shared harnesses stay for 2.3 as planned.

### Task 2.2 green (employee, employee-import without HR basis)
Files: organization/employee/{employee.dto, employee-manual.service, employee-maintenance.service, employees.controller, employee-maintenance.controller, employee.errors, employee.policy}.ts, employee-maintenance.service.spec.ts, organization/public/organization.types.ts (comment), data-import/employee-import/{employee-import.dto, employee-imports.controller, employee-import-audit.mapper, employee-import.errors, employee-import.policy}.ts, confirmation/employee-import-confirmation.service{,.spec}.ts.
Deviation: test/support/employee-import-service-harness.ts (HR_BASIS export + confirmBody.hrBasis removed) done here rather than 2.3, because the confirmation service spec (in this task's unit verify) consumes it.
Verify: `pnpm typecheck` clean; `pnpm test -- src/modules/organization/employee src/modules/data-import/employee-import` 21 suites / 320 tests pass; `pnpm test:http -- test/http/organization test/http/data-import` 5 suites / 240 pass (the 3 red cases of 2.1 now green).

### Task 2.3 harnesses, demo dataset, specs
Files: test/support/{department-harness (enter()), provisioning-harness (member()), employee-import-http-harness (confirm no longer adds hrBasis; optional hrBasis kept in the body type for the stale-body case)}.ts; integration specs: data-import/{confirm,preview,seats}-http, organization/{employee-kind-of-staff-assignment-end, unit-only-cost-attribution, organization-concurrency, cost-centers-http, department-profile-http (E-LATE employee entry)}, licensing/department-tools-http; identity-access/organization-unavailable.timing-spec.ts and test/e2e/auth-session.e2e-spec.ts (edited, NOT run: deferred to phase B); src/cli/demo-dataset: organization.steps.ts (POST /employees without hrBasis, import of `basis` removed), demo-step-kit.ts (basis() removed), fixture/demo-fixture.types.ts and shared-demo-v1.ts (`basis` field removed); src/modules/{organization,data-import}/README.md (one sentence each: no HR basis since QĐ-93f).
Note: the plan listed some of the unit-only/department-tools/organization-concurrency/cost-centers/department-profile files under 1.3, but their `/employees` calls still sent hrBasis (the previous run could not see it break until employees went strict); fixed here.
First run of the 8-file Verify: 5 suites green, 3 failed on my own new "stale hrBasis => 422" assertion `toContain('hrBasis')`: the wire error is `unrecognized_keys` at path "" and names no key. Corrected my new assertion to `toContain('unrecognized_keys')` (status 422 / VALIDATION_ERROR / nothing written unchanged). Re-run of the 3 files: 74 pass.
Verify (this task): `pnpm test:integration -- <8 files of the plan's 2.3 command>`: first run 121 pass + 3 my-assertion fails; after correction: the 3 failing files 74/74 pass; the other 5 passed in the first run (confirm, preview, seats, kind-of-staff-assignment-end, demo-dataset).
Also fixed a lint error left by 2.2 (`input` parameter of EmployeeMaintenanceService.writeChanges unused): removed param. `pnpm lint` clean, `pnpm typecheck` clean, unit employee suites 63 pass.
`rg -n "hrBasis|HR_BASIS" test src` now leaves: profile-correction.service.ts + super-admin-event-service.integration-spec.ts (CLI), project/** + project.service.spec, test/support/hr-basis.ts, department-harness /projects part, department-manager-and-projects:342, and the intentional stale-body ("HR_BASIS" in department-profile/department-head/department-contract-projects specs and my HR_BASIS_BODY consts). `rg "basis\(" src/cli/demo-dataset` empty.

### Task 2.4 shared types, OpenAPI, docs
Files: src/infrastructure/http/dto/hr-basis.dto.ts, src/modules/organization/public/hr-basis.types.ts (kept, comments now say "used by /projects until qd93-remove-department-projects removes them"), src/modules/onboarding/onboarding.controller.ts and src/modules/installation/public/installation.api.ts (comments), openapi.json (`pnpm openapi:export`), docs/generated/module-graph.md (`pnpm arch:graph`: data_import -> organization edges 12 -> 10 because the HrBasis type imports are gone; `pnpm arch:docs:check` was red until regenerated), test/http/platform/openapi-request-rules.http-spec.ts.
Deviation/decision: the floor `date leaves >= 95` became `>= 92` because the three `hrBasis.issuedOn` date leaves (employeeCreate, employeeUpdateOfficialFields, employeeImportConfirm) left the document by spec (same precedent as task 1.4: 96 -> 95). The check is a lower bound of the real count (92 now), all other assertions unchanged.
openapi.json diff (this task): employeeCreate/employeeUpdateOfficialFields/employeeImportConfirm bodies lose hrBasis (+required), 4 descriptions reworded; the earlier 1.4 diff covered the department operations. hrBasis remains only in projectCreate/projectUpdate.
Module cards (organization, data-import READMEs) got the sentence in 2.3.
Verify: `pnpm openapi:export` ok; `pnpm test:http -- test/http/platform`: 12 suites / 188 pass; `pnpm arch:check` no violations; `pnpm arch:routes` (docs/generated/routes.md: no content diff) and `pnpm arch:docs:check` green after `arch:graph`; `pnpm rules:check` 0 errors.

## Final verification (HEAD e5670a6a, local test DB, no code change after the last `pnpm check`)
- `pnpm check` (run WITHOUT TEST_DATABASE_* env): exit 0. (A first run with TEST_DATABASE_BOOTSTRAP_URL exported failed only `scripts/verify/bootstrap-installation.test.mjs` "a BOOTSTRAP_ variable was forwarded to Docker" — my env var name contains `BOOTSTRAP_`, an environment artifact, not a code issue; rerun without it is green.)
- Phase 2 checkpoint, http: departments+employees+employee-imports+platform 347 pass; personnel department-transfers/long-leaves/offboarding-cases 90 pass.
- Phase 2 checkpoint, integration by file (all exit 0): Task 1.3 cmd 1 (7 files) 129; cmd 2 (6) 90; cmd 3 (5) 100; Task 2.3 files (7, incl. wire) 101 (+ preview in cmd 3); personnel/requests proof files (super-admin-event-service, long-leave-start, offboarding-record, department-transfer-record) 88.
- Four `full`-key proof cases ran inside those files and passed: department-profile-http "creating a department (US-03-06 AC-1 → AC-3, QĐ-87d(1))", onboarding-http "shows a department with no Cost Center as a warning...", provisioning-queue-http US-01-11 AC-7, employee-import-preview-http "lists the columns that differ…"/"refuses a second row with the same work email…".
- NOT run (deferred to phase B, D-S26): full `pnpm test:integration`, `pnpm test:integration:timing` (organization-unavailable.timing-spec.ts, edited to drop hrBasis), `pnpm test:e2e` (auth-session.e2e-spec.ts, edited to drop hrBasis).
- Not done by design: plan's verification table / roadmap / spec status not edited (owner-side); docs repo untouched; merged-migrations.txt untouched; no migration.
- Open questions: none blocking. Note for owner: the date-leaf floor in openapi-request-rules.http-spec.ts moved 95 -> 92 (three issuedOn leaves removed by the spec).

## Commits this run
d2178b0a 2.1 · 86d78bbe 2.2 · 9f1eb76a 2.3 · e5670a6a 2.4
