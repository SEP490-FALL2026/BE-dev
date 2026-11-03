# Review — Codex lean 3 tasks (merge 42138a99, diff e14d5a5a..e2436a93) — 03/11/2026

Skills read/used:
- `code-review-and-quality` (C:\Users\Asus\.claude\skills\code-review-and-quality\SKILL.md): process + five-axis review, severity labels. Mapping: process skill = this one (review process); domain = security axis of the same skill (zip bomb / input validation); verification-before-completion = its "Verify the verification" step (each finding below is marked VERIFIED-by-reading or SUSPECTED). No other skill used.

Scope/constraints honoured: read-only, git/grep/read only, no pnpm/jest/prisma, nothing edited except this log. HEAD 5ffe8a25 (adds the bootstrap code-format fix on top of the merge; included in the reading).
Accepted on purpose, not reported: offboarding 409 OFFBOARDING.EMPLOYEE_UNPLACED, no INV-20 trigger, no cancel of future placement, npm audit minimatch/deepmerge residual.

## Verdict

No Blocker. Nothing found that breaks a fresh VPS bootstrap or the demo happy path (CSV/XLSX template files from the repo, manual create with/without department, first placement, request refusal). Two Medium issues in the XLSX reader (parity with CSV, memory exposure), one Medium FE-discovery gap, rest Low/Nit.

## Findings

### M1 — XLSX header check is stricter than CSV: all 7 columns required, exact names only (VERIFIED)
`src/modules/data-import/employee-import/preview/employee-import-xlsx.service.ts:60-62`
```ts
const missing = EMPLOYEE_COLUMNS.filter((column) => !header.includes(column));
if (missing.length) throw new ImportFileMissingColumnsError([...missing]);
```
CSV goes through `mapEmployeeColumns` (`employee-import-row-validation.policy.ts:59-70`): folds case/spaces/diacritics, accepts aliases (`ma_nv`, `ho_ten`, `phong_ban`, …), and `work_email`, `job_title`, `department_code` are OPTIONAL. In XLSX an `.xlsx` without `job_title` or `department_code` column, a header `Employee_Code`, `employee_code ` (trailing space) or Vietnamese aliases → 422 `IMPORT.FILE_MISSING_COLUMNS` listing optional columns as "required". Contradicts "department optional" and the "same rows as CSV, no duplicated validation" instruction. Repo samples pass (exact headers), so the demo with the shipped files works; a hand-made Excel by the FE/tester fails.
Fix: delete lines 60-62; `employeeTableToRows(rows)` (called on the next line) already runs `mapEmployeeColumns` and throws the right missing list.

### M2 — Zip-bomb / big-sheet memory exposure before any row cap (VERIFIED by reading; impact SUSPECTED, not measured)
`employee-import-xlsx.service.ts:33-39,43-50`. `workbook.xlsx.load()` (exceljs 4.4.0, JSZip) inflates and parses EVERY part (all sheets, sharedStrings, media) into memory; the 1 000-row cap (`lastNonEmpty > MAX_DATA_ROWS + 1`) runs only after the full model is built. Upload cap is 2 MB compressed (`employee-imports.controller.ts:31`); deflate ratio up to ~1000:1 → hundreds of MB–GB of XML/objects → event-loop stall or OOM kills the single API process for everyone. Caller must be SUPER_ADMIN (authenticated, high privilege), hence Medium not High.
Fix (pick one): (a) before `load`, read the ZIP central directory (EOCD → sum of uncompressed sizes; reject > e.g. 20 MB or > N entries) — ~25 lines, no new dep; or (b) use `new ExcelJS.stream.xlsx.WorkbookReader(Readable.from(bytes), { sharedStrings: 'cache', worksheets: 'emit' })`, take only the first worksheet and abort after 1 001 non-empty rows.

### M3 — FE has no way to list unplaced employees that already have an account (VERIFIED)
There is no `GET /employees` or `GET /employees/:id`. `unplaced` is only on `/me`, `account-candidates` (employees WITHOUT account, max 20, search) and import rows (no employee id). `GET /app-users` / detail (`account-query.service.ts:120-140`) carry `employee {id, code, name}` but no `department`/`unplaced`. Demo flow "manual create without department → create account → request refused UNPLACED → Super Admin places him" works only if the FE kept the id from the create response. Imported unplaced people are findable via account-candidates until they get an account.
Fix (smallest): add `unplaced: boolean` (and `department` nullable) to the app-users list/detail employee projection (data already in `getEmployees`/profile reads); or `GET /employees?unplaced=true` for SUPER_ADMIN.

### L1 — XLSX keeps fully-empty middle rows and does not trim like CSV (VERIFIED)
`employee-import-xlsx.service.ts:51-58`: only trailing empty rows are popped. CSV (`src/core/csv.ts:140`) drops empty rows anywhere. An Excel with a blank line in the middle shows an extra ERROR row (EMPLOYEE_CODE_REQUIRED, FULL_NAME_REQUIRED, …) in the preview. Valid rows still import. Fix: `if (cells.every(c => c.trim() === '')) continue;` inside the loop (keep `line: index` so line numbers stay Excel row numbers).

### L2 — Hyperlink cell whose text is rich text returns an object (SUSPECTED)
`cellText` line 17: `if ('text' in value) return value.text;` — exceljs hyperlink values can carry `text` as `{ richText: [...] }` when the link text is formatted; the object then reaches `clean()`/`.trim()` → TypeError → 500. Emails auto-linked by Excel are the common case (usually plain text, so low likelihood). Fix: `return cellText(value.text as ExcelJS.CellValue);`.

### L3 — CSV now requires a `.csv` file name (VERIFIED, behaviour change)
`employee-import-xlsx.service.ts:25-28`: a CSV uploaded as `people` / `people.txt` (accepted before) is now 422 `IMPORT.FILE_FORMAT_UNSUPPORTED`. Harnesses use `people.csv`, so tests pass. Acceptable; mention to FE, or accept `text/csv`/`text/plain` MIME as CSV.

### L4 — Other code lookups are not uppercased (VERIFIED)
- Seat-baseline import: `seat-baseline-rows.policy.ts:92,281` look employees up by `cell(cells,'employee_code')` without `.toUpperCase()` → a lowercase `nv-0001` in a seat file is EMPLOYEE_NOT_FOUND.
- Ops CLIs `--department <code>`: `assign-subscription-owner.arguments.ts:76`, `cost-center-direction.arguments.ts:120` pass the code as typed → `ds1-eng` = not found (refused cleanly, no damage).
Fix: `.trim().toUpperCase()` at those three reads.

### L5 — OpenAPI pattern is stricter than the server (VERIFIED)
`employee.dto.ts:32-37,49-57`, `department.dto.ts:14-19` publish `^[A-Z0-9]+(-[A-Z0-9]+)*$` while the server trims+uppercases (`nv-001` accepted). Generated FE validators/contract fuzzers will refuse lowercase the server would take, and `departmentCode: ""` (= unplaced) violates `minLength: 2`. Behaviour consistent with policy; only the description says "normalized". Optional: keep pattern, add `"examples"` and say "send null for no department".

### L6 — Request preview OpenAPI does not list the new 422 (VERIFIED)
`access-requests.controller.ts:99-124` — preview now throws `REQUEST_PARTY.INELIGIBLE` (`request-preview.service.ts:93`) but the 422 block lists only VALIDATION_ERROR / NO_SPEND_FOR_FREE_SOFTWARE. Add the example the other request routes already use.

### L7 — Future-dated first placement = "placed" but no current department (VERIFIED, handled)
`effectiveFrom` may be any future day (no upper bound). Until it starts: request-party says eligible (a placement row exists), Request routes then return 409 `ACCESS_REQUEST.NO_DEPARTMENT` (`request-facts.service.ts:118,171`), transfer/offboarding 409 `PLACEMENT_OVERLAP` — 4xx, no 500. Response shows `unplaced:false` with the future department. OK for demo; consider an upper bound (e.g. ≤ today+365).

### L8 — Sample files collide on NV-0001 (VERIFIED)
`employee-template.csv` and `employees-15.csv` both use `NV-0001` with different name/email. Confirming the template first makes row 1 of employees-15 `EXISTS_DIFFERENT` → preview 14 valid, not the 15 in `expected-results.json`. Fix: template uses `NV-9001` (and its email), rebuild xlsx.

### Nit
- `department.repo lock(..., 'UPDATE')` in `employee-first-placement.service.ts:36`: other entry paths take the department `FOR SHARE`; UPDATE serialises concurrent imports/creates into that department for the transaction. Correct, just heavier than needed.
- Mixed-language messages: `FirstPlacementError` ALREADY_PLACED, `OFFBOARDING/TRANSFER EMPLOYEE_UNPLACED` are Vietnamese while every other wire message is English.
- UTF-8 BOM at the start of `employee-import-xlsx.service.ts`, `employee-first-placement.{service,policy}.ts`, the xlsx spec and `build-employee-import-examples.mjs`.
- `employee.dto.ts:27` comment still names `DEPARTMENT_REQUIRED`.

## Checked and OK (VERIFIED by reading)

1. Code format: `organization-code.policy.ts` regex/length (linear, length checked first, no ReDoS). Manual create trims+uppercases employee & department code before validation and lock (`employee-manual.service.ts:73-81,91`); import `readRow`/`lookupNamesOf`/`idsUsedByValidRows`/preview rows uppercase both codes; `EMPLOYEE_CODE_INVALID`/`DEPARTMENT_CODE_INVALID` row reasons; department create 422 `DEPARTMENT.CODE_INVALID` (`department.service.ts:74-75`); department PATCH and employee PATCH cannot change codes; bootstrap DTO fixed in 5ffe8a25 and guide/`bootstrap-installation.sh` example `IT` valid; demo dataset (`DS1-*`) and dev seed (`DEMO`, `DEMO-IT`…) codes valid.
2. Unplaced: `createEmployeeWithPlacement` skips the placement row when `departmentId` null; no CREATED notice without department (manual + import); `/me`, candidates, profile read `unplaced`; import summary/result `newUnplaced` with `.default(0)` for stored JSON from before. Every consumer of `getOwningUnits`/`getEmployeePlacement`/`getPlacementInForce` outside organization handles `undefined/null` (budgets, catalog requestable-software → own 4xx, licensing assignment/provisioning/expiry, seat baseline → OWNING_DEPARTMENT_NOT_FOUND, post-setup review, leave/notice notices, cancellation, dashboards via headed department). `profileNotices` null-safe. Head assignment of an unplaced person → `NOT_A_MEMBER_ON_DATE` 4xx (`department-head.service.ts:290`). Transfer → 409 `DEPARTMENT_TRANSFER.EMPLOYEE_UNPLACED`. No `!`/`as string` on department/placement in the diff except pre-existing safe ones.
   Request-party: `unplacedAmong` fills both locked and unlocked facts; every Request creation goes through it — `RequestSenderService.lockEligible` (access request submit, draft save, draft submission, proposal, service-account), `delegated-request` assertEligible, group check/submit (`blockOf` + `ineligibleAmong`), renewal and return `assertEligible`, provisioning holder; preview now refuses UNPLACED. All controllers fall through to `toAccessRequestApiException`, which maps `RequestPartyIneligibleError` to 422.
3. First placement: class-level `@RequireRoles('SUPER_ADMIN')` + `assertMayEnterEmployees`; uuid param; lock department FOR UPDATE → employee FOR UPDATE (matches module order); checks exists (404), ACTIVE and not HANDING_OVER/LEFT (409), any placement row incl. future (409 ALREADY_PLACED), department exists/ACTIVE (404/409), `effectiveFrom ≥ businessToday(tx)` and `≥ hireDate` (422); audit `EMPLOYEE.FIRST_PLACED`; reuses CREATED notice; 201 envelope with employee view. Concurrency: second placer blocks on the employee row, re-reads placements after the lock (READ COMMITTED new statement) → 409; integration test covers it per report.
4. XLSX: `.xls` refused (controller and service); xlsx by extension or MIME + `PK\x03\x04` magic; corrupt → `IMPORT.FILE_UNREADABLE` 422; `worksheets[0]` is the first tab (exceljs sorts by `orderNo`); formulas use cached `result` (no recalculation); numbers → `String(n)` (no `.0`); empty → ''. Dates: exceljs `excelToDate` builds a UTC instant whose UTC calendar day equals the Excel wall date (date1904 honoured), so `toISOString().slice(0,10)` gives the typed day with no Asia/Ho_Chi_Minh shift — correct, and org timezone must NOT be applied. Samples: 6 files present, headers exact, codes valid, departments `DS1-ENG/DES/OPS` exist in `shared-demo-v1.ts` (DS1-OPS intentionally headless/no CC — preview will list it under departmentsWithoutHead), employees-15 has 3 blank departments, `expected-results.json` matches the CSV content and is asserted for CSV+XLSX by `employee-import-xlsx.service.spec.ts`. `.gitattributes` marks the xlsx binary. Samples are built from CSV text, so they contain no real Excel date cells (date path only covered by the unit test).
5. `package.json` `"exceljs": "4.4.0"` exact; lockfile consistent (`exceljs@4.4.0`, overrides block identical to `pnpm-workspace.yaml`); `exceljs>uuid 11.1.1` keeps CJS export and `v4` (only used in exceljs conditional-formatting write path); brace-expansion bumps stay in-major; lockfile diff removes only brace-expansion 1.1.18/2.1.4 and a `call-bound` entry. Dockerfile `pnpm install --prod --frozen-lockfile` copies `pnpm-workspace.yaml`, so overrides apply in the image. Note: exceljs brings archiver, unzipper, jszip, fast-csv, dayjs, saxes, tmp into the runtime image (order of 15–25 MB, not measured) and is imported at app start.

## Not verified
- Full test suite (running separately). Codex itself did not prove all `test/support` fixtures; harnesses I sampled generate valid uppercase codes (`P-1`, `PI-1`, `E-D-1`, `.toUpperCase()` in seat harness).
- Runtime behaviour of exceljs on Node 24 inside the image; memory numbers for M2.
