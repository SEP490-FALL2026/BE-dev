-- FIX-B3 B3C-01 (QĐ-103m, QĐ-103y(3), QĐ-104j, US-13-05 AC-20, AC-24, AC-25): the case says whether the account is on a company asset (registered with the
-- company email or in the company workspace) when the IT Admin concludes it is outside the process, and the day it was concluded; a case on a company
-- asset ends as REVOKED only with the renewal or payment cancelled and a proof of it. Expand only; safe to run twice.
ALTER TABLE "out_of_process_cases"
  ADD COLUMN IF NOT EXISTS "company_asset" boolean,
  ADD COLUMN IF NOT EXISTS "concluded_on" date,
  ADD COLUMN IF NOT EXISTS "renewal_cancelled" boolean NOT NULL DEFAULT false;

ALTER TABLE "out_of_process_cases" DROP CONSTRAINT IF EXISTS "out_of_process_cases_state_check";
ALTER TABLE "out_of_process_cases" ADD CONSTRAINT "out_of_process_cases_state_check" CHECK (
    ("state" = 'OPEN' AND "outcome" IS NULL AND "note" IS NULL AND "closed_by_employee_id" IS NULL AND "closed_at" IS NULL
        AND "amount_minor" IS NULL AND "cost_center_id" IS NULL AND cardinality("document_ids") = 0 AND "renewal_cancelled" = false)
    OR ("state" = 'CLOSED' AND "outcome" IS NOT NULL AND "note" IS NOT NULL AND char_length(btrim("note")) BETWEEN 1 AND 1000
        AND "closed_by_employee_id" IS NOT NULL AND "closed_at" IS NOT NULL
        AND (("outcome" = 'RECORD_SPENT') = ("amount_minor" IS NOT NULL))
        AND ("outcome" = 'RECORD_SPENT' OR "cost_center_id" IS NULL)
        AND ("outcome" IN ('RECORD_SPENT', 'REVOKED') OR cardinality("document_ids") = 0)
        AND ("outcome" <> 'RECORD_SPENT' OR ("amount_minor" > 0 AND cardinality("document_ids") BETWEEN 1 AND 20))
        AND (("outcome" = 'REVOKED') = "renewal_cancelled")
        AND ("outcome" <> 'REVOKED' OR ("company_asset" IS TRUE AND cardinality("document_ids") BETWEEN 1 AND 20)))
);

-- What a case was opened with never changes: the two new columns are part of it.
CREATE OR REPLACE FUNCTION out_of_process_cases_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('DELETE', 'TRUNCATE') THEN
    RAISE EXCEPTION 'out_of_process_cases is never deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD."state" <> 'OPEN' THEN
    RAISE EXCEPTION 'a closed case outside the process is never changed' USING ERRCODE = 'restrict_violation';
  END IF;
  IF (NEW."id", NEW."organization_id", NEW."discrepancy_id", NEW."application_id", NEW."vendor_id", NEW."opened_at", NEW."company_asset", NEW."concluded_on")
     IS DISTINCT FROM
     (OLD."id", OLD."organization_id", OLD."discrepancy_id", OLD."application_id", OLD."vendor_id", OLD."opened_at", OLD."company_asset", OLD."concluded_on") THEN
    RAISE EXCEPTION 'what a case outside the process was opened with never changes' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;
