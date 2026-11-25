-- W3-17, W3-26 (P12b M7): the personal right of a K1 plan has its own term and billing anchor and no subscription; a K1 subscription of before is closed;
-- an invoice that is split by month and bucket has allocation lines (append-only, with the lines that correct them), and the year an invoice was applied to a
-- Cost Center is kept as rows that are added.
-- Reversal (before any line is written): drop the two tables and the triggers, drop the four new columns, restore `license_assignment_reject_change` from migration
-- 20261113002200.

-- 1. The personal right of a K1 plan: the months it commits to (1 or 12) and the day the billing months count from.
ALTER TABLE "license_assignments"
    ADD COLUMN "personal_commitment_months" SMALLINT,
    ADD COLUMN "billing_anchor_on" DATE;

ALTER TABLE "license_assignments"
    ADD CONSTRAINT "license_assignments_personal_commitment_months_check" CHECK ("personal_commitment_months" IS NULL OR "personal_commitment_months" IN (1, 12));

-- The right of K1 written from now on has no subscription and names both; the rights of before keep their subscription and get the monthly term below.
CREATE FUNCTION "license_assignments_k1_terms"() RETURNS trigger AS $$
DECLARE
    plan_type "ProvisioningType";
BEGIN
    IF NEW."subscription_id" IS NULL THEN
        SELECT p."provisioning_type" INTO plan_type FROM "plans" p WHERE p."id" = NEW."plan_id";
        IF plan_type = 'K1' AND (NEW."personal_commitment_months" IS NULL OR NEW."billing_anchor_on" IS NULL) THEN
            RAISE EXCEPTION 'A personal right of a K1 plan names its months and the day its billing counts from'
                USING ERRCODE = '23514', CONSTRAINT = 'license_assignments_k1_terms';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "license_assignments_k1_terms" BEFORE INSERT ON "license_assignments"
    FOR EACH ROW EXECUTE FUNCTION "license_assignments_k1_terms"();

-- What a right says of its term never changes: the function of migration 20261113002200 with the two columns added to what is compared.
CREATE OR REPLACE FUNCTION "license_assignment_reject_change"() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'A license assignment is never deleted'
            USING ERRCODE = '55000', CONSTRAINT = 'license_assignments_immutable';
    END IF;

    IF (NEW."id", NEW."organization_id", NEW."kind", NEW."source", NEW."plan_id", NEW."subscription_id",
        NEW."employee_id", NEW."account_identifier", NEW."normalized_account_identifier", NEW."reason",
        NEW."cost_center_id", NEW."owning_department_id", NEW."valid_from", NEW."valid_from_basis", NEW."predecessor_id",
        NEW."replaces_assignment_id", NEW."baseline_import_id", NEW."created_by_app_user_id", NEW."created_at",
        NEW."personal_commitment_months", NEW."billing_anchor_on")
       IS DISTINCT FROM
       (OLD."id", OLD."organization_id", OLD."kind", OLD."source", OLD."plan_id", OLD."subscription_id",
        OLD."employee_id", OLD."account_identifier", OLD."normalized_account_identifier", OLD."reason",
        OLD."cost_center_id", OLD."owning_department_id", OLD."valid_from", OLD."valid_from_basis", OLD."predecessor_id",
        OLD."replaces_assignment_id", OLD."baseline_import_id", OLD."created_by_app_user_id", OLD."created_at",
        OLD."personal_commitment_months", OLD."billing_anchor_on") THEN
        RAISE EXCEPTION 'Only when a license assignment ends and when it is expected to end may change'
            USING ERRCODE = '55000', CONSTRAINT = 'license_assignments_immutable';
    END IF;

    IF OLD."failed_at" IS NOT NULL
       AND (NEW."failed_at", NEW."cancelled_at", NEW."valid_until", NEW."expected_end_date")
           IS DISTINCT FROM (OLD."failed_at", OLD."cancelled_at", OLD."valid_until", OLD."expected_end_date") THEN
        RAISE EXCEPTION 'A license assignment that failed never changes again'
            USING ERRCODE = '55000', CONSTRAINT = 'license_assignments_failed_is_final';
    END IF;

    IF OLD."cancelled_at" IS NOT NULL
       AND (NEW."failed_at", NEW."cancelled_at", NEW."valid_until", NEW."expected_end_date")
           IS DISTINCT FROM (OLD."failed_at", OLD."cancelled_at", OLD."valid_until", OLD."expected_end_date") THEN
        RAISE EXCEPTION 'A license assignment that was cancelled never changes again'
            USING ERRCODE = '55000', CONSTRAINT = 'license_assignments_cancelled_is_final';
    END IF;

    IF OLD."failed_at" IS NULL AND NEW."failed_at" IS NOT NULL AND OLD."valid_until" IS NOT NULL THEN
        RAISE EXCEPTION 'Only an assignment that is still open can fail'
            USING ERRCODE = '55000', CONSTRAINT = 'license_assignments_failed_needs_open';
    END IF;

    IF OLD."cancelled_at" IS NULL AND NEW."cancelled_at" IS NOT NULL AND OLD."valid_until" IS NOT NULL THEN
        RAISE EXCEPTION 'Only an assignment that is still open can be cancelled'
            USING ERRCODE = '55000', CONSTRAINT = 'license_assignments_cancelled_needs_open';
    END IF;

    IF OLD."granted_on" IS NOT NULL AND NEW."granted_on" IS DISTINCT FROM OLD."granted_on" THEN
        RAISE EXCEPTION 'The day the task of the grant was completed is written once'
            USING ERRCODE = '55000', CONSTRAINT = 'license_assignments_granted_on_is_final';
    END IF;

    IF OLD."expected_end_date" IS NOT NULL AND NEW."expected_end_date" IS DISTINCT FROM OLD."expected_end_date"
       AND NOT (OLD."granted_on" IS NULL AND NEW."granted_on" IS NOT NULL AND NEW."expected_end_date" < OLD."expected_end_date") THEN
        RAISE EXCEPTION 'The day a license assignment is expected to end is not edited: a renewal is a new record'
            USING ERRCODE = '55000', CONSTRAINT = 'license_assignments_expected_end_is_final';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- The rights of K1 that exist: one month, counted from the day the grant was completed (the one write to a right that is not an end; the guard is off for it
-- and on again, and the two new columns are all it writes).
ALTER TABLE "license_assignments" DISABLE TRIGGER "license_assignments_immutable";
UPDATE "license_assignments" a
   SET "personal_commitment_months" = 1, "billing_anchor_on" = a."granted_on"
  FROM "plans" p
 WHERE p."id" = a."plan_id" AND p."provisioning_type" = 'K1';
ALTER TABLE "license_assignments" ENABLE TRIGGER "license_assignments_immutable";

-- 2. A K1 plan has no subscription: the ones that exist are closed and stay as history; the rights on them keep their subscription.
ALTER TABLE "subscriptions"
    ADD COLUMN "closed_at" TIMESTAMPTZ(3),
    ADD COLUMN "closed_reason" TEXT;

ALTER TABLE "subscriptions"
    ADD CONSTRAINT "subscriptions_closed_reason_check" CHECK ("closed_reason" IS NULL OR "closed_reason" IN ('K1_WITHOUT_SUBSCRIPTION')),
    ADD CONSTRAINT "subscriptions_closed_pair_check" CHECK (("closed_at" IS NULL) = ("closed_reason" IS NULL));

UPDATE "subscriptions" s
   SET "closed_at" = now(), "closed_reason" = 'K1_WITHOUT_SUBSCRIPTION'
  FROM "plans" p
 WHERE p."id" = s."plan_id" AND p."provisioning_type" = 'K1';

-- 3. The allocation of an invoice by month and bucket. A line is added and never changed; what corrects it is another line that says which it adjusts.
CREATE TABLE "invoice_allocations" (
    "id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "month" DATE NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "tax_part_minor" BIGINT NOT NULL DEFAULT 0,
    "bucket" TEXT NOT NULL,
    "cost_center_id" UUID,
    "commitment_id" UUID,
    "kind" TEXT NOT NULL DEFAULT 'ORIGINAL',
    "adjusts_allocation_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_allocations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "invoice_allocations_month_check" CHECK (EXTRACT(day FROM "month") = 1),
    CONSTRAINT "invoice_allocations_tax_part_check" CHECK ("tax_part_minor" >= 0),
    CONSTRAINT "invoice_allocations_bucket_check" CHECK (
        "bucket" IN ('COST_CENTER', 'POOL_IDLE', 'POOL_DEVICE_LOT', 'POOL_REPLACEMENT', 'POOL_LOT_DIFFERENCE')
    ),
    CONSTRAINT "invoice_allocations_cost_center_check" CHECK (("bucket" = 'COST_CENTER') = ("cost_center_id" IS NOT NULL)),
    CONSTRAINT "invoice_allocations_kind_check" CHECK (
        "kind" IN ('ORIGINAL', 'TRANSFER_OUT', 'TRANSFER_IN', 'WITHDRAWAL', 'LOT_DIFFERENCE')
    ),
    -- An amount is negative only in the lines that take something away or measure a difference.
    CONSTRAINT "invoice_allocations_amount_check" CHECK (
        "amount_minor" >= 0 OR "kind" IN ('TRANSFER_OUT', 'WITHDRAWAL', 'LOT_DIFFERENCE')
    ),
    CONSTRAINT "invoice_allocations_adjusts_check" CHECK ("adjusts_allocation_id" IS NULL OR "kind" <> 'ORIGINAL')
);

CREATE TABLE "invoice_year_applications" (
    "id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "cost_center_id" UUID NOT NULL,
    "commitment_id" UUID,
    "source" TEXT NOT NULL,
    "applied_minor" BIGINT NOT NULL,
    "tax_variance_minor" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_year_applications_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "invoice_year_applications_source_check" CHECK ("source" IN ('CONFIRMATION', 'YEAR_START', 'TRANSFER', 'WITHDRAWAL'))
);

CREATE INDEX "invoice_allocations_invoice_id_month_idx" ON "invoice_allocations"("invoice_id", "month");
CREATE INDEX "invoice_allocations_cost_center_id_month_idx" ON "invoice_allocations"("cost_center_id", "month");
-- One line of a kind for an invoice, a month, a bucket and a Cost Center (a pool bucket has none, which counts as one value).
CREATE UNIQUE INDEX "invoice_allocations_line_key" ON "invoice_allocations"
    ("invoice_id", "month", "bucket", COALESCE("cost_center_id", '00000000-0000-0000-0000-000000000000'::uuid), "kind");
CREATE INDEX "invoice_year_applications_invoice_id_year_cost_center_id_idx" ON "invoice_year_applications"("invoice_id", "year", "cost_center_id");
CREATE INDEX "invoice_year_applications_cost_center_id_year_idx" ON "invoice_year_applications"("cost_center_id", "year");

ALTER TABLE "invoice_allocations" ADD CONSTRAINT "invoice_allocations_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invoice_allocations" ADD CONSTRAINT "invoice_allocations_cost_center_id_fkey" FOREIGN KEY ("cost_center_id") REFERENCES "cost_centers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invoice_allocations" ADD CONSTRAINT "invoice_allocations_commitment_id_fkey" FOREIGN KEY ("commitment_id") REFERENCES "budget_commitments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invoice_allocations" ADD CONSTRAINT "invoice_allocations_adjusts_allocation_id_fkey" FOREIGN KEY ("adjusts_allocation_id") REFERENCES "invoice_allocations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "invoice_year_applications" ADD CONSTRAINT "invoice_year_applications_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invoice_year_applications" ADD CONSTRAINT "invoice_year_applications_cost_center_id_fkey" FOREIGN KEY ("cost_center_id") REFERENCES "cost_centers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invoice_year_applications" ADD CONSTRAINT "invoice_year_applications_commitment_id_fkey" FOREIGN KEY ("commitment_id") REFERENCES "budget_commitments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "invoice_allocation_rows_immutable"() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'a line of the allocation of an invoice is only added to: what corrects it is another line'
        USING ERRCODE = 'restrict_violation', CONSTRAINT = 'invoice_allocations_immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "invoice_allocations_immutable" BEFORE UPDATE OR DELETE ON "invoice_allocations"
    FOR EACH ROW EXECUTE FUNCTION "invoice_allocation_rows_immutable"();
CREATE TRIGGER "invoice_year_applications_immutable" BEFORE UPDATE OR DELETE ON "invoice_year_applications"
    FOR EACH ROW EXECUTE FUNCTION "invoice_allocation_rows_immutable"();
