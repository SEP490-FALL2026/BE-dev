# QĐ-93 audit — review r1-items1-3 (03/11/2026)

Skill preflight: `C:\Users\Asus\.claude\skills\code-review-and-quality\SKILL.md` (read in full) — five-axis review, severity
labels, tests-first reading, dead-code hygiene. Process skill = that file. No other skill was used. Verification = reading only
(read-only brief: no pnpm/jest/prisma run). Every finding below was checked by reading code, `git diff`/`git show`, or
`openapi.json` at the named revision.

Worktree `D:\FPT\FALL2026\Code\BE-qd93-audit`. Ranges: #1 `1a77ffe8..164f6e67` (code starts after the doc commits
`dea13bec`, `03da6c4f`), #2 `164f6e67..7daf6856`, #3 `7daf6856..10e4a56d`.

---

## #1 qd93-remove-hr-basis-org-writes

### What I checked (no finding)
- `hrBasis` is gone from all 10 bodies (create/update/deactivate department, head assign/vacate, successor
  designate/clear, employee create/update, import confirm), from the service inputs and from the `after` of every
  audit event (`DEPARTMENT.*`, `EMPLOYEE.CREATED` both paths, `EMPLOYEE.OFFICIAL_FIELDS_CHANGED`,
  `EMPLOYEE_IMPORT.CONFIRMED`). `git grep hrBasis 164f6e67 -- src` leaves only `/projects`, the two shared type files (kept
  for `/projects` per spec) and `personnel/super-admin-event/profile-correction.service.ts:70` (CLI `QĐ-87c`(4), kept on
  purpose).
- `src/modules/personnel/**` is not in the diff: `grounds` of personnel events are unchanged.
- `openapi.json@164f6e67`: `hrBasis` only in `CreateProjectBodyDto`/`UpdateProjectBodyDto`; `maxLength` 200/1000 on
  create/update; 409 `DEPARTMENT.INACTIVE` on `departmentUpdate`, `departmentHeadAssign`, `departmentSuccessorDesignate`
  (and runtime: `department.service.ts:120`, `department-head.service.ts:269` via `lockActiveDepartment` used by assign and
  designate only — matches).
- OD-1 strict: an HTTP case "body carries `hrBasis` ⟹ 422" exists for every one of the 10 operations
  (`departments.http-spec.ts:215,241,260,273,289,301,314`, `employees.http-spec.ts:75,117`,
  `employee-imports.http-spec.ts:161`) plus integration cases.
- NFC: `departments.http-spec.ts:225` really sends NFD (`a` + U+0301, checked byte-wise); the positive 200-letter NFD case is
  `department-profile-http.integration-spec.ts:305`.
- Gate floor `openapi-request-rules.http-spec.ts` 96 → 92: I counted request date leaves in `openapi.json`: 102 at
  `03da6c4f`, 92 at `164f6e67` (exactly the 10 `hrBasis.issuedOn`). Fully explained; the floor now equals the count.
- Removed/rewritten tests: every one is a "basis required/recorded" case replaced by "basis refused 422 / absent from audit".
  No deleted case of kept behaviour.
- Demo dataset: four calls without `hrBasis`, `basis()` and fixture field removed; `grep basis src/cli/demo-dataset` empty.

### Findings
- **Low — OpenAPI says the empty body is required.** `openapi.json` `departmentDeactivate` and `departmentSuccessorClear`:
  `requestBody.required: true` with schema `{}` (additionalProperties false), while the spec (Behavior › Request) and runtime
  (`department.dto.ts` `z.preprocess(body ?? {}, z.strictObject({}))`) accept an absent body; the integration test posts
  `/deactivate` with no body and gets 200 (`department-profile-http.integration-spec.ts`, case at :276). A generated FE client
  will force a body. Fix: mark the body optional in the OpenAPI decoration of these two routes (e.g. `@ApiBody({ required:
  false, … })` or the zod-dto equivalent) and re-export. Confidence: verified (read openapi + dto).
- **Nit — 200 description mixes in an error.** `departments.controller.ts` `DEPARTMENT.UPDATED` description: "A body that
  carries an HR basis is refused (VALIDATION_ERROR): the Audit Trail records who, when, before and after." The 422 belongs in
  the 422 entry (already says "a field the route does not take"). Fix: drop the sentence from the success description.

---

## #2 qd93-remove-in-app-super-admin-transfer

### What I checked (no finding)
- No in-app route left: `super-admin-transfers/` (4 files) deleted, controller/provider unregistered, no `SUPER_ADMIN_TRANSFER.*`
  code/example/manifest entry left (`git grep` at `7daf6856`); OpenAPI 306 → 305; new
  `super-admin-transfer-removed.integration-spec.ts` checks 404 for holder, IT Admin, Finance, head, employee, anonymous and
  unchanged roles.
- `SUPER_ADMIN_TRANSFER_ONLY` keeps its code with the new message (unit + `account-roles-http` :80 new case).
- CLI `transfer-role` planned case: `role-transfer-recovery.api.ts` — `SUCCESSOR_NOT_FOUND_ACCOUNT` before `openAndLock`;
  `requireReady` (no invite) when holder usable; refusal inside the transaction rolls back the ticket (test asserts
  accounts/tokens/tickets/mails unchanged). `HOLDER_STILL_USABLE` removed; `APPROVER_IS_HOLDER` added. AC-4 rollback test
  added in `7daf6856`.
- Migration `20261102043614_identity_app_user_employee_immutable`: `BEFORE UPDATE OF employee_id`, `IS DISTINCT FROM`, 23514,
  sorts after `20261101000200` and before #4's `20261102080428`; no code path updates `app_users.employee_id`. Clean on an
  empty DB as far as reading can tell (function then trigger, no dependency on later objects).
- `SuccessorEligibility`/`APPROVAL_ROLE_HOLDINGS` removed only from the API module; still bound in
  `identity-access-recovery-cli.module.ts:38-39`; gate list updated.

### Findings
- **High (closed by #4 if it merges right after) — deleted tests of kept behaviour, no replacement in #2.** The deleted
  `super-admin-transfer-http.integration-spec.ts@164f6e67` covered (a) the DB trigger `role_grants_super_admin_exclusions` for
  an **approval role holder** (:365-393, both halves) and (b) `SuccessorEligibility` reasons **`APPROVAL_ROLE_HELD`** (:204) and
  **`HEADS_DEPARTMENT`** (:221). Both the trigger and `SuccessorEligibility` are kept and still used by `ops:recover
  transfer-role`. #2's replacements cover only the head half of the trigger (`role-grant-constraints…:96`) and the reasons
  WORK_ROLE_HELD/NOT_ACTIVATED/EMAIL_NOT_VERIFIED/ACCOUNT_LOCKED/EMPLOYEE_NOT_WORKING (`super-admin-recovery-role…:464`). At
  `7daf6856` nothing tests the approval-holder trigger or those two reasons. #4 restores them
  (`3f93c788` `role-grant-constraints…:291`, `super-admin-recovery-role…:548-550`). Since the slices merge to `dev` one at a
  time, `dev` loses this coverage between the two merges. Fix: move the approval-holder trigger case and the
  `APPROVAL_ROLE_HELD`/`HEADS_DEPARTMENT` CLI cases into #2 (or merge #2 and #4 back-to-back and record that). Confidence:
  verified.
- **Medium — AC-5 concurrency test is weaker than the one it replaces.** `super-admin-recovery-role…:317` runs two
  `transferRole` calls in one `Promise.all` with no forced overlap; it passes whether or not the lock protocol works if the two
  happen to serialize. The deleted test held a lock to force overlap over three rounds. Fix: open a separate client, `SELECT …
  FOR UPDATE` the holder's employee/account row, start both commands, assert both are waiting, then release. Confidence:
  verified by reading (verifier also noted "yếu hơn bản cũ").
- **Low — stale comments after the removal.** `accounts/successor-eligibility.service.ts:24` ("the transfer by the holder and
  the recovery by an operator ask this one question"), `approval-roles/approval-role-facts.service.ts:8` ("successor check of
  the Super Admin transfer"), `identity-access/README.md:46` (says the gate pins `APPROVAL_ROLE_HOLDINGS`; at `7daf6856` it does
  not — #4 re-adds it). Fix: reword to the CLI-only path.
- **Low — lost variants.** Eligibility "long leave / hand-over" (old :173) and AC-8 "holder left ⟹ 401" have no own case
  any more; the code branch (`status !== 'ACTIVE'`) is still hit by the TERMINATED case. Optional.
- **FYI (suspected, not a bug today)** — `APPROVER_IS_HOLDER` compares `approverRef` with the operator-typed `--holder-email`
  (`recovery-procedure.policy.ts:40`), not with the holder's work email; an approver ref given as the holder's work email
  (≠ login email) passes. Fix if wanted: also compare with the holder employee's work email.

---

## #3 qd93-parameter-labels-dashboard-queues

### What I checked (no finding)
- Scope: per the spec the dashboard part (`API-DOC-F06`) was split to `dashboard-request-queues-wiring`; this range has no
  dashboards code. The "dashboard queue wiring" in the brief's focus hint is therefore not delivered here by design.
- 20 definitions reordered by group exactly as the spec table; `key`/`shape`/`default`/`unit`/`source` unchanged except
  `optionLabels`; two descriptions changed as specified; `DOCUMENT_MAX_SIZE_MB` description untouched.
- Wire: `label`, `group`, `groupLabel`, `unitLabel` in `ParameterView` and `toWire`; `constraints` is a discriminated union;
  `openapi.json@10e4a56d` shows `oneOf` of three strict objects, `options` `maxItems: 10`, `optionLabels` as
  `additionalProperties: string`. `operatingParameterSet` uses the same schema.
- Registry: exception `operatingParameterList#bounded` updated (20, itemProperties sorted); new nested key
  `operatingParameterList#constraints.options` + one `added` event as an object literal with `LD-17`, real date, `bound` string
  contained in `businessMaximum.source`; `LD-17` row added to the G0–G4 review ledger and unused before.
- Tests are additions only (unit +169, http +104, integration +102); no existing case edited or removed.

### Findings
- None above Nit. FE can map keys from `label`/`groupLabel`/`unitLabel`/`optionLabels`.
