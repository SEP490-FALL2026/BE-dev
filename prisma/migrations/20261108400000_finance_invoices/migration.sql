-- Finance records the invoice of a commitment, and the commitment becomes an expense by it (US-06-06 AC-1, AC-5; US-12-02).
-- Only added to: every statement runs on a database that already has commitments.

-- CreateEnum
CREATE TYPE "InvoiceMatchResult" AS ENUM ('MATCHED', 'TAX_ONLY', 'PRICE_QUANTITY_EXCEPTION');

-- AlterTable: what of the commitment became an expense, at the price before tax.
ALTER TABLE "budget_commitments" ADD COLUMN "applied_minor" BIGINT NOT NULL DEFAULT 0;

-- A commitment holds its amount less what went back and what became an expense. It is held while something is left, and never
-- released once something became an expense.
ALTER TABLE "budget_commitments"
    ADD CONSTRAINT "budget_commitments_applied_check" CHECK (
        "applied_minor" >= 0
        AND "released_minor" + "applied_minor" <= "amount_minor"
        AND ("state" <> 'RELEASED' OR "applied_minor" = 0)
        AND ("state" <> 'HELD' OR "released_minor" + "applied_minor" < "amount_minor")
    );

-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "commitment_id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "issued_on" DATE NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "net_minor" BIGINT NOT NULL,
    "deductible_tax_minor" BIGINT NOT NULL DEFAULT 0,
    "non_deductible_tax_minor" BIGINT NOT NULL DEFAULT 0,
    "actual_cost_minor" BIGINT NOT NULL,
    "applied_minor" BIGINT NOT NULL,
    "match_result" "InvoiceMatchResult" NOT NULL,
    "note" TEXT,
    "recorded_by_employee_id" UUID NOT NULL,
    "recorded_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "invoices_number_check" CHECK (char_length("number") BETWEEN 1 AND 64 AND btrim("number") = "number"),
    CONSTRAINT "invoices_note_check" CHECK ("note" IS NULL OR char_length("note") <= 1000),
    CONSTRAINT "invoices_amounts_check" CHECK (
        "net_minor" >= 0
        AND "deductible_tax_minor" >= 0
        AND "non_deductible_tax_minor" >= 0
        AND "applied_minor" >= 0
        AND "applied_minor" <= "net_minor"
    ),
    -- What the invoice cost the company: the price before tax and the tax that cannot be deducted. The tax that can is shown apart.
    CONSTRAINT "invoices_actual_cost_check" CHECK ("actual_cost_minor" = "net_minor" + "non_deductible_tax_minor")
);

-- CreateIndex
CREATE UNIQUE INDEX "invoices_organization_id_vendor_id_number_key" ON "invoices"("organization_id", "vendor_id", "number");

-- CreateIndex
CREATE INDEX "invoices_commitment_id_recorded_at_idx" ON "invoices"("commitment_id", "recorded_at");

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_commitment_id_fkey" FOREIGN KEY ("commitment_id") REFERENCES "budget_commitments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_currency_fkey" FOREIGN KEY ("currency") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_recorded_by_employee_id_fkey" FOREIGN KEY ("recorded_by_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- INV-05: what was recorded is kept as it was written.
CREATE FUNCTION invoices_reject_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'invoices is append-only (% rejected)', TG_OP USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER invoices_no_update_delete
  BEFORE UPDATE OR DELETE ON invoices
  FOR EACH ROW EXECUTE FUNCTION invoices_reject_change();

CREATE TRIGGER invoices_no_truncate
  BEFORE TRUNCATE ON invoices
  FOR EACH STATEMENT EXECUTE FUNCTION invoices_reject_change();

-- What became an expense does not come back to the commitment, as what went back to the budget does not (US-06-06 AC-4).
CREATE OR REPLACE FUNCTION budget_commitments_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.request_id <> OLD.request_id OR NEW.cost_center_id <> OLD.cost_center_id OR NEW.year <> OLD.year
     OR NEW.currency <> OLD.currency OR NEW.amount_minor <> OLD.amount_minor THEN
    RAISE EXCEPTION 'budget_commitments keeps the request, the Cost Center, the year and the amount it was made for (UPDATE rejected)'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.state <> 'HELD' THEN
    RAISE EXCEPTION 'a commitment that is % does not change again (UPDATE rejected)', OLD.state
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.released_minor < OLD.released_minor THEN
    RAISE EXCEPTION 'what went back to the budget does not come back (UPDATE rejected)'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.applied_minor < OLD.applied_minor THEN
    RAISE EXCEPTION 'what became an expense does not come back to the commitment (UPDATE rejected)'
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN NEW;
END;
$$;
