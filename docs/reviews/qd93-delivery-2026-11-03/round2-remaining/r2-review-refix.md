# QĐ-93 remaining — re-review of round-2 fixes (tag: refix, 03/11/2026)

Skills read: `code-review-and-quality` (five-axis review, tests first), `security-and-hardening` (files/SQL/authz),
verification = every claim below checked by reading `git diff 7102293e..effea964` / `30d14ac4..effea964` and the files at
`effea964`. Read-only: no pnpm/jest/prisma run.

## Original Blocker/High — status
| ID | Status | Evidence |
|---|---|---|
| V4-B1 raw `SELECT *` | fixed | `budget-attachment.repo.ts:52-100`: lock/lockManyAsc/lockNextExpired select `id` FOR UPDATE then read via model; `pageByVersionAsLastSent` uses `findMany`/`count`; `findExpiredCandidates` removed; no `SELECT *` left in module |
| V4-B2 NOT_ATTACHABLE → 500 | fixed | `budget-proposals.controller.ts:126,282` use `toBudgetAttachmentApiException` |
| V4-H1 `uploadToken` tests | fixed | tests now assert `not.toHaveProperty('uploadToken')` |
| V4-H2 AC tests | fixed (read titles) | access spec: D-S24 resend, 300 s link, IDOR, 503 cases present |
| V4-H3 sweeper SKIP LOCKED | fixed | `budget-attachment-expiry.service.ts`: one tx per row, `lockNextExpired` inside tx, failed ids excluded |
| V4b-H2 index name drift | fixed | `budgets.prisma:406` `map:` matches migration |
| V5-B1 kept suites | fixed | qd93-role-migration `through: MIGRATION`; dev-seed, direct-approval-roles(+concurrency), spend-approval, step-reassignment-paid, reassignment-harness no longer touch the table/409 |
| V5-B2 mapper 'legacy' | fixed | `deciderRoleOf` throws for 3/4/8; mapper spec asserts that message |
| V5-H1 guard (i)-(iii) + listing | fixed | migration 20261103160000 string_agg of (i),(ii),(iii); columns/enum literals checked against schema |
| V5-H2 migration test vacuous | fixed | test runs the committed guard text (`guardOfMigration`) per kind + 2 full deploys; SA rewrite proven by grant succeeding |
| V3-H1 email-outbox | fixed | assertion back to `/activate#token=` = `email-templates.mapper.ts:15` |
Mediums: V1-M1 (CD walk, count match, ZIP64/multi-disk/encryption refused, inflate with `maxOutputLength`), V2-M1/M2, V3-M1..M5,
V4-M1 (`budget-documents`), V4-M2/V4b-M1 (locked quarantine/expire, copy withdrawn unless row names it, upload deleted after commit),
V4-M4, V5-M1..M4 — all addressed in code.

## Judgement calls
- Removing "any approval_role_holders row blocks": RIGHT. `git grep` at 30d14ac4 finds no writer of the table in src/scripts
  (only the model, and preflight reads); a row from an older release could never be closed, so a blanket guard would block forever.
- No `.gitattributes -text`, EOL-independent sample test: acceptable under GATE-EOL=A; test still compares exact bytes/sha after
  CRLF→LF only.
- `EMPLOYEE.EMPLOYEE_LEAVING`: acceptable; absent from dev 30d14ac4 openapi (no FE contract yet), consistent family, deviation
  logged in spec.md §log 03/11.
- REWAIT: restored (`reassignment.policy.ts:111`), service handles it (`step-reassignment.service.ts:181`), unit test restored,
  same-reason KEEP test kept.
- proposal.service.ts vs 30d14ac4: only the ProposalSender extraction + `attachmentIds` pass-through; ProposalSender.send = base
  `send` + `binder.bind` before audit. Suppression removed and lint ceilings lowered 52→51 / 108→107 = actual counts (51, 56).

## New findings (no Blocker/High/Medium)
- L1 `20261103160000…/migration.sql:55` message says "run pnpm ops:preflight" — preflight has no Phase B rows (Task 12 dropped by
  Owner). Fix: say "fix the rows listed below in the application". Verified.
- L2 guard (ii) omits `SPENDING_APPROVER_IS_PARTY` (spec lists it); safe ((i) covers a live approver; REWAIT rewrites the reason)
  but deviation not logged in the approvers spec. Fix: one log line. Verified.
- L3 `20261103160200…:7` "remove them in the running release first" — no app path deletes projects in phase 1 (@@ignore); same for
  labels in 160100. Harmless on the Owner's fresh VPS; reword. Verified.
- L4 `offboarding.controller.ts:112` 409 text "has no placement in force (NO_OPEN_PLACEMENT)" contradicts the 201 text (unplaced is
  recorded); the code throws it only when placements exist but none is open or scheduled. Reword. Verified.
- L5 `spend-approval.integration-spec.ts:230` / `step-reassignment-paid`: nothing now pins what a non-grant holder of a spend step
  gets when deciding (old 409 removed with no replacement). Add one assertion. Verified by reading.
Merges: no conflict hunks in any of the 4 merges (`git show --cc` empty); direct-roles-world carries both the to_regclass check
(legacy) and the trigger-off cleanup (offboarding), disposable DB so ALTER TABLE is safe; openapi.json contains the new texts.
