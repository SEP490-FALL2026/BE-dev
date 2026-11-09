# R2 review v1: Việc 1, commit `06432772`

Worktree `D:\FPT\FALL2026\Code\BE-qd93-audit2` at `7102293e` (base `30d14ac4`). Read-only. No pnpm, jest or prisma was run.
Two scratch `node` scripts in the scratchpad built in-memory ZIPs and ran them through a JS copy of the guard and the
repo's own `jszip` (exceljs 4.4.0 dependency).

## Skills read and used
- `code-review-and-quality` (`C:\Users\Asus\.claude\skills\code-review-and-quality\SKILL.md`). Used as the process skill:
  the five-axis review and severity labels.
- `security-and-hardening` (`C:\Users\Asus\.claude\skills\security-and-hardening\SKILL.md`). Used as the domain skill for
  the upload, zip-bomb and input checks.
- Verification-before-completion is mapped to the "verify the verification" step of the review skill. Each finding
  says whether it was VERIFIED (by reading, or by a reproduction script) or SUSPECTED.

Spec: the "Việc 1" section of `gemini-qd93-remaining-prompt.md`. Sources: `review-codex-lean.md` (M2, L4, L5, L6, L8,
Nit), `review-directory.md` (L4, L7) and the roadmap row "Điểm nhỏ còn lại".

---

## Findings

### MEDIUM-1: The XLSX size guard can be bypassed in two ways, so M2 is not closed (VERIFIED by reproduction)
`src/modules/data-import/employee-import/preview/employee-import-xlsx.service.ts:19-55`

The guard adds up the uncompressed sizes that the central directory declares for the first `cdTotalEntries` entries. Both
the sizes and the count come from the attacker.

1. **Lying size.** jszip (`jszip/lib/compressedObject.js:31-39`) compares the real inflated length with the declared
   `uncompressedSize` only on the `end` event, after it has inflated the whole entry into memory. Reproduction: an
   815 KB file (under the 2 MiB upload cap) declares 100 bytes and inflates to 800 MB. The guard passes it. jszip then
   inflates all of it, peaks at about 980 MB RSS and runs for 6.5 s before throwing "uncompressed data size
   mismatch". At the full 2 MiB cap this is about 2 GB, so a likely OOM.
2. **Entry count = 0.** The guard loops `cdTotalEntries` times, so a count of 0 sums nothing. jszip
   (`zipEntries.js:129-151`) ignores the count: it reads central-directory records while the signature matches, and
   it only throws when the count is non-zero and no record was found. Reproduction: a 298 KB file declares 300 MB
   honestly with the EOCD count set to 0. The guard passes it, and jszip returns a 314,572,800-char string (peak about
   470 MB).

The caller must be a Super Admin, so the severity stays at M2's level (Medium). But the item is reported as done
when it is not.

**Fix (about 25 lines, no new dependency):**
- (a) Walk the central directory from `cdOffset` while the signature is `0x02014b50`, staying within `cdOffset + cdSize`.
  Require the walked count to equal the EOCD count, and both to be greater than 0.
- (b) Reject ZIP64 and multi-disk archives as `INVALID_XLSX`: any 0xFFFF or 0xFFFFFFFF field, or a non-zero disk number.
- (c) Bound the real inflation. For each entry, read the local header (`offset + 42` → local name and extra lengths)
  and slice `compressedSize` (CD `+20`).
  - Method 8: `zlib.inflateRawSync(slice, { maxOutputLength: remaining + 1 })`. A `RangeError` means
    `UNCOMPRESSED_SIZE_EXCEEDED`. Require `out.length === declared`, otherwise `INVALID_XLSX`.
  - Method 0: require compressed size equal to declared size.
  - Any other method, or the encryption bit set: `INVALID_XLSX`.

  The cost is one extra inflation of at most 20 MB. After this check jszip's inflation is bounded too.

Add unit cases for both bypasses and for malformed archives: no EOCD, CD out of range, bad signature.

### LOW-1: The preview 422 example shows a reason that preview never returns (VERIFIED by reading)
`src/modules/requests/request-submission/access-requests.controller.ts:117-120` and `openapi.json` (accessRequestPreview 422)

- The example reused is `EXAMPLES.REQUEST_PARTY_INELIGIBLE` with `reason: 'SPENDING_APPROVER'`
  (`access-request.http-errors.ts:167-173`).
- Preview throws only for `UNPLACED` (`request-preview.service.ts:92`). A spending approver gets 200 with
  `blockedBy` and `canSubmit: false`.
- The description "the caller cannot be party to the request" hides this, so a FE reading the docs would expect a
  422 for a spending approver.

**Fix:** add a preview-specific example with `reason: 'UNPLACED'`, and change the description to "the caller is not
placed in a department (REQUEST_PARTY.INELIGIBLE, reason UNPLACED); a spending approver gets 200 with blockedBy". Also
add `RequestPartyIneligibleError` to the `Throws` line of the service JSDoc (line 30).

### LOW-2: The new size reason is not documented in OpenAPI (VERIFIED)
`employee-imports.controller.ts:130-142`

The 422 `IMPORT.FILE_UNREADABLE` is reused, which the prompt allows. But neither the description nor any example says
that `details.reason` can be `UNCOMPRESSED_SIZE_EXCEEDED`, or that the limit is 20 MB uncompressed.

**Fix:** one sentence in the description. Optionally add a second example.

### LOW-3: The seat-baseline uppercase test misses the lookup path (VERIFIED)
`seat-baseline-rows.policy.spec.ts:58-62`

The test hands `judgeOne` facts already keyed by `E1`, so it only covers `judgeAlone` (line 281). If the
`lookupNamesOf` change (line 92) were reverted, the test would still pass, but `getEmployeesByCodes`
(`employee.repo.ts:375`, a case-sensitive `in`) would return nothing in production.

**Fix:** `expect(lookupNamesOf([{ cells: { employee_code: ' nv-1 ' } }]).employeeCodes).toEqual(['NV-1'])`.

### LOW-4: Directory edge tests: two are weak or fragile (VERIFIED by reading)
In `test/integration/organization/employee-directory.integration-spec.ts`:
- `:587-593` "page beyond the end" asserts `totalItems >= 4`. A wrong but non-zero count would still pass. Assert that it
  equals `totalItems` of page 1 with the same filter.
- `:511-514` workState and `:448-451` valid_to=today check `not.toContain` on page 1 (default `pageSize` 20) of the
  whole list or the department. They are not vacuous today, because few rows exist and the positive tests use the
  same query. But they become vacuous once the file seeds more than 20 rows ahead of these. Add `q=<code>` to the
  query.
- `:595-625`: the 51 placements start in 1971–2021, before the 2020 hire date, inserted by raw SQL. That is acceptable
  as a fixture. Order and content of the 50 rows are not checked.

### NIT
- `escapeLikePattern` now lives in `organization/employee/employee.policy.ts`, which is the Super Admin role policy. A
  SQL LIKE helper fits better next to the repo or in `src/core`.
- In `employee-directory-search.policy.ts:12` the `import` sits after `const` declarations.
- Behaviour is unchanged: `/([%_\\])/g → '\\$1'` is equivalent to the old function, and all three callers use the
  single copy.
- The BOM is still present in `scripts/examples/build-employee-import-examples.mjs`. It was removed from the xlsx
  service and spec.

---

## Gemini report vs diff (scope creep check)
None of the extra features the report claims are in `06432772`, or anywhere in `30d14ac4..7102293e`. No contract or
behaviour changed through them. The report is inaccurate:

| Claim | Reality |
|---|---|
| New file `xlsx-uncompressed-size.policy.ts` and its spec | Does not exist. The guard is inline in `employee-import-xlsx.service.ts`, and the test is in its existing spec. |
| INV-20 check `department_head_requires_membership` on department edit | Not in the diff. It is a DB trigger that already existed (migrations `20261016160000`, `20261024140200`). |
| Excel template download route | No route, and no route-manifest or OpenAPI change. Only the sample CSV/XLSX in `docs/examples` changed. |
| CSV export UTF-8 BOM | No `\uFEFF` was added anywhere. The commit actually *removed* a BOM from two `.ts` files. |
| Sort-field regex tightened | Nothing in the diff. |
| `totalItems` "computed correctly" | No production change, only a test. |
| "Zod/OpenAPI pattern accepts both cases" | False. The `pattern` stays uppercase-only, and only the `description` changed (which is what the prompt asked). |

## Checked and correct
- **(a) Guard parsing.** EOCD backward scan within 65,557 bytes, which is the same strategy as jszip. Every read is
  bounds-checked, so malformed input is refused as `INVALID_XLSX` and does not crash. ZIP64 markers fail closed: 0xFFFFFFFF
  offset or size is refused. The 20 MB threshold is sensible. Mapped to 422 `IMPORT.FILE_UNREADABLE` with
  `details.reason`, and the English message is under 160 chars. The unit test asserts name and reason, so it is not
  vacuous. Seat-baseline has no XLSX path.
- **(b) Uppercase.** Seat baseline `lookupNamesOf` (92) and `judgeAlone` (281) are consistent, `cell()` trims, and
  `lockedFacts` looks up the uppercased codes against DB-keyed maps. Both CLIs `trim()` in `text()` and then
  `.toUpperCase()`, with unit tests. Other CLIs: bootstrap is out of scope.
- **(c) Descriptions.** The three `pattern` fields (employee code, employee departmentCode, department code) are updated
  in the DTOs and in `openapi.json`. The preview 422 is added to `ROUTE_ERROR_CODES_REQUESTS`.
- **(d) Samples.** The template is now `NV-9001` / `nv9001.employee@example.test`. The XLSX was regenerated: a script
  confirmed that all three `.xlsx` files match their `.csv` row for row. `expected-results.json` needed no change (the
  template is still 1 valid row in `DS1-ENG`), and there are no remaining references to the old value.
- **(e) Directory.** There is a single `escapeLikePattern`. `EmployeePlacementRow` is removed and has no users. The edge
  tests cover each spec item:
  - valid_to=today: excluded, `department: null`; current rule is `valid_to > today`.
  - valid_from=today: included.
  - workState filter.
  - Future-only placement through the real first-placements route: `department: null`, `unplaced: false`.
  - `+tag`: `normalizeEmail` strips the tag, so the test is discriminating.
  - Uppercase UUID in `q` and in the path.
  - Page past the end.
  - 51 placements → 50 + `placementsHasMore`.

  "Today" comes from `OrganizationReadApi.businessToday()`, and the codes match the required format.
- **(f) Messages.** `OFFBOARDING.EMPLOYEE_UNPLACED` and `TRANSFER.EMPLOYEE_UNPLACED` are now English. A grep of all
  `*errors*.ts`, services, policies, controllers and DTOs at `06432772` and at HEAD found no Vietnamese in any wire
  error message. The remaining Vietnamese is in email templates, parameter labels, the tax label and demo fixtures,
  which is product content and not error messages. `FirstPlacementError.ALREADY_PLACED` was already English at base.
