-- RC-1.1 (R-44): a purchase invoice keeps what it was read against, so that the case of an invoice that differs shows both sides and does not
-- depend on what the plan or the subscription says later. `expected_quantity` is the seats of the request or the count bought by the
-- subscription; the expected price of one is in the original currency of the plan or subscription. A side nobody knew is null and was not judged
-- (PI-1.3). Rows written before this migration keep null: they were judged and their match result stands.
-- Expand only: three nullable columns, one CHECK, and the guard that stops a change of what an invoice says now watches them too. Safe to run twice.

ALTER TABLE "purchase_invoices"
    ADD COLUMN IF NOT EXISTS "expected_quantity" integer,
    ADD COLUMN IF NOT EXISTS "expected_unit_price_original_minor" bigint,
    ADD COLUMN IF NOT EXISTS "expected_unit_price_original_currency" char(3);

ALTER TABLE "purchase_invoices" DROP CONSTRAINT IF EXISTS "purchase_invoices_expected_check";
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_expected_check" CHECK (
    ("expected_quantity" IS NULL OR "expected_quantity" >= 0)
    AND ("expected_unit_price_original_minor" IS NULL) = ("expected_unit_price_original_currency" IS NULL)
    AND ("expected_unit_price_original_minor" IS NULL OR "expected_unit_price_original_minor" >= 0)
);

-- The guard of PI-1.1 with the three columns added to what never changes.
CREATE OR REPLACE FUNCTION purchase_invoices_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('DELETE', 'TRUNCATE') THEN
    RAISE EXCEPTION 'purchase_invoices is never deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD."state" <> 'SUBMITTED' THEN
    RAISE EXCEPTION 'a signed or returned purchase invoice is never changed' USING ERRCODE = 'restrict_violation';
  END IF;
  IF (NEW."id", NEW."organization_id", NEW."link_kind", NEW."request_id", NEW."provisioning_task_id", NEW."subscription_id", NEW."vendor_id",
      NEW."number", NEW."issued_on", NEW."service_month", NEW."label", NEW."period_index", NEW."period_count", NEW."quantity",
      NEW."unit_price_original_minor", NEW."unit_price_original_currency", NEW."net_minor", NEW."deductible_tax_minor",
      NEW."non_deductible_tax_minor", NEW."match_result", NEW."payment_source", NEW."flags", NEW."charged_cost_center_id",
      NEW."submitted_by_employee_id", NEW."submitted_at", NEW."resubmission_of_id",
      NEW."expected_quantity", NEW."expected_unit_price_original_minor", NEW."expected_unit_price_original_currency")
     IS DISTINCT FROM
     (OLD."id", OLD."organization_id", OLD."link_kind", OLD."request_id", OLD."provisioning_task_id", OLD."subscription_id", OLD."vendor_id",
      OLD."number", OLD."issued_on", OLD."service_month", OLD."label", OLD."period_index", OLD."period_count", OLD."quantity",
      OLD."unit_price_original_minor", OLD."unit_price_original_currency", OLD."net_minor", OLD."deductible_tax_minor",
      OLD."non_deductible_tax_minor", OLD."match_result", OLD."payment_source", OLD."flags", OLD."charged_cost_center_id",
      OLD."submitted_by_employee_id", OLD."submitted_at", OLD."resubmission_of_id",
      OLD."expected_quantity", OLD."expected_unit_price_original_minor", OLD."expected_unit_price_original_currency") THEN
    RAISE EXCEPTION 'what a purchase invoice says never changes' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;
