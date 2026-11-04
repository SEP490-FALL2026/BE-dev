# r2 review v3 — Việc 3, commit `5586c502` (unplaced employee offboarding + INV-20 trigger)

Skills read: `code-review-and-quality` (five-axis review), `security-and-hardening` (authz scope of IT Admin reads, SQL trigger).
Read-only; no pnpm/jest/prisma run. Worktree `BE-qd93-audit2` @ `7102293e`, base `30d14ac4`.

## High

### H1. Unrelated kept-behaviour test changed to a URL the code never produces (verified by reading)
- `test/integration/notifications/email-outbox.integration-spec.ts:137` now expects
  `https://app.acme.test/activate-account#token=deliver-me`; `src/modules/notifications/email/email-templates.mapper.ts:15`
  (`activationLink`, used by `renderInvitation`) still builds `/activate#token=`. Unchanged on HEAD `7102293e`.
- The test now fails; the change is outside Việc 3 and not in the report.
- Fix: revert the assertion to `/activate#token=` (or, if the FE route really changed, change the mapper under its own
  decision and say so).

## Medium

### M1. `direct-roles-preflight` breaks on the keep-one trigger (verified by reading)
- `test/integration/identity-access/direct-roles-preflight.integration-spec.ts:240-243` deploys every migration (now including
  `employee_placements_keep_one`), adds `E-H8` with a placement; `afterEach` → `clearPeople`
  (`test/support/direct-roles-world.ts:147`) runs `DELETE FROM employee_placements WHERE organization_id = $1` → `23001`
  on the last placement. (On HEAD the same helper also hits the dropped `approval_role_holders` first — Việc 5.)
- Fix: in `clearPeople`, delete inside one transaction with `ALTER TABLE employee_placements DISABLE TRIGGER
  employee_placements_keep_one` … `ENABLE` (transactional), or skip the delete when the trigger exists and drop the DB.

### M2. Wire code for first placement while handing over is not the specified one (verified by reading)
- Spec (`spec.md:297-298, 485`) and the prompt: 409 `EMPLOYEE.FIRST_PLACEMENT_EMPLOYEE_LEAVING`. Code:
  `employee-first-placement.policy.ts:12` → `'EMPLOYEE_LEAVING'`, `employee.http-errors.ts:21` builds `EMPLOYEE.${problem}`
  ⟹ wire `EMPLOYEE.EMPLOYEE_LEAVING` (openapi.json:533-538, route manifest, test 6 all pin the wrong code).
- Context: the family already drifted on dev (`EMPLOYEE.ALREADY_PLACED`, `EMPLOYEE.EMPLOYEE_INACTIVE`, `EMPLOYEE.DATE_INVALID`
  vs spec `EMPLOYEE.FIRST_PLACEMENT_*`). Gemini followed the drift instead of the spec it was told to follow.
- Also: 409 description `employees.controller.ts:51` still lists only three codes.
- Fix: emit `EMPLOYEE.FIRST_PLACEMENT_EMPLOYEE_LEAVING` (map per problem, not by template), update manifest/OpenAPI/test; ask
  Owner whether to rename the rest of the family to the spec or record the drift.

### M3. "No head duty" test is vacuous; the D-S18 revocation path is untested (verified by reading)
- `offboarding-unplaced.integration-spec.ts:45-80` (test 1) checks `duties` for a person with `heldRights: 0` — no seat, so
  no duty could ever be created. No test gives the unplaced person a seat, records, then has an IT Admin open revocations
  (`openFromTask` → `departmentOf` fallback → `requirementOf(..., {departmentId:null})`) and shows the task starts without
  `HandoverConfirmationPendingError`. Account lock, mark-left, abrupt (LEFT at once) for unplaced: no test.
- The code path itself reads correct (see "Checked and correct"); only unit `handover-confirmer.policy.spec.ts:88-89` proves
  the filter.
- Fix: add an integration case with a personal seat (data-loss plan) + IT Admin open revocations + account lock, abrupt variant.

### M4. Missing spec test-matrix rows (verified by reading)
- D-S28 boundary `lastWorkingDay == validFrom` (test 3 uses validFrom+2); D-S28 "from validFrom → normal flow, H1 head duty"
  (`pretend-today`); unit before/equal/after in `offboarding.policy.spec.ts` (branch lives in preconditions, untested at unit);
  `DEPARTURE_RECORDED` to the cancelled department head (`alsoDepartmentIds`); record ↔ first placement concurrency;
  IT Admin `A3` unplaced → `ROLE_HOLDER_LEAVING` with `departmentId: null`; trigger exception negative for `valid_from <= today`
  with a live case naming it; transfer-cancel still green after the trigger (implicitly by other suites only).
- IT Admin visibility test uses `h.it1`; no IT Admin with an empty scope is tried ("every usable IT Admin").

### M5. `placement-coverage.ts` first-placement rule loosened beyond the plan (Task A.2, not Việc 3 scope)
- `test/support/placement-coverage.ts` replaced "first placement starts at hire date or recorded day" by only
  `valid_from < hire_date`; plan A.2 says "at hire date, recorded day, or not before both". A.2's new cases in
  `organization.integration-spec.ts` (no-placement ok, two open ⟹ violation, before hire ⟹ violation) were not added.
- Fix: `valid_from < GREATEST(hire_date, recorded day)` unless equal to one of them; add the three cases.

## Low
- L1 dead codes: `OFFBOARDING_CASE.EMPLOYEE_UNPLACED` still in `offboarding.http-errors.ts:36,69`; `EMPLOYEE_UNPLACED` in
  `transfer.http-errors.ts:24,60`; `OrganizationReadApi.getUnplacedEmployeeIds` (`organization-read.api.ts:54`) unused
  duplicate of `unplacedAmong`.
- L2 OpenAPI/docs (D.2/D.7): only a `NO_OPEN_PLACEMENT` example (`offboarding.http-errors.ts:147`); no
  `FIRST_PLACEMENT_PENDING` example/description on `offboardingCaseRecord`/`ChangeLastDay`; personnel/organization READMEs not
  updated; `firstPlacementRestored` added to the shared detail schema of every route, not only cancel.
- L3 `offboarding-preconditions.service.ts:222` `departmentId: seen.before ? … : ''` — empty-string sentinel (unreachable).
- L4 Audit `EMPLOYEE.FIRST_PLACEMENT_CANCELLED` written by personnel (`offboarding-audit.service.ts:64`) instead of inside
  `OrganizationApi.cancelScheduledFirstPlacement` as spec says; `employee.repo.ts` delete has no `valid_from > today` guard
  (trigger backs it).
- L5 test hygiene: `inspect.integration-spec.ts:230-232` disables the trigger in autocommit and re-enables outside `finally`;
  `license-assignment-http.integration-spec.ts` leftover no-op `SELECT 1 /* … */`; `organization.integration-spec.ts:206`
  cleanup removed; keep-one concurrency test relies on a 50 ms sleep.
- L6 scope: transfer change (D.6, `transfer-preconditions.service.ts`) shipped in Việc 3 (spec-aligned, tested by test 7).
- L7 report: Việc 3 section is wrong — migration `20261103140000_…keep_at_least_one`, trigger name, "DELETE or UPDATE",
  "ACTIVE only", "TERMINATED exception", files `offboarding-case.service.ts`/`departure.service.ts` do not exist; the
  `personnel_offboarding_unplaced` migration is missing from its table; no old→new row (base had no test of the temporary
  409 — the report should say so).

## Checked and correct
- Trigger (both versions, read line by line): BEFORE DELETE FOR EACH ROW, locks employee `FOR UPDATE`, raises only when no
  other row (`id <> OLD.id`), `23001` + `CONSTRAINT`; no status filter (Gemini's "ACTIVE" wording is wrong, code matches
  INV-20); name sorts after `employee_placements_history_guard` so `55000` wins; INSERT/UPDATE untouched, zero-row state
  untouched; transfer cancel deletes the opened row while the closed one exists; no app/demo/ops path deletes placements.
  Phase D exception = `valid_from > org today` AND live case with `cancelled_placement_id = OLD.id` — matches spec; the case
  row is inserted before the delete (`offboarding-case-writer.service.ts:55-57`), and before `leaveInTx`.
- Migration D: `department_id` nullable (FK kept), three columns + FK + index, both CHECKs as spec.
- Temporary 409 removed; branching unplaced / scheduled-before / `FIRST_PLACEMENT_PENDING` / `NO_OPEN_PLACEMENT`; abrupt uses
  today; hire-date floor; lock order dept SHARE → employee UPDATE; re-check after locks → `CONCURRENT_CHANGE`.
- No periods/head handover for null department in record, change, cancel; change refuses `>= cancelled_placement_from`;
  cancel restores same id/dept/date only when dept ACTIVE under `FOR SHARE` (frame locks dept first), flag on response + log.
- First placement while `HANDING_OVER` refused (code aside), TERMINATED keeps `EMPLOYEE_INACTIVE`.
- IT Admin scope: list `OR departmentId IS NULL`, detail/rights allow null; Super Admin full; others 403.
- Licensing: `requirementOf` drops DEPARTURE/ABRUPT_DEPARTURE when department null, in both `open` and `openFromTask`;
  `OffboardingHandoverService` skips; notifier filters null, abrupt falls back to first usable IT Admin.
- Fixture rewrites (`unplacedStaff`, `crowd(…, [3])`) are equivalent to the old delete-based fixtures.
