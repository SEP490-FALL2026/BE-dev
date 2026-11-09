# Review: employee directory (US-02-02) — diff `7eef3006..02f466ac`

Skills read/used:
- `code-review-and-quality` (C:\Users\Asus\.claude\skills\code-review-and-quality\SKILL.md): five-axis review, severity labels, tests-first, "verify the verification". Process + review skill.
- Verification skill mapping: no tests were run (Owner instruction: a full run is executing in the worktree; no pnpm/jest/prisma). Verification here = reading + two scratch `node` scripts that only read source files (cooked-template check, translate-table check). Gate results quoted from the implementer's report are NOT re-verified.

Scope: worktree `D:\FPT\FALL2026\Code\BE-qd93-audit`, HEAD `0c84a9bc` (merge of `02f466ac`). Read-only; nothing edited or committed.
Sources: spec/plan `docs/workspace/items/employee-directory-read/`, task `NOTE MD/codex-employee-directory-prompt.md`, report `NOTE MD/codex-employee-directory-report.md`.

Verdict: **Request changes** — 1 High (search escaping broken on code/email), test suite has vacuous cases that hid it. Everything else is sound or Low.

---

## High

### H1 — `ESCAPE '\'` becomes `ESCAPE ''` on the code and email LIKE (verified by evaluation)
`src/modules/organization/employee-directory/employee-directory.repo.ts:59-60`

```ts
upper(e.employee_code) LIKE ${search.codePattern} ESCAPE '\'
OR (... e.normalized_work_email LIKE ${search.emailPattern} ESCAPE '\')
OR lower(...) LIKE ${search.namePattern} ESCAPE '\\'      // line 61 is correct
```
`Prisma.sql` (client-runtime-utils 7.9.1, `function sql(strings, ...values) { return new Sql(strings, values) }`) uses the
**cooked** template strings. In a JS template literal `\'` cooks to `'`, so lines 59-60 send `ESCAPE ''` to PostgreSQL
(= *no* escape character). Line 61 (`'\\'`) cooks to `'\'`, correct. Confirmed by evaluating lines 58-62 with a
cooked-string tag (scratch `cook2.js`): output `... LIKE $P ESCAPE ''` twice, then `ESCAPE '\'`.

Effect: the policy escapes `%`/`_`/`\` with a backslash, but on code/email the backslash is a literal character, so any
`q` containing `_`, `%` or `\` can never match code or email. Concretely: searching a full work email that contains `_`
(`a_nguyen@congty.vn`) returns nothing unless the name also matches. Not an injection (values are parameters; the
failure mode is false negatives, never wildcard broadening), but AC-24 "search by work email" is broken for those
addresses and the spec's literal-match rule is not met on 2 of 3 columns.

Fix: write `ESCAPE '\\'` on lines 59 and 60 (same as 61), or drop all three `ESCAPE` clauses (backslash is PostgreSQL's
default, as `employee.repo.ts:350` already relies on). Add an integration case: employees with emails `a_b.x@acme.vn`
and decoy `aXb.x@acme.vn`; `q=a_b` → only the first; `q=a_b.x@acme.vn` → the first.

---

## Medium

### M1 — The literal-wildcard integration test is vacuous (verified by reading)
`test/integration/organization/employee-directory.integration-spec.ts:246-256`
`q=%User_` on `Special%User_Test` passes with or without escaping (no decoy row such as `SpecialXUserYTest`);
`q=NonExistent%Pattern` returns 0 with or without escaping. Hence H1 slipped through. Spec matrix asks for `50%`, `a_b`
against decoys `50x`, `aXb` and a row with the exact string. Fix: add the decoys (name and email) and assert exact id sets.

### M2 — Filter semantics in the spec matrix not exercised (verified by reading)
Same file, `filters by …` cases:
- `departmentId`: only a 2024-expired placement is tested. No row with `valid_to = today` (must be excluded) or
  `valid_from = today` (must be included) — a mutation `valid_to >= today` stays green. Use
  `OrganizationReadApi.businessToday()` / `h.ctx` business date to seed these, not `current_date`.
- `workState`: only `WORKING` with `length >= 3` — dropping the `workState` condition stays green. Seed one
  `ON_LONG_LEAVE`/`LEFT` (or flip `work_state` in SQL) and assert in/out.
- D-S25 future-only placement (`POST /employees/{id}/first-placements` from tomorrow → list `unplaced:false`,
  `department:null`, detail lists the future placement) — not tested; the code is correct by reading
  (repo.ts:136-144 lateral requires `valid_from <= today`; `unplacedEmployeeSql` counts any row).
- AND combination and `departmentId` + `unplaced=true` → empty page: not tested.
Fix: add these four cases (each is a few lines with the existing harness).

---

## Low

- **L1 Roles order / statement count** — `src/modules/identity-access/accounts/app-user.repo.ts:159-181`: `roleGrants`
  select has no `orderBy` → `account.roles` order nondeterministic; add `orderBy: { role: 'asc' }`. Suspected: with
  `previewFeatures: []` (`src/generated/prisma/internal/class.ts:19`) Prisma loads the nested relation in a second
  query, so "one statement" (comment + spec) is likely 2 statements. Harmless for N+1 (constant), but either make it a
  single `$queryRaw` with `array_agg` or correct the comment/spec.
- **L2 Commit mixes base-gate repairs, not disclosed in the report** — `test/http/platform/openapi-presentation.http-spec.ts`
  299→302 (includes the base's missing `employeeFirstPlacement` op), `openapi-example-manifest.ts`
  (`employeeFirstPlacement`), `openapi-example-route-codes-*.ts` (`employeeFirstPlacement`, `IMPORT.FILE_FORMAT_UNSUPPORTED`),
  `openapi-export.http-spec.ts` (`.gitattributes` xlsx rule), `openapi-inventory.ts` BUSINESS_PATTERNS, and a
  wire-visible rewording of `EmployeeRowInvalidError` (`employee.errors.ts:37`, appears in openapi 422 examples).
  `docs/generated/*` also refreshed stale edges (data_import, installation, requests). Implies `7eef3006` gates were red.
  Fine to keep, but record it in the report/ledger and tell FE the message changed.
- **L3 Report inaccuracies** — report §2.1 says code search is "uppercase prefix" (code: contains, matches spec); §4 says
  "exactly 7 data statements" but the test only asserts `data5 === data30` and `<= 10`. Spec/plan test matrix still
  "planned"; statement counts not recorded (plan DoD).
- **L4 Duplication / dead code** — `escapeLikePattern` duplicated (`employee.repo.ts:57` private vs
  `employee-directory-search.policy.ts:15`) — export one; `EmployeePlacementRow` in `employee-directory.types.ts:22`
  unused; `export { employeeIdParamSchema }` re-export in `employee-directory.dto.ts:7` unneeded; mapper wire interfaces
  duplicate the zod schemas (could be `z.infer`).
- **L5 Unplaced predicate still has 3 spellings** — directory uses the shared `unplacedEmployeeSql` (good, no second
  `NOT EXISTS` written here), but `EmployeeRepo.unplacedAmong` (`employee.repo.ts:167-172`, Prisma `placements: { none: {} }`)
  and the profile read (`employee.repo.ts:418`, `_count.placements === 0`) remain (pre-existing). Same meaning
  ("no row at all"); the new doc comment "The single predicate" overclaims. FYI / optional follow-up.
- **L6 Fold asymmetry outside Vietnamese** — JS `searchKey` strips every combining mark; SQL `translate` only the 134
  Vietnamese letters. A name with `ñ`, `ç`, `ö` cannot be found even by typing it exactly (JS folds to `n`, SQL keeps
  `ñ`). Acceptable for the business (Vietnamese names) — document or fold only the same table in JS.
- **L7 Test gaps (minor)** — no `+tag` email, uppercase UUID (`q` and path id), page-beyond `totalItems` check, 51
  placements → `placementsHasMore: true`, `validTo` value check; JS↔SQL fold "pair" test is simulated in JS
  (policy.spec.ts:66-89), not against PostgreSQL. 
- **Nit** — identity-access repo returns organization's extension-point types (`app-user.repo.ts:5-8`); mapping in the
  listener would keep the repo free of foreign contracts.

---

## Checklist results

1. **Authz — PASS (read).** `@RequireRoles('SUPER_ADMIN')` on the class (`employee-directory.controller.ts:51`). HTTP spec
   covers 401 and 403 for IT_ADMIN, FINANCE, EMPLOYEE, no role, derived MANAGER, SPENDING_APPROVER on both routes. 404
   via `EmployeeNotFoundError` → `EMPLOYEE.NOT_FOUND`, message echoes only the requested id (`organization.errors.ts:4`).
   Query `z.strictObject` (dto:17), `pageSize` max 100 (dto:31), unknown key / q 101 / bad enums → 422 tested.
   `page` has no upper bound — same as every other list DTO in the repo (FYI).
2. **SQL safety — FAIL on escaping (H1), otherwise PASS.** All user input bound as parameters (`Prisma.sql` values);
   the only `Prisma.raw` is the constant column `'e.id'`. `q` never interpolated. Translate tables: 134/134 chars, NFC,
   pairwise equal to NFD-strip, Đ→D/đ→d, all 12 vowel bases × 5 tones present (scratch `fold.js`). UUID `q` → `e.id`
   only (lower-cased). Valid email `q` → `normalizeEmail` (+tag stripped); otherwise lower-case.
3. **Semantics — PASS (read), weakly tested (M2).** `valid_from <= today AND (valid_to IS NULL OR valid_to > today)` in
   both the filter and the lateral; unplaced via `unplacedEmployeeSql`/`NOT (...)`; hasAccount via hook before the
   snapshot; filters AND-joined, q's OR parenthesised; `ORDER BY e.employee_code, e.id`; page+count in one
   RepeatableRead tx with the same WHERE; page beyond end → empty + real total (`pageOf`); history
   `ORDER BY valid_from DESC, id DESC LIMIT 51` + `cutHistory(50)`; roles = grants with `revokedAt: null` (same
   definition as the rest of identity-access; unique index `role_grants_one_effective_per_role`); future-only →
   `department: null`, `unplaced: false`.
4. **Boundaries — PASS (read).** `employee-directory/*` imports only organization + core; identity-access imports
   organization `public/` types only; binder in `employee-accounts.listener.ts`. Module graph: only
   identity_access→organization grew (31→34); no organization→identity-access edge. `arch:check` not re-run.
5. **`departmentMemberList.employeeId` — PASS.** repo select `e.id AS employee_id` → record → DTO `employeeId: z.uuid()`
   (first field) → openapi required; three contract tests updated.
6. **Tests — partial.** N+1: 5 vs 30 rows on the same data, `data5 === data30` (non-vacuous: any per-row query would
   differ) — meets the accepted relaxation. No `current_date`. Fixture codes valid (`P-DIR1`, `P-DIR2`,
   `NV-DIR-00x`, `NV-N1-0xx`). Vacuous/missing cases: M1, M2, L7.
