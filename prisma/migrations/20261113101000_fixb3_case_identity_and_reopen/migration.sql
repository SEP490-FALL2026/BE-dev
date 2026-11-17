-- FIX-B3 B3C-02 and B3C-04 (QĐ-98h, QĐ-106j, US-13-03 AC-11, US-13-05 AC-26): one case outside the process is open for each account of a vendor, and a
-- difference that was decided and is seen again with newer evidence is opened again instead of being swallowed.
-- Expand only; safe to run twice.

-- B3C-02: the account a case is about, as `<vendor or none>:<identifier, or employee:<id>>`, and one open case for each. A case that is closed has none
-- (it is never changed again); an open one gets it from the difference it was opened from, and a second open case of the same account that older data
-- may hold keeps its own difference in the key so that the index can be made.
ALTER TABLE "out_of_process_cases" ADD COLUMN IF NOT EXISTS "identity_key" text;

UPDATE "out_of_process_cases" c
   SET "identity_key" = ranked.key || CASE WHEN ranked.n > 1 THEN '#' || ranked.discrepancy_id::text ELSE '' END
  FROM (
    SELECT c2."id", c2."discrepancy_id",
           concat(coalesce(c2."vendor_id"::text, 'no-vendor'), ':',
                  coalesce(lower(btrim(d."identity")), 'employee:' || d."employee_id"::text, 'discrepancy:' || d."id"::text)) AS key,
           row_number() OVER (
             PARTITION BY c2."organization_id", c2."vendor_id", coalesce(lower(btrim(d."identity")), 'employee:' || d."employee_id"::text, 'discrepancy:' || d."id"::text)
             ORDER BY c2."opened_at", c2."id") AS n
      FROM "out_of_process_cases" c2
      JOIN "vendor_account_discrepancies" d ON d."id" = c2."discrepancy_id"
     WHERE c2."state" = 'OPEN' AND c2."identity_key" IS NULL
  ) ranked
 WHERE c."id" = ranked."id";

CREATE UNIQUE INDEX IF NOT EXISTS "out_of_process_cases_open_identity_key"
    ON "out_of_process_cases" ("organization_id", "identity_key") WHERE "state" = 'OPEN' AND "identity_key" IS NOT NULL;

-- B3C-04: the same thing seen again after it was decided is a new open row; at most one row of a thing is open. The decided one it follows is named.
ALTER TABLE "vendor_account_discrepancies" ADD COLUMN IF NOT EXISTS "reopened_from_id" uuid;
DROP INDEX IF EXISTS "vendor_account_discrepancies_source_key";
CREATE UNIQUE INDEX IF NOT EXISTS "vendor_account_discrepancies_open_key"
    ON "vendor_account_discrepancies" ("organization_id", "source", "source_ref") WHERE "state" = 'OPEN';
CREATE INDEX IF NOT EXISTS "vendor_account_discrepancies_source_idx"
    ON "vendor_account_discrepancies" ("organization_id", "source", "source_ref");
