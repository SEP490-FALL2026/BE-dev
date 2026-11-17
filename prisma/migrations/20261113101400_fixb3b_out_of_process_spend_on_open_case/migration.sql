-- FIX-B3b FX3-02 (US-13-05 AC-19, AC-20, AC-25, QĐ-96e, QĐ-103m): the money Finance records for a case on a company asset is an act on the OPEN case, so the IT Admin can
-- still close it as REVOKED afterwards and the money stays as it was recorded; a case that has money can no longer be closed as a false alarm. The money columns (amount,
-- Cost Center, the proofs of payment) may therefore be set while the case is open, and a REVOKED or REPORT_ONLY case may carry them. Expand only; safe to run twice.
ALTER TABLE "out_of_process_cases" DROP CONSTRAINT IF EXISTS "out_of_process_cases_state_check";
ALTER TABLE "out_of_process_cases" ADD CONSTRAINT "out_of_process_cases_state_check" CHECK (
    ("state" = 'OPEN' AND "outcome" IS NULL AND "note" IS NULL AND "closed_by_employee_id" IS NULL AND "closed_at" IS NULL
        AND "renewal_cancelled" = false
        AND ("amount_minor" IS NULL OR ("amount_minor" > 0 AND cardinality("document_ids") BETWEEN 1 AND 20))
        AND ("amount_minor" IS NOT NULL OR ("cost_center_id" IS NULL AND cardinality("document_ids") = 0)))
    OR ("state" = 'CLOSED' AND "outcome" IS NOT NULL AND "note" IS NOT NULL AND char_length(btrim("note")) BETWEEN 1 AND 1000
        AND "closed_by_employee_id" IS NOT NULL AND "closed_at" IS NOT NULL
        AND ("amount_minor" IS NULL OR "amount_minor" > 0)
        AND ("amount_minor" IS NOT NULL OR "cost_center_id" IS NULL)
        AND (("outcome" = 'RECORD_SPENT') = ("amount_minor" IS NOT NULL) OR "outcome" IN ('REVOKED', 'REPORT_ONLY'))
        AND ("outcome" <> 'FALSE_ALARM' OR cardinality("document_ids") = 0)
        AND ("outcome" <> 'RECORD_SPENT' OR cardinality("document_ids") BETWEEN 1 AND 20)
        AND ("outcome" <> 'REPORT_ONLY' OR ("amount_minor" IS NULL AND cardinality("document_ids") = 0)
             OR ("amount_minor" IS NOT NULL AND cardinality("document_ids") BETWEEN 1 AND 20))
        AND (("outcome" = 'REVOKED') = "renewal_cancelled")
        AND ("outcome" <> 'REVOKED' OR ("company_asset" IS TRUE AND cardinality("document_ids") BETWEEN 1 AND 20)))
);
