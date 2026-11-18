-- PI-1.1 (QĐ-111u, QĐ-111v, QĐ-111w, R-44, R-50, R-51): the IT Admin submits the invoice of a purchase and Finance signs the money out.
-- `purchase_invoices` is the submission (it has a state: SUBMITTED, then CONFIRMED or RETURNED) and `purchase_invoice_documents` the files
-- that came with it; when Finance signs, ONE row of `invoices` is written (INV-05). `invoices` therefore learns the month of the service
-- period, the purchase it came from, the subscription and the Cost Center it is booked to when no commitment holds it, and the hook
-- for the cases of `SBF-07a`; its `commitment_id` becomes optional behind a CHECK that keeps one of the four places.
-- Expand only: columns and tables are added, nothing is dropped, no row is rewritten (old invoices keep the year of their commitment, a
-- null `service_month`). The ids of other modules (vendor, employee, Cost Center, subscription, provisioning task, document) are
-- values, not foreign keys, as in `ghost_seat_escalations`. Safe to run twice.

DO $$ BEGIN
    CREATE TYPE "PurchaseInvoiceLinkKind" AS ENUM ('REQUEST', 'SUBSCRIPTION');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    CREATE TYPE "PurchaseInvoiceLabel" AS ENUM ('NEW_PURCHASE', 'PERIOD', 'RENEWAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    CREATE TYPE "PurchaseInvoiceState" AS ENUM ('SUBMITTED', 'CONFIRMED', 'RETURNED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    CREATE TYPE "PurchaseInvoicePaymentSource" AS ENUM ('COMPANY_CARD', 'IT_ADVANCE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "purchase_invoices" (
    "id" uuid NOT NULL,
    "organization_id" uuid NOT NULL,
    "link_kind" "PurchaseInvoiceLinkKind" NOT NULL,
    "request_id" uuid,
    "provisioning_task_id" uuid,
    "subscription_id" uuid,
    "vendor_id" uuid NOT NULL,
    "number" text NOT NULL,
    "issued_on" date NOT NULL,
    -- The first day of the month the invoice pays for: what the expense is booked to, whatever day the invoice is dated.
    "service_month" date NOT NULL,
    "label" "PurchaseInvoiceLabel" NOT NULL,
    "period_index" integer,
    -- Null for a right without an end ("Dùng lâu dài", R-50) and for a renewal.
    "period_count" integer,
    -- What the invoice says, in the currency it says it (R-44): the count of seats or keys and the price of one before conversion.
    "quantity" integer NOT NULL,
    "unit_price_original_minor" bigint NOT NULL,
    "unit_price_original_currency" char(3) NOT NULL,
    -- What was taken out of the company in VND, fees and exchange loss included (R-4).
    "net_minor" bigint NOT NULL,
    "deductible_tax_minor" bigint NOT NULL DEFAULT 0,
    "non_deductible_tax_minor" bigint NOT NULL DEFAULT 0,
    "match_result" "InvoiceMatchResult" NOT NULL,
    "payment_source" "PurchaseInvoicePaymentSource" NOT NULL,
    -- Marks that are laid on, never refused: OVER_APPROVED, OUTSIDE_TERM.
    "flags" text[] NOT NULL DEFAULT '{}',
    -- The Cost Center of the department that held the right in the service month (R-51); null for what is not charged to a department.
    "charged_cost_center_id" uuid,
    "state" "PurchaseInvoiceState" NOT NULL DEFAULT 'SUBMITTED',
    "submitted_by_employee_id" uuid NOT NULL,
    "submitted_at" timestamptz(3) NOT NULL,
    "decided_by_employee_id" uuid,
    "decided_at" timestamptz(3),
    "return_reason" text,
    "resubmission_of_id" uuid,
    "invoice_id" uuid,
    CONSTRAINT "purchase_invoices_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "purchase_invoices_number_check" CHECK (char_length("number") BETWEEN 1 AND 64 AND btrim("number") = "number"),
    CONSTRAINT "purchase_invoices_service_month_check" CHECK (EXTRACT(day FROM "service_month") = 1),
    CONSTRAINT "purchase_invoices_period_check" CHECK (
        ("period_index" IS NULL OR "period_index" >= 1) AND ("period_count" IS NULL OR "period_count" >= 1)
    ),
    CONSTRAINT "purchase_invoices_quantity_check" CHECK ("quantity" >= 1),
    CONSTRAINT "purchase_invoices_original_price_check" CHECK ("unit_price_original_minor" > 0),
    CONSTRAINT "purchase_invoices_amounts_check" CHECK (
        "net_minor" > 0 AND "deductible_tax_minor" >= 0 AND "non_deductible_tax_minor" >= 0
    ),
    CONSTRAINT "purchase_invoices_link_check" CHECK (
        ("link_kind" = 'REQUEST' AND "request_id" IS NOT NULL AND "subscription_id" IS NULL)
        OR ("link_kind" = 'SUBSCRIPTION' AND "subscription_id" IS NOT NULL AND "request_id" IS NULL AND "provisioning_task_id" IS NULL)
    ),
    -- The state and what it needs: a decision has a person and a time; a return has a reason; only a signed one has an invoice.
    CONSTRAINT "purchase_invoices_state_check" CHECK (
        ("state" = 'SUBMITTED' AND "decided_by_employee_id" IS NULL AND "decided_at" IS NULL AND "return_reason" IS NULL AND "invoice_id" IS NULL)
        OR ("state" = 'CONFIRMED' AND "decided_by_employee_id" IS NOT NULL AND "decided_at" IS NOT NULL AND "return_reason" IS NULL AND "invoice_id" IS NOT NULL)
        OR ("state" = 'RETURNED' AND "decided_by_employee_id" IS NOT NULL AND "decided_at" IS NOT NULL AND "invoice_id" IS NULL
            AND "return_reason" IS NOT NULL AND char_length(btrim("return_reason")) BETWEEN 1 AND 1000)
    ),
    -- The person who signs the money out is not the one who submitted the invoice.
    CONSTRAINT "purchase_invoices_person_check" CHECK ("state" <> 'CONFIRMED' OR "decided_by_employee_id" <> "submitted_by_employee_id")
);

ALTER TABLE "purchase_invoices" DROP CONSTRAINT IF EXISTS "purchase_invoices_request_id_fkey";
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_request_id_fkey"
    FOREIGN KEY ("request_id") REFERENCES "access_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_invoices" DROP CONSTRAINT IF EXISTS "purchase_invoices_resubmission_of_id_fkey";
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_resubmission_of_id_fkey"
    FOREIGN KEY ("resubmission_of_id") REFERENCES "purchase_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A vendor's number is taken until the invoice carrying it is returned: a returned one may come back with the same number.
CREATE UNIQUE INDEX IF NOT EXISTS "purchase_invoices_number_open_key"
    ON "purchase_invoices" ("organization_id", "vendor_id", "number") WHERE "state" <> 'RETURNED';
-- One returned invoice is resubmitted once.
CREATE UNIQUE INDEX IF NOT EXISTS "purchase_invoices_resubmission_key"
    ON "purchase_invoices" ("resubmission_of_id") WHERE "resubmission_of_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "purchase_invoices_request_service_month_idx" ON "purchase_invoices" ("request_id", "service_month");
CREATE INDEX IF NOT EXISTS "purchase_invoices_subscription_service_month_idx" ON "purchase_invoices" ("subscription_id", "service_month");
CREATE INDEX IF NOT EXISTS "purchase_invoices_state_submitted_idx" ON "purchase_invoices" ("organization_id", "state", "submitted_at", "id");

-- A submitted invoice moves once, to signed or to returned; after that, and from the start for what was said on it, nothing changes.
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
      NEW."submitted_by_employee_id", NEW."submitted_at", NEW."resubmission_of_id")
     IS DISTINCT FROM
     (OLD."id", OLD."organization_id", OLD."link_kind", OLD."request_id", OLD."provisioning_task_id", OLD."subscription_id", OLD."vendor_id",
      OLD."number", OLD."issued_on", OLD."service_month", OLD."label", OLD."period_index", OLD."period_count", OLD."quantity",
      OLD."unit_price_original_minor", OLD."unit_price_original_currency", OLD."net_minor", OLD."deductible_tax_minor",
      OLD."non_deductible_tax_minor", OLD."match_result", OLD."payment_source", OLD."flags", OLD."charged_cost_center_id",
      OLD."submitted_by_employee_id", OLD."submitted_at", OLD."resubmission_of_id") THEN
    RAISE EXCEPTION 'what a purchase invoice says never changes' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS purchase_invoices_guard ON "purchase_invoices";
CREATE TRIGGER purchase_invoices_guard BEFORE UPDATE OR DELETE ON "purchase_invoices"
    FOR EACH ROW EXECUTE FUNCTION purchase_invoices_guard();
DROP TRIGGER IF EXISTS purchase_invoices_no_truncate ON "purchase_invoices";
CREATE TRIGGER purchase_invoices_no_truncate BEFORE TRUNCATE ON "purchase_invoices"
    FOR EACH STATEMENT EXECUTE FUNCTION purchase_invoices_guard();

CREATE TABLE IF NOT EXISTS "purchase_invoice_documents" (
    "purchase_invoice_id" uuid NOT NULL,
    "document_id" uuid NOT NULL,
    "position" smallint NOT NULL,
    CONSTRAINT "purchase_invoice_documents_pkey" PRIMARY KEY ("purchase_invoice_id", "document_id"),
    CONSTRAINT "purchase_invoice_documents_position_check" CHECK ("position" BETWEEN 1 AND 20)
);
-- A file belongs to one invoice.
CREATE UNIQUE INDEX IF NOT EXISTS "purchase_invoice_documents_document_id_key" ON "purchase_invoice_documents" ("document_id");
ALTER TABLE "purchase_invoice_documents" DROP CONSTRAINT IF EXISTS "purchase_invoice_documents_purchase_invoice_id_fkey";
ALTER TABLE "purchase_invoice_documents" ADD CONSTRAINT "purchase_invoice_documents_purchase_invoice_id_fkey"
    FOREIGN KEY ("purchase_invoice_id") REFERENCES "purchase_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION purchase_invoice_documents_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'purchase_invoice_documents is append-only (% rejected)', TG_OP USING ERRCODE = 'restrict_violation';
END;
$$;
DROP TRIGGER IF EXISTS purchase_invoice_documents_no_update_delete ON "purchase_invoice_documents";
CREATE TRIGGER purchase_invoice_documents_no_update_delete BEFORE UPDATE OR DELETE ON "purchase_invoice_documents"
    FOR EACH ROW EXECUTE FUNCTION purchase_invoice_documents_append_only();
DROP TRIGGER IF EXISTS purchase_invoice_documents_no_truncate ON "purchase_invoice_documents";
CREATE TRIGGER purchase_invoice_documents_no_truncate BEFORE TRUNCATE ON "purchase_invoice_documents"
    FOR EACH STATEMENT EXECUTE FUNCTION purchase_invoice_documents_append_only();

-- catalog: a purchase document is owned by the purchase invoice it came with, as a signed record is owned by the person who signed it.
ALTER TABLE "document_attachments" ADD COLUMN IF NOT EXISTS "purchase_invoice_id" uuid;
ALTER TABLE "document_attachments" DROP CONSTRAINT IF EXISTS "document_attachments_owner_state",
  DROP CONSTRAINT IF EXISTS "document_attachments_purpose_fits_owner";
ALTER TABLE "document_attachments" ADD CONSTRAINT "document_attachments_owner_state" CHECK (
    ("status" = 'READY') = ("contract_id" IS NOT NULL OR "signer_employee_id" IS NOT NULL OR "purchase_invoice_id" IS NOT NULL)
    AND ("status" = 'READY') = ("attached_at" IS NOT NULL)
    AND num_nonnulls("contract_id", "signer_employee_id", "purchase_invoice_id") <= 1),
  ADD CONSTRAINT "document_attachments_purpose_fits_owner" CHECK (
    ("contract_id" IS NULL OR "purpose" IN ('CONTRACT_ATTACHMENT', 'PURCHASE_DOCUMENT'))
    AND ("signer_employee_id" IS NULL OR "purpose" = 'SIGNATURE_RECORD')
    AND ("purchase_invoice_id" IS NULL OR "purpose" = 'PURCHASE_DOCUMENT'));
CREATE INDEX IF NOT EXISTS "document_attachments_purchase_invoice_id_idx" ON "document_attachments" ("purchase_invoice_id");

-- budgets: the invoice learns what it pays for and where it is booked. `service_month` is null for the invoices of before (their year is the
-- year of their commitment); an invoice with no commitment is booked to a subscription, to a Cost Center, or to a case of SBF-07a.
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "service_month" date,
  ADD COLUMN IF NOT EXISTS "purchase_invoice_id" uuid,
  ADD COLUMN IF NOT EXISTS "subscription_id" uuid,
  ADD COLUMN IF NOT EXISTS "cost_center_id" uuid,
  ADD COLUMN IF NOT EXISTS "out_of_process_case_id" uuid;
ALTER TABLE "invoices" ALTER COLUMN "commitment_id" DROP NOT NULL;
ALTER TABLE "invoices" DROP CONSTRAINT IF EXISTS "invoices_service_month_check";
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_service_month_check"
    CHECK ("service_month" IS NULL OR EXTRACT(day FROM "service_month") = 1);
ALTER TABLE "invoices" DROP CONSTRAINT IF EXISTS "invoices_place_check";
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_place_check"
    CHECK ("commitment_id" IS NOT NULL OR "subscription_id" IS NOT NULL OR "cost_center_id" IS NOT NULL OR "out_of_process_case_id" IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS "invoices_purchase_invoice_id_key" ON "invoices" ("purchase_invoice_id");
CREATE INDEX IF NOT EXISTS "invoices_cost_center_id_service_month_idx" ON "invoices" ("cost_center_id", "service_month");
CREATE INDEX IF NOT EXISTS "invoices_subscription_id_service_month_idx" ON "invoices" ("subscription_id", "service_month");
