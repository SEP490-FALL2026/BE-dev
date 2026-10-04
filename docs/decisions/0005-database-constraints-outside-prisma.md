# ADR-0005: Express database invariants Prisma cannot model in hand-written migration SQL

## Status

Accepted (technical decision, 2026-10-02). Resolves `LR-12` of Docs `ERD/logical/LOGICAL-ERD-S0.md` v0.2.

**Implementation annotation — 2026-10-03:** source was restored to foundation HEAD `78cb675`. The S0 migration, `partialIndexes` flag and constraint integration suite referenced below are implementation requirements, not present-tense proof. `prisma migrate diff` compares only features Prisma understands; a zero diff does not prove that custom triggers, grants or exclusion constraints exist or behave correctly. Keep the separate named-object and behavioral PostgreSQL checks in decisions 5–6.

## Date

2026-10-02

## Context

The Logical S0 design puts several invariants in PostgreSQL rather than in application code (BRD 5.12.2: _what the database can enforce, it enforces_): temporal non-overlap (`EXCLUDE … USING gist`), multi-column `CHECK`s, composite foreign keys that stop cross-organization references, a deferred coverage trigger (`INV-14b`), a manager-cycle trigger and an append-only audit table.

Prisma 7.9 models plain/composite unique constraints, composite foreign keys and — behind the `partialIndexes` preview feature — partial indexes (`where: raw("…")`, PostgreSQL migrations and introspection fully supported; prisma.io v7 _Indexes_, read 2026-10-02). It does **not** model `CHECK`, `EXCLUDE`, triggers, functions, grants, or expression indexes ("indexes using a function … are not yet supported").

## Decision

1. Enable `previewFeatures = ["partialIndexes"]` and declare partial unique indexes in the schema, so `prisma migrate diff` never proposes dropping them.
2. Write everything else by hand in the migration that creates the table: create the migration with `prisma migrate dev --create-only`, append the SQL, then apply. Name every hand-written object explicitly (`<table>_<rule>_check`, `<table>_<rule>_excl`, `<table>_<rule>_trg`).
3. Avoid expression indexes. Where uniqueness is case-insensitive, store the canonical value (e.g. `app_users.login_email` is stored lower-cased) and add a `CHECK (col = lower(btrim(col)))`.
4. Never edit an applied migration. A change is a new migration.
5. Drift control: `test/integration/schema-constraints.integration-spec.ts` asserts that every named hand-written object exists in the migrated database and runs `prisma migrate diff --from-config-datasource --to-schema prisma --exit-code` (exit code 0 ⇒ no drift between the migrated database and the schema). Each later migration is reviewed for `DROP INDEX`/`DROP CONSTRAINT` lines it did not intend.
6. Each invariant has an integration test against real PostgreSQL that fails when the object is removed.

## Alternatives considered

- **Raw-SQL partial indexes without the preview flag.** Works, but every future `migrate dev` emits a `DROP INDEX` for them that a reviewer must catch by hand.
- **Application-only checks.** Rejected: races (two transactions inserting overlapping periods) cannot be closed in application code without locks that are easy to forget.
- **`prisma db push`.** Not a migration strategy; forbidden by `docs/rules/database-business.md`.

## Consequences

- Reviewers must read `migration.sql`, not only the Prisma diff.
- The preview flag may change between Prisma minors; the drift test makes a behaviour change visible.
- The append-only guarantee is only as strong as the role model: locally the API connects as the table owner, so the trigger is the effective guard (an owner could disable it). Production must run migrations as an owner role and the API as a separate role without `UPDATE`/`DELETE`/`TRUNCATE` on `audit_events`.
