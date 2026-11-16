-- RC-1.1 (QĐ-111y, R-29, R-44): the case Finance works from an invoice whose count of seats, or price of one in the currency the invoice states,
-- differs from what was approved or bought. It is opened when Finance signs such an invoice (the invoice's `match_result` is
-- `PRICE_QUANTITY_EXCEPTION`), once for the invoice, and is closed once with who, how and why; a difference of VND only (exchange rate, card
-- fee) opens none. The invoice is in the same module, so it is a foreign key. `mismatches` is what differs: QUANTITY, UNIT_PRICE or both.
-- Expand only; safe to run twice.

CREATE TABLE IF NOT EXISTS "invoice_discrepancy_cases" (
    "id" uuid NOT NULL,
    "organization_id" uuid NOT NULL,
    "purchase_invoice_id" uuid NOT NULL,
    "mismatches" text[] NOT NULL DEFAULT '{}',
    "state" "InvoiceDiscrepancyState" NOT NULL DEFAULT 'OPEN',
    "opened_at" timestamptz(3) NOT NULL,
    "closed_by_employee_id" uuid,
    "closed_at" timestamptz(3),
    "outcome" "InvoiceDiscrepancyOutcome",
    "reason" text,
    -- What Finance works out the invoice cost beyond what was approved or bought, in dong; the money is already in the expense of the invoice.
    "difference_minor" bigint,
    CONSTRAINT "invoice_discrepancy_cases_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "invoice_discrepancy_cases_mismatches_check" CHECK ("mismatches" <@ ARRAY['QUANTITY', 'UNIT_PRICE']::text[]),
    -- Open means nobody has closed it; closed means who, when, how and why, with a difference that is not below nothing and, for a suspicion,
    -- above nothing.
    CONSTRAINT "invoice_discrepancy_cases_state_check" CHECK (
        ("state" = 'OPEN' AND "closed_by_employee_id" IS NULL AND "closed_at" IS NULL AND "outcome" IS NULL
            AND "reason" IS NULL AND "difference_minor" IS NULL)
        OR ("state" = 'CLOSED' AND "closed_by_employee_id" IS NOT NULL AND "closed_at" IS NOT NULL AND "outcome" IS NOT NULL
            AND "reason" IS NOT NULL AND char_length(btrim("reason")) BETWEEN 1 AND 1000
            AND "difference_minor" IS NOT NULL AND "difference_minor" >= 0
            AND ("outcome" <> 'OUT_OF_PROCESS_SUSPECTED' OR "difference_minor" > 0))
    )
);

ALTER TABLE "invoice_discrepancy_cases" DROP CONSTRAINT IF EXISTS "invoice_discrepancy_cases_purchase_invoice_id_fkey";
ALTER TABLE "invoice_discrepancy_cases" ADD CONSTRAINT "invoice_discrepancy_cases_purchase_invoice_id_fkey"
    FOREIGN KEY ("purchase_invoice_id") REFERENCES "purchase_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- One case for an invoice.
CREATE UNIQUE INDEX IF NOT EXISTS "invoice_discrepancy_cases_purchase_invoice_id_key" ON "invoice_discrepancy_cases" ("purchase_invoice_id");
CREATE INDEX IF NOT EXISTS "invoice_discrepancy_cases_state_opened_idx" ON "invoice_discrepancy_cases" ("organization_id", "state", "opened_at", "id");

-- An open case moves once, to closed; what it was opened with never changes, a closed one never changes, and none is deleted.
CREATE OR REPLACE FUNCTION invoice_discrepancy_cases_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('DELETE', 'TRUNCATE') THEN
    RAISE EXCEPTION 'invoice_discrepancy_cases is never deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD."state" <> 'OPEN' THEN
    RAISE EXCEPTION 'a closed case of an invoice that differs is never changed' USING ERRCODE = 'restrict_violation';
  END IF;
  IF (NEW."id", NEW."organization_id", NEW."purchase_invoice_id", NEW."mismatches", NEW."opened_at")
     IS DISTINCT FROM
     (OLD."id", OLD."organization_id", OLD."purchase_invoice_id", OLD."mismatches", OLD."opened_at") THEN
    RAISE EXCEPTION 'what a case of an invoice that differs was opened with never changes' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS invoice_discrepancy_cases_guard ON "invoice_discrepancy_cases";
CREATE TRIGGER invoice_discrepancy_cases_guard BEFORE UPDATE OR DELETE ON "invoice_discrepancy_cases"
    FOR EACH ROW EXECUTE FUNCTION invoice_discrepancy_cases_guard();
DROP TRIGGER IF EXISTS invoice_discrepancy_cases_no_truncate ON "invoice_discrepancy_cases";
CREATE TRIGGER invoice_discrepancy_cases_no_truncate BEFORE TRUNCATE ON "invoice_discrepancy_cases"
    FOR EACH STATEMENT EXECUTE FUNCTION invoice_discrepancy_cases_guard();
