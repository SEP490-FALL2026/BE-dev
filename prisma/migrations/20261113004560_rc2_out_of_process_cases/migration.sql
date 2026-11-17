-- RC-2.2 (QĐ-111y, R-45, C-4): the case of what happened outside the process (`SBF-07a`), opened when the IT Admin decides a difference of an
-- account at the vendor is outside the process, and closed once by Finance or the IT Admin as a false alarm, as money already spent that has a
-- proof of payment (the amount in dong, the Cost Center or none yet, the files), or as a report only with the reason (R-45: nothing is recorded
-- without a proof). The money of `RECORD_SPENT` is the one invoice of the case (`invoices.out_of_process_case_id`, a value of the budgets
-- context). The case keeps no evidence of the review: the difference it came from (`discrepancy_id`, a value) is deleted after 24 months.
-- Expand only; safe to run twice.

CREATE TABLE IF NOT EXISTS "out_of_process_cases" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" uuid NOT NULL,
    "discrepancy_id" uuid NOT NULL,
    "application_id" uuid,
    "vendor_id" uuid,
    "opened_at" timestamptz(3) NOT NULL,
    "state" "OutOfProcessCaseState" NOT NULL DEFAULT 'OPEN',
    "outcome" "OutOfProcessOutcome",
    "note" text,
    "closed_by_employee_id" uuid,
    "closed_at" timestamptz(3),
    -- Only for `RECORD_SPENT`: what was spent in dong, the Cost Center that bears it (none = not allocated yet) and the proofs of payment.
    "amount_minor" bigint,
    "cost_center_id" uuid,
    "document_ids" uuid[] NOT NULL DEFAULT '{}',
    CONSTRAINT "out_of_process_cases_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "out_of_process_cases_state_check" CHECK (
        ("state" = 'OPEN' AND "outcome" IS NULL AND "note" IS NULL AND "closed_by_employee_id" IS NULL AND "closed_at" IS NULL
            AND "amount_minor" IS NULL AND "cost_center_id" IS NULL AND cardinality("document_ids") = 0)
        OR ("state" = 'CLOSED' AND "outcome" IS NOT NULL AND "note" IS NOT NULL AND char_length(btrim("note")) BETWEEN 1 AND 1000
            AND "closed_by_employee_id" IS NOT NULL AND "closed_at" IS NOT NULL
            AND (("outcome" = 'RECORD_SPENT') = ("amount_minor" IS NOT NULL))
            AND ("outcome" = 'RECORD_SPENT' OR ("cost_center_id" IS NULL AND cardinality("document_ids") = 0))
            AND ("outcome" <> 'RECORD_SPENT' OR ("amount_minor" > 0 AND cardinality("document_ids") BETWEEN 1 AND 20)))
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS "out_of_process_cases_discrepancy_id_key" ON "out_of_process_cases" ("discrepancy_id");
CREATE INDEX IF NOT EXISTS "out_of_process_cases_state_opened_idx" ON "out_of_process_cases" ("organization_id", "state", "opened_at" DESC, "id");

-- An open case moves once, to closed; what it was opened with never changes, a closed one never changes, and none is deleted.
CREATE OR REPLACE FUNCTION out_of_process_cases_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('DELETE', 'TRUNCATE') THEN
    RAISE EXCEPTION 'out_of_process_cases is never deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD."state" <> 'OPEN' THEN
    RAISE EXCEPTION 'a closed case outside the process is never changed' USING ERRCODE = 'restrict_violation';
  END IF;
  IF (NEW."id", NEW."organization_id", NEW."discrepancy_id", NEW."application_id", NEW."vendor_id", NEW."opened_at")
     IS DISTINCT FROM
     (OLD."id", OLD."organization_id", OLD."discrepancy_id", OLD."application_id", OLD."vendor_id", OLD."opened_at") THEN
    RAISE EXCEPTION 'what a case outside the process was opened with never changes' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS out_of_process_cases_guard ON "out_of_process_cases";
CREATE TRIGGER out_of_process_cases_guard BEFORE UPDATE OR DELETE ON "out_of_process_cases"
    FOR EACH ROW EXECUTE FUNCTION out_of_process_cases_guard();
DROP TRIGGER IF EXISTS out_of_process_cases_no_truncate ON "out_of_process_cases";
CREATE TRIGGER out_of_process_cases_no_truncate BEFORE TRUNCATE ON "out_of_process_cases"
    FOR EACH STATEMENT EXECUTE FUNCTION out_of_process_cases_guard();

-- catalog: a proof of payment is owned by the case it was closed with, as a purchase document is owned by the purchase invoice it came with.
ALTER TABLE "document_attachments" ADD COLUMN IF NOT EXISTS "out_of_process_case_id" uuid;
ALTER TABLE "document_attachments" DROP CONSTRAINT IF EXISTS "document_attachments_owner_state",
  DROP CONSTRAINT IF EXISTS "document_attachments_purpose_fits_owner";
ALTER TABLE "document_attachments" ADD CONSTRAINT "document_attachments_owner_state" CHECK (
    ("status" = 'READY') = ("contract_id" IS NOT NULL OR "signer_employee_id" IS NOT NULL OR "purchase_invoice_id" IS NOT NULL
        OR "out_of_process_case_id" IS NOT NULL)
    AND ("status" = 'READY') = ("attached_at" IS NOT NULL)
    AND num_nonnulls("contract_id", "signer_employee_id", "purchase_invoice_id", "out_of_process_case_id") <= 1),
  ADD CONSTRAINT "document_attachments_purpose_fits_owner" CHECK (
    ("contract_id" IS NULL OR "purpose" IN ('CONTRACT_ATTACHMENT', 'PURCHASE_DOCUMENT'))
    AND ("signer_employee_id" IS NULL OR "purpose" = 'SIGNATURE_RECORD')
    AND ("purchase_invoice_id" IS NULL OR "purpose" = 'PURCHASE_DOCUMENT')
    AND ("out_of_process_case_id" IS NULL OR "purpose" = 'PURCHASE_DOCUMENT'));
CREATE INDEX IF NOT EXISTS "document_attachments_out_of_process_case_id_idx" ON "document_attachments" ("out_of_process_case_id");
