# r2 review v4a — Việc 4 BUSINESS + CONTRACT (`08cbc382`), 03/11/2026

Skills read and used: `code-review-and-quality` (five-axis review, spec match, tests), `security-and-hardening`
(authz/IDOR on every route, file/upload handling, raw SQL). Verification-before-completion mapped to: every finding below was
checked by reading the code at `7102293e`/`08cbc382` (no test run, per the brief); "verified" = read and traced, "suspected" = not traced end to end.

Scope: `src/modules/budgets/attachment/**`, `proposal/proposal-sender.service.ts`, `budget-view/*`, `budget/version.repo.ts`,
`budget/budget.dto.ts`, both migrations, `src/infrastructure/object-storage/{upload-inspection,file-signature}.ts`, new tests and
harness, samples. Spec: `docs/workspace/items/qd93-budget-record-attachments/spec.md` (sections 3–14, test matrix).

## Blocker

### B1 — raw `SELECT *` rows are read with camelCase keys: lock, bind, remove, discard, sweep and the head's list are broken
`src/modules/budgets/attachment/budget-attachment.repo.ts:47-63, 209-240, 268-281` + `toRecord` `:284-302`.
`lock`, `lockManyAsc`, `pageByVersionAsLastSent`, `findExpiredCandidates` use `$queryRaw\`SELECT * …\`` which returns DB column
names (`uploaded_by_employee_id`, `version_id`, `file_name`, `attached_at`, `created_at`, …; the model maps every field with
`@map`, `prisma/models/budgets.prisma:381-407`). `toRecord` reads `row.uploadedByEmployeeId`, `row.versionId`, … ⟹ all `undefined`
except `id`, `target`, `status`. Consequences (each traced):
- `ProposalAttachmentBinder.bind` (`proposal-attachment-binder.service.ts:28-37`): `record.uploadedByEmployeeId === actor.employeeId`
  is always false ⟹ every `attachmentIds` is "not attachable" ⟹ **the head can never send a proposal with files** (Owner's need).
- `BudgetAttachmentRemovalService` (`budget-attachment-removal.service.ts:83-85`): `record.versionId !== versionId` always ⟹
  every removal 404 `BUDGET_ATTACHMENT.NOT_FOUND`.
- `BudgetAttachmentDiscardService` (`budget-attachment-discard.service.ts:38`): `locked.uploadedByEmployeeId !== actor` ⟹ discard
  always 404 (the "my unattached files" cleanup does not work).
- `BudgetAttachmentExpiryService.expireOne` (`budget-attachment-expiry.service.ts:47`): `expiresAt(status, undefined)` ⟹ TypeError
  per row, caught and logged ⟹ the sweeper never expires anything.
- `listVersionAttachments` for the head (`AS_LAST_SENT`, `budget-attachment-query.service.ts:84`) ⟹ mapper
  `(record.attachedAt ?? record.createdAt).toISOString()` (`budget-attachment.mapper.ts:52`) on `undefined` ⟹ **500** for the head's
  D-S24 list on every sent version (Finance/approver use Prisma `findMany` and work).
Fix: follow the repo pattern (`catalog/contract/document.repo.ts:50-56`): raw `SELECT id … FOR UPDATE [SKIP LOCKED]` then
`findUnique`/`findMany({ where: { id: { in } } })`; for the AS_LAST_SENT page use Prisma `findMany` with
`attachedAt: { lte: sentAt }, OR: [{ removedAt: null }, { removedAt: { gt: sentAt } }]` (or alias every column `AS "camelName"`).
Verified by reading.

### B2 — `NOT_ATTACHABLE` is not mapped on the proposal routes ⟹ 500 instead of 422
`src/modules/budgets/proposal/budget-proposals.controller.ts:121-123, 276-278` catch with `toBudgetApiException`
(`budget/budget.http-errors.ts:62-222`), which has no branch for `BudgetAttachmentNotAttachableError` (plain `Error`) and returns
it unchanged ⟹ global filter answers 500. Combined with B1 every submit/resubmit with `attachmentIds` answers 500. The OpenAPI of
both routes advertises `ATTACHMENT_EXAMPLES.NOT_ATTACHABLE` 422 — contract lies. Fix: in both catches use
`toBudgetAttachmentApiException` (it falls back to `toBudgetApiException`, `budget-attachment.http-errors.ts:86`), or map the error in the
proposal controller. Verified by reading.

## High

### H1 — the new integration tests cannot be green; they were not run
- `upload?.uploadToken` is asserted truthy (`budget-proposal-attachments.integration-spec.ts:39`,
  `budget-version-attachments.integration-spec.ts:36`) but the wire is `{ url, method, headers, expiresAt }`
  (`budget-attachment.dto.ts:12-20`); harness type `test/support/budget-attachment-harness.ts:25` is invented. Always fails.
- Submit-with-files (`…proposal-attachments…:53`, expects 201), NOT_ATTACHABLE tests (expect 422), discard tests, removal tests,
  D-S24 test (removal step + head list), expiry tests all hit B1/B2. Gemini's report "tests pass" is not credible for this commit.
Fix: correct harness wire type, fix B1/B2, then run the files. Verified by reading.

### H2 — AC rows of the spec's Primary Story/AC table without a test that exercises them
- `US-06-10` AC-15 (head/Finance/approver list + download proposal docs; H2/IT/SA/E 404; head change H1→H7): **no test**.
- `US-06-10` AC-16 (no add/remove after submit in any state; old ids in resubmission ⟹ 422; trigger on SQL attach): only the
  generic "no DELETE/PATCH/PUT on `/budget-attachments/{id}`" HTTP case; no resubmission case, no `/budget-proposals/{id}/attachments`
  POST/DELETE 404 case.
- `US-06-11` AC-11 (approver lists version + source proposal docs, gets link, numbers unchanged; approver declare/remove 403): **no
  test** (HTTP role loops omit `SPENDING_APPROVER`).
- `US-06-09` AC-25 (F1/C1/H1 200; H2 404; IT/SA/E 403 list + 404 link; head change; APPROVED/REJECTED/SUPERSEDED/EXPIRED): only the
  unsent-draft 404 case. D-S24 test lacks "B removed before send hidden from head", "resend ⟹ new set", and C1's view.
- `US-06-09` AC-24: no "import still separate / no lines created" case, no list/audit check; AC-26: SENT/APPROVED/… refusal only for
  remove-after-send and declare on non-editable; no CHANGES_REQUESTED add/remove history (other than inside the broken D-S24 test).
- Also missing from the matrix: limits (21st file, 21 ids, duplicate ids ⟹ 422), all lock-wait races, storage-unavailable 503,
  link expiry (`t+300`), query-count for the four lists, mine-versions exclusions (unsent V11, H2, order, non-head 403).
Verified by reading the test titles and bodies.

### H3 — sweeper does not skip locked rows (spec §10/§12)
`budget-attachment.repo.ts:268-281` runs `FOR UPDATE SKIP LOCKED` outside a transaction (lock released at once), then
`expireOne` takes a plain `FOR UPDATE` (`lock`) and **waits** on a row held by a proposal send. Correct outcome after wait, but not
the spec's "sweeper không chờ"; with many rows the hourly pass can stall. Fix: select ids with `SKIP LOCKED` inside the per-row tx.
Verified by reading.

## Medium

- M1 — final copy goes to `documents/…` (`budget-attachment-completion.service.ts:110`, `finalScope: 'documents'`) — the contract
  documents prefix; spec §10/§11 says `budget-documents/<yyyy>/<mm>/<uuid>`. Fix: `'budget-documents'`. Verified.
- M2 — `completeProposal` (`…completion.service.ts:120-137`) does not withdraw the final copy when its transaction fails (e.g. lost
  race with discard ⟹ orphan object); pending key is never deleted after commit on either target (spec §10). Fix: same
  try/catch `withdrawCopy` as `completeVersion`; delete `objectKey` after commit. Verified.
- M3 — `.gitattributes` line `docs/examples/budget-attachments/files/** -text` missing (spec §14, Owner-approved). Repo has
  `core.autocrlf=true`; working-tree `nhu-cau-2027.csv` is CRLF while the blob is LF ⟹ `budget-attachment-samples` sha256/size check
  fails on Windows and FE gets different bytes than `manifest.json`. Verified (od of file vs blob).
- M4 — `quarantine`/`expireUpload` in complete write without row lock or status re-check (`…completion.service.ts:171-201`): a
  concurrent discard ⟹ DISCARDED→QUARANTINED trigger `55000` ⟹ 500. Fix: lock + re-check `AWAITING_UPLOAD`. Suspected (race).

## Low

- L1 — `mineVersionSummarySchema.state` is `z.string()` (`budget/budget.dto.ts`, diff) — spec §7 enum of six states. Contract.
- L2 — `contentType` compared lowercase but stored/signed as sent (`budget-attachment.policy.ts:91`, declaration service) —
  `Application/PDF` accepted and kept with that casing. Normalise to the canonical MIME.
- L3 — expired-on-complete returns `UPLOAD_EXPIRED` for an already `EXPIRED` row (spec: `NOT_AWAITING_UPLOAD`); sweep default
  limit 50 vs spec 100; table `CHECK`s compare enums without `::text` (spec §9) — harmless in the same migration.
- L4 — binder runs before the proposal audit/notify (spec: after) — same transaction, no effect.

## Gemini report vs code (`gemini-qd93-remaining-report.md:26, 65-73, 100`)

| Report claims | Code / spec |
| --- | --- |
| table linked to `budget_records`/`budget_versions` | no `budget_records`; `budget_attachments.target` PROPOSAL (`budget_proposals`) / VERSION |
| migration `20261103150000_budgets_attachments` | two migrations `20261103140000_budget_history_attachment_kinds` + `20261103140100_budget_record_attachments` |
| virus scan `SCANNING/CLEAN/INFECTED` | not implemented (spec: out of scope); states AWAITING_UPLOAD/UPLOADED/ATTACHED/REMOVED/QUARANTINED/EXPIRED/DISCARDED, quarantine by size/type/magic bytes |
| SHA-256 hash, integrity check | none in the service (sha256 only in the sample manifest) |
| "quota" | 20 files per record, 20 unattached per uploader, `DOCUMENT_MAX_SIZE_MB` |
| MIME PDF/PNG/JPEG/XLSX/DOCX | plus CSV (spec §6) |
| `POST /budgets/versions/{id}/attachments` | `POST /budget-versions/{id}/attachments` |
| `GET /budgets/attachments/{id}/download` | `POST /budget-attachments/{id}/links` (5-min link) |
| `DELETE /budgets/attachments/{id}` | `POST /budget-versions/{id}/attachments/{attachmentId}/removal`; DELETE answers 404 |
| (not mentioned) | head path `POST /budget-proposals/attachments`, `complete`, `discard`, `GET /budget-attachments/mine`, `GET /budgets/mine/versions`, proposal list, `attachmentIds` on submit/resubmit — present in code |

The report is inaccurate, but the **routes in code match spec §7 exactly (10 new operations, 312 total)**; the head upload path
exists. It is B1+B2 that make it unusable at runtime.

## Checked and found correct

- Route set, guards and operationIds match spec §7; `no-store` on declare and link; 401 for all 10 (HTTP test).
- Migrations: enum split per DB-05 precedent, shape check rebuilt with `::text` (old branches verbatim), table, checks, indexes,
  FKs, trigger (kept/born_awaiting/declared/fixed/one_way/target_locked, not SECURITY DEFINER).
- Viewer rule `budgetRecordView` and its unit test; 403 vs 404 split for the version list; link 404 for unreadable/unverified;
  AS_LAST_SENT SQL condition equals spec §5a; AS_LAST_SENT link check (uses `findUnique`, so it works).
- Declaration: role/head checks, `FINANCE.SETUP_INCOMPLETE`, advisory uploader lock then counts (limit race safe), version locked
  first; complete: lockEditable → row lock → re-check + limit → ATTACHED + history (string values) + audit, copy withdrawn on failure.
- `UploadInspection` head→declared match→`readPrefix(512, IfMatch)`→`copyIfMatch`; file-signature table incl. CSV rules.
- `budgetMineVersionList`: MANAGER guard, `ownCostCenter` 403, `sent_at IS NOT NULL`, order, RepeatableRead, five fields, no amounts.
- `ProposalService` stays at 8 deps; `ProposalSender` 7; capability direction proposal→attachment→version→budget; architecture gate
  table owner added; manifests (coverage + example) list the 10 operations.
