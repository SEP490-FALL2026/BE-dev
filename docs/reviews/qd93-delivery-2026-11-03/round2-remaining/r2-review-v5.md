# r2 review v5: Việc 5, commit 7102293e (drop approval_role_holders / project_label / projects)

Skills read and used: `code-review-and-quality` (five-axis review, test-quality checks), `security-and-hardening` (SQL/migration
and authz checks). Verification-before-completion equivalent: every finding below was checked against file contents, not the
Gemini report. Nothing was run. I did not run pnpm, jest, prisma or psql: the brief says read-only, and a full run is already
going in the worktree. So the migrations were checked by reading, not executed on an empty DB or on demo data.

Sources: brief r2, the addendum (Luật 6 + Việc 5), plan fallback-substitute Task 12/13 + spec §Migration/§Luật bước chi cũ/
§Thứ tự quyết định, plan department-projects Task 2.1–2.3 + spec Phase 2, Gemini report §Việc 5.

## Blocker

B1. Kept integration suites still read the dropped table or the removed 409, so they fail on the full schema (verified by reading).
The report's mapping table leaves all of these out:
- `test/integration/identity-access/qd93-role-migration.integration-spec.ts:46,101,195`. `applied()` = `deployMigrations(database)`
  runs every migration, including the new `20261103160000`. The seed leaves a `CONFLICT_SUBSTITUTE` row open and the
  `SPENDING_APPROVER` row closed, so the new guard RAISEs P0001. `beforeAll` then throws ("The migration failed on data it can
  carry"), the test at :195 `expect(result.code).toBe(0)` fails, and `holderRows`/`stopped` query `approval_role_holders`.
  Fix: `deployMigrations(database, { through: MIGRATION })`.
- `test/integration/requests/step-reassignment-paid.integration-spec.ts:180-200`: still expects the frozen step and
  409 `ACCESS_REQUEST.STEP_AWAITING_CONVERSION`.
- `test/integration/requests/spend-approval.integration-spec.ts:230-256` ("answers 409 only for a substitute-held spend step"):
  still expects `STEP_AWAITING_CONVERSION`.
- `test/integration/requests/step-reassignment.integration-spec.ts:591` → `test/support/reassignment-harness.ts:143-146`
  `getApprovalRoleHolder` runs `SELECT … FROM approval_role_holders … ::"ApprovalRole"`, which gives 42P01.
- `test/integration/installation/dev-seed.integration-spec.ts:213`: `count(*) FROM approval_role_holders`.
- `test/integration/identity-access/direct-approval-roles.integration-spec.ts:202-217` (tableRows + afterEach UPDATE) and
  `direct-approval-roles-concurrency.integration-spec.ts:34` (afterEach UPDATE): these fail every case of the block.
- Suspected: `direct-roles-preflight.integration-spec.ts:242` runs a full deploy, so it passes only if earlier cases deleted
  their holder rows.
Fix: delete or replace the cases of the removed mechanism (frozen/409), drop the table reads from kept cases, pin the
pre-B migration tests to `through:`, and add every one of them to the old → new test table.

B2. A unit test fails: `src/modules/requests/need-decision-queue/need-decision-queue.mapper.spec.ts:94-97` expects
`toThrow('legacy')` for rows 3/4. `deciderRoleOf` now throws "The routing row N gives the step to nobody…", and that message
has no "legacy" (`need-decision.policy.ts:91`). The report's checklist has no `test:unit` row. Fix: update the case and
remove the dead `if (deciderRole === null)` at `need-decision-queue.mapper.ts:47-48`.

## High

H1. The migration guard is missing two of the spec's three blocking rows (`20261103160000…/migration.sql:1-29`).
Spec §Migration (i)–(iii) lists them, and the addendum says the frozen-step guard must live inside the migration.
- (iii) Frozen spend step: `kind='SPEND_APPROVAL' AND state='PENDING' AND NOT EXISTS (role_grants g JOIN app_users u …
  role='SPENDING_APPROVER' AND u.employee_id = s.assignee_employee_id)` (all grant rows, including revoked ones). The code
  now lets such a holder decide, because the freeze and the 409 were removed. So a substitute-held step would become
  decidable by a non-approver.
- (i) Open Request where the active spending approver is a party (requester, beneficiary, live line, or SA responsible).
Fix: add both as `EXISTS … RAISE` blocks. Better still, use the 20261102082906 pattern: `string_agg` of the blocking rows
in the message (the spec says "nêu dòng chặn").

H2. The migration test does not prove what Task 13 asks (`drop-approval-role-holders-migration.integration-spec.ts`):
- :62 `toMatch(/P0001|approval_role_holders/i)` passes on any failure, because Prisma prints the migration name, and that
  name contains `approval_role_holders`. Assert `P0001` plus the guard text, and assert the table still exists afterwards.
- No case covers the plan's own name `refuses to drop while a step still waits with a legacy reason`. There is also no case
  for a PENDING NEED step on row 3/4, and none for a WAITING row-4 `NO_DEPARTMENT_HEAD` step (which must not block).
- :119-125 the head check RAISEs before the old `approval_role_holders` block is reached. So this case also passes if the
  function was NOT rewritten. Add a positive control: grant SUPER_ADMIN to a non-head after the drop and expect success,
  which would fail with 42P01 if the function still referenced the table.

## Medium

M1. `SPENDING_APPROVER_IS_PARTY` is half removed. The guard treats it as legacy (`migration.sql:15`), and the spec says
Phase B drops it. But `spend-routing.policy.ts:31` still produces it, `reassignment.policy.ts:63,134` and
`spend-approval.dto.ts:157` and the OpenAPI still list it, and `migration-preflight.repo.ts:121-127` still reads it.
Decide one way and make it consistent.

M2. REWAIT was removed (`reassignment.policy.ts:109-113`), but spec §Thứ tự quyết định step 2 is an everyday rule, not a
legacy one. Reachable case: a NEED step waits `NO_SPENDING_APPROVER` (row 2, head-requester), then DEPARTMENT_CHANGED to a
headless department. The policy now gives KEEP, so the reason stays stale and the Super Admin gets the wrong hint
(CONFIGURE_SPENDING_APPROVER). The same happens for SPEND `NO_SPENDING_APPROVER` ↔ `IS_PARTY`. The unit test "rewaits
with the new reason…" was turned into "keeps waiting…", which asserts the opposite behaviour. The addendum says "gỡ nhánh
REWAIT / đóng băng", which is ambiguous, so the **Owner should decide**. If REWAIT goes, `step-reassignment.repo.ts:230`
`rewait` is now dead code.

M3. Luật 6 of the addendum says every drop migration needs a guard. `20261103160100` drops `project_label`, and the
submitted-request values with it, without a guard. `20261103160200` drops `projects`/`project_departments` without a guard.
The new tests even assert that the silent loss succeeds (`access-request-project-label-drop-migration…:86-92`,
`projects-drop-migration…:51-57`). Spec Phase 2/OQ-1 accepted the loss, so the two sources conflict. **Owner should
decide**: either add `IF EXISTS (… project_label IS NOT NULL) / EXISTS (SELECT 1 FROM projects) THEN RAISE`, or record the
exception.

M4. Task 2.3 was not done. `docs/guides/containers.md` has no N+1 deploy-condition paragraph, and `:628` still says the
code "reads and freezes them (`STEP_AWAITING_CONVERSION`)". `src/modules/organization/README.md:124` says the tables remain
until phase 2. No release note.

## Low

- Function rewrite (`migration.sql:31-58`) was hard-coded instead of the spec's `pg_get_functiondef` + replace-one-block
  pattern. It IS equal to the current (only) definition, `20261016190000`, minus the `approval_role_holders` block, so
  behaviour is correct.
- Dead code: `IdentityAccessApi` injected but unused, `step-reassignment.service.ts:4,61`.
- Stale comments and docs: `reassignment.policy.ts:14-15,55-57,99,125`; `need-decision.policy.ts:74-79` (still says null
  and STEP_AWAITING_CONVERSION); `requests.prisma:363`; `src/modules/requests/README.md:180-185`;
  `src/modules/identity-access/README.md:26-27,43`; `docs/roadmap.md:323` status.
- Fixtures still use the dropped values (harmless): `request-status-rules-related.policy.spec.ts:205`,
  `step-reassignment-constraints.integration-spec.ts:57-155`.
- Rows 3/4/8 now throw a plain Error, which becomes a 500. Neither real data nor a request reaches it: the guard blocks
  PENDING rows 3/4, `routeNeedStep` assigns only rows 1/2/5/9, `repo.assign` rewrites the row, and the queue filters
  `HELD_ROUTING_ROWS`. Only direct SQL could reach it. Optional: a CHECK forbidding PENDING NEED on rows 3/4.

## Checked and found correct
- Migration order: 160000/160100/160200 come after the newest, `20261103140100`; `merged-migrations.txt` untouched.
- Guard (ii) has no `state='WAITING'` filter, which is safe: the step CHECK forces `waiting_reason` NULL unless WAITING.
  Literals match the enum and column types.
- Trigger, function, table and type drop order is correct. `ApprovalRole` is used only by that table and the dropped
  function. No other plpgsql body references the table. `20261102082906` covers the Super Admin vs spending-approver
  exclusion (`role_grants_forbid_combination`), and the head exclusion stays. There is no Postgres transitional enum to
  recreate (`waiting_reason` is TEXT; `ApprovalDeciderRole`/`OffboardingRoleFlag` historical values are kept per spec).
- project_label: no view or function depends on it, and its CHECK goes with the column. The draft JSON cleanup is correct.
  projects: only `project_departments` references it, and `ProjectStatus` is used only by it.
- The code removal is otherwise complete: StepFreezeService, `stepAwaitsConversion`, `everHeldSpendingApproverAmong`,
  `QD93_CONVERSION`, the three legacy reasons and two hints, and `PRISMA_MODEL_OWNER` entries are gone. `SPENDING_APPROVER_PARTY`
  is kept. Controlled waits read reasons only from WAITING steps, which the guard covers.
- OpenAPI/manifests: `STEP_AWAITING_CONVERSION` is removed from 4 routes and the examples. The waitingReason enums are now
  `[NO_SPENDING_APPROVER, NO_DEPARTMENT_HEAD]` and the configurationHint enum has 4 values. The route-code manifests were
  updated. FE contract change: those removed codes and enum values only.
- Deleted tests (need/spend/group policy freeze cases, isLegacyStep block, step-reassignment conversion block,
  need-queue-handover legacy case, role-grant "approval role" half) all belong to the removed mechanism. The head exclusion
  test is kept (`role-grant-constraints…:96`).
