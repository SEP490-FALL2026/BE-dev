# r2 review v4b — Việc 4 SECURITY + DATA + ARCHITECTURE (commit `08cbc382`)

Skills read: `code-review-and-quality` (five-axis review, severity labels), `security-and-hardening` (authz/IDOR, uploads,
error leaks, destructive ops). Verification skill: equivalent = "evidence before assertion" — every finding below is marked
**read** (verified by reading code + repo precedent) or **suspected**. Nothing was executed (read-only brief: no pnpm/jest/prisma).

Scope: spec/plan `docs/workspace/items/qd93-budget-record-attachments/` §2, §5–§12; storage helpers; migrations; sweeper;
module boundaries; authz on the 10 new routes + submit/resubmit change.

## Blocker

### B1 — Raw `SELECT *` rows are mapped as if camelCase: lock/bind/remove/discard/sweeper/head-list are broken (read)
`src/modules/budgets/attachment/budget-attachment.repo.ts:49` (`lock`), `:58` (`lockManyAsc`), `:228` (`pageByVersionAsLastSent`),
`:273` (`findExpiredCandidates`), all mapped by `toRecord` `:284`.
`$queryRaw` returns DB column names (`organization_id`, `uploaded_by_employee_id`, `version_id`, `created_at`, …); the
Prisma `@map` names are not applied to raw results. Repo precedent aliases explicitly
(`catalog/subscription-owner-assignment/subscription-owner-assignment.repo.ts:37` `"organization_id"::text AS "organizationId"`)
or re-reads through the model (`catalog/contract/document.repo.ts:50-53`). Only `id`, `target`, `status` survive; every other
field is `undefined`. Effects:
- `proposal-attachment-binder.service.ts:34` `record.uploadedByEmployeeId === actor.employeeId` is always false ⟹ every
  submit/resubmit with `attachmentIds` fails `NOT_ATTACHABLE` (AC-14 dead).
- `budget-attachment-discard.service.ts:37` ⟹ discard always 404.
- `budget-attachment-removal.service.ts:73` `record.versionId !== versionId` ⟹ removal always 404 (AC-26 dead); the
  "wrong version path ⟹ 404" test passes vacuously.
- `budget-attachment-expiry.service.ts:49` `expiresAt(locked.status, undefined)` ⟹ TypeError per candidate, caught and
  logged; **nothing ever expires**, 50 error lines per hourly pass; `organizationId` undefined for audit.
- head's `AS_LAST_SENT` list: `budget-attachment.mapper.ts:52` `(undefined ?? undefined).toISOString()` ⟹ 500 (AC-25 dead).
Fix: select explicit aliased columns (or `SELECT id … FOR UPDATE` then `tx.budgetAttachment.findUnique`, like catalog), and
add a repo integration test that asserts every field of `lock()`/`lockManyAsc()`.
The integration specs that exercise these paths (proposal submit-with-attachments, discard, removal, access AS_LAST_SENT,
expiry) would all fail — evidence they were not run despite the report's "all green".

## High

### H1 — `BUDGET_ATTACHMENT.NOT_ATTACHABLE` returns 500 on submit/resubmit (read)
`src/modules/budgets/proposal/budget-proposals.controller.ts:121` and `:277` map with `toBudgetApiException`
(`budget/budget.http-errors.ts:62-222`), which knows nothing of `BudgetAttachmentNotAttachableError`
(`attachment/budget-attachment.errors.ts:61`) ⟹ falls through to `toUnavailableApiException(error) ?? error` ⟹ raw Error ⟹ 500.
The OpenAPI example (`SEND_EXAMPLES` + `ATTACHMENT_EXAMPLES.NOT_ATTACHABLE`) advertises a 422 that never happens.
Fix: in both handlers use `toBudgetAttachmentApiException` (it delegates to `toBudgetApiException`), or map the error in
`budget.http-errors.ts`.

### H2 — Index name drift vs Prisma ⟹ CI `prisma migrate diff --exit-code` (ci.yml:102) fails (suspected, strong)
`prisma/migrations/20261103140100_budget_record_attachments/migration.sql:81` names
`budget_attachments_uploaded_by_status_created_at_idx`; `prisma/models/budgets.prisma` `@@index([uploadedByEmployeeId,
status, createdAt])` has no `map:`, so Prisma expects its default name, truncated to 63 chars with suffix kept
(repo precedent: `assignment_expiry_reminders_recipient_employee_id_created_a_idx`) ⟹
`budget_attachments_uploaded_by_employee_id_status_created_a_idx`. DB-16 drift. Fix: rename in the migration (or add
`map:` in the schema). Run `migrate diff` to confirm.

## Medium

### M1 — Complete flow diverges from the catalog pattern in ways that lose data or give 500 (read)
`attachment/budget-attachment-completion.service.ts`:
- `:110`/`:186-203` quarantine and `:84`/`:205-215` expire run **without** row lock or status recheck (catalog does both
  under `lock` + `status === AWAITING_UPLOAD`, `document.service.ts:162-166, 236-238`). A concurrent complete/discard/sweeper
  ⟹ trigger `budget_attachments_one_way` 55000 ⟹ unmapped ⟹ 500.
- `:117-135` PROPOSAL path has no catch ⟹ commit failure or the 409 race leaves an orphan copy under the final prefix
  (no lifecycle rule there). Spec §10 requires withdrawal.
- `:180-182`/`:217-223` VERSION path withdraws the copy unconditionally; catalog only withdraws when the row does not name it
  (`document.service.ts:209-212`). A lost-ack commit can delete the bytes of a committed `ATTACHED` row.
- Pending object is never deleted after a successful commit (spec §10 "sau commit xóa khóa tạm"; catalog `:189`). Lifecycle
  rule covers it, so low impact.
Fix: one transaction that locks the row, rechecks `AWAITING_UPLOAD`, writes UPLOADED/ATTACHED **or** QUARANTINED; `.catch`
withdraws the copy only if `find(id).finalObjectKey !== finalKey`; delete pending key after commit.

### M2 — Tests: wrong wire shape + no IDOR coverage (read)
- `test/support/budget-attachment-harness.ts:25` types `upload` as `{ uploadToken, objectKey, maxSizeBytes, expiresAt }`;
  the wire is `{ url, method, headers, expiresAt }` (`budget-attachment-declaration.service.ts:248-256`).
  `budget-proposal-attachments.integration-spec.ts:42` `expect(upload?.uploadToken).toBeTruthy()` must fail.
- Missing IDOR cases: head of Cost Center B listing/linking proposal attachments of A (404); Employee/IT Admin/Super Admin
  link ⟹ 404 and version list ⟹ 403; another manager linking someone's `UPLOADED` file (404); Spending Approver on
  declare/remove ⟹ 403 (http-spec covers role guards only with generic accounts). A guessed-id link by a non-reader is the
  main IDOR vector and has no test.

## Low
- L1 `completion.service.ts:103` `finalScope: 'documents'` — spec §11 says `budget-documents/…`; budget files share the
  catalog contract prefix. (read)
- L2 `expiry.service.ts:21` `limit = 50` vs spec 100. (read)
- L3 `repo.ts:273` `FOR UPDATE SKIP LOCKED` on `this.prisma` (autocommit) holds nothing; `docs/rules/security-jobs.md` claims
  candidates are locked that way. Real safety comes from the per-row lock + status recheck, which is correct once B1 is fixed.
- L4 `link.service.ts:14` `LINK_EXPIRY_SECONDS` duplicates `DOWNLOAD_LINK_SECONDS` (`policy.ts:38`) — dead constant.
- L5 `declaration.service.ts:298,353` stores `contentType` as typed (case kept) though the policy compares lower-case;
  normalise to the canonical MIME.
- L6 discard deletes only `finalObjectKey ?? objectKey` (spec: both). Lifecycle covers pending.
- L7 `mapper.ts:52` `attachedAt ?? createdAt` silent fallback hides an invariant (summary rows always have `attached_at`).
- L8 `new ObjectKeyFactory()` in `declaration.service.ts:280,340` instead of the injected provider.
- L9 Gemini report (`gemini-qd93-remaining-report.md:26,68,73,100`) describes SHA-256, virus scan, `DELETE` route,
  `20261103150000_budgets_attachments`, `budget_records` — none exist.

## Checked and correct
- Role guards per spec table on all 10 routes; complete adds the per-target role check; uploader check on complete/discard;
  link denies non-readers with 404 before a URL is signed; `UPLOADED` link owner-only; `AWAITING/QUARANTINED/EXPIRED/
  DISCARDED` never linkable; `budgetRecordView` matches `ProposalViewService.scope` and the D-S15/D-S24 table.
- Version list: 403 before lookup for non-readers, 404 for other/unsent Cost Center.
- Presign: upload 120 s, signs Content-Type + Content-Length (existing adapter); download 300 s, `attachmentDisposition`
  (existing `content-disposition`), declared type, final key only; URL not in audit.
- Allowlist (7 extensions ↔ MIME), extension must match type, name 1–200 no `/ \` control chars, size from
  `DOCUMENT_MAX_SIZE_MB`; head size/type compare + 512-byte prefix with `IfMatch` ETag + `copyIfMatch`; magic bytes per spec;
  CSV rules (BOM, no NUL/C0, UTF-8 with streaming tail, not a binary signature).
- Keys server-generated (`scope/yyyy/mm/uuid`), no user path.
- Storage errors: `ObjectStorageUnavailableError` → 503 via `toUnavailableApiException`; missing/412 recognised.
- Migrations: enum values split from usage; shape check rebuilt with `kind::text`, 3 old branches verbatim; CHECKs and
  trigger (`kept`, `born_awaiting`, `declared`, `fixed`, `one_way`, `target_locked`, SECURITY INVOKER) match spec §9; FKs
  RESTRICT; soft removal keeps object + history row.
- Lock order: version → uploader advisory → attachment rows asc; no path takes attachment before version ⟹ no deadlock.
- Module boundaries: budgets uses `audit/public`, `operating-parameters/public`, infrastructure only; no catalog internals.
  Sweeper registered like `DocumentExpirySweeper` (unref, 5 min first, hourly, logs on error). No secrets in code.
