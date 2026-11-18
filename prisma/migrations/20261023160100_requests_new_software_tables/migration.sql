-- The proposal of software that is not in the catalog, and the assessment the IT Admin completes for it (US-05-06,
-- US-01-12 AC-2, US-05-02 AC-8). A request of this branch has no plan until the software is registered, so `plan_id` may be
-- empty for it and for it only. Nothing here puts the software into the catalog.

-- CreateEnum
CREATE TYPE "AssessmentClassification" AS ENUM ('INTERNAL', 'PAID_LICENSED');

-- CreateEnum
CREATE TYPE "AssessmentStatus" AS ENUM ('DRAFT', 'COMPLETED');

-- CreateEnum
CREATE TYPE "PaymentFrequency" AS ENUM ('MONTHLY', 'QUARTERLY', 'ANNUAL', 'UPFRONT_ONCE');

-- CreateEnum
CREATE TYPE "OpinionStatus" AS ENUM ('OBTAINED', 'NOT_AVAILABLE');

-- AlterTable
ALTER TABLE "access_requests" ALTER COLUMN "plan_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "access_request_proposals" (
    "request_id" UUID NOT NULL,
    "software_name" TEXT NOT NULL,
    "homepage_url" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "data_description" TEXT NOT NULL,
    "expected_users" INTEGER NOT NULL,

    CONSTRAINT "access_request_proposals_pkey" PRIMARY KEY ("request_id")
);

-- CreateTable
CREATE TABLE "access_request_assessments" (
    "request_id" UUID NOT NULL,
    "status" "AssessmentStatus" NOT NULL DEFAULT 'DRAFT',
    "classification" "AssessmentClassification",
    "vendor_id" UUID,
    "vendor_name" TEXT,
    "planned_plan_name" TEXT,
    "provisioning_type" "ProvisioningType",
    "admin_console" BOOLEAN,
    "member_export" BOOLEAN,
    "sso" BOOLEAN,
    "terms_summary" TEXT,
    "member_usage_method" TEXT,
    "grant_revoke_method" TEXT,
    "data_sensitivity" "DataSensitivity",
    "opinion_status" "OpinionStatus",
    "opinion_note" TEXT,
    "equivalent_plan_id" UUID,
    "proposed_business_owner_employee_id" UUID,
    "control_level" "ControlLevel",
    "control_risk_note" TEXT,
    "quote_unit_price_minor" BIGINT,
    "quote_currency" CHAR(3),
    "quote_billing_cycle" "BillingCycle",
    "quote_valid_from" DATE,
    "quote_valid_until" DATE,
    "commitment_months" INTEGER,
    "payment_frequency" "PaymentFrequency",
    "first_payment_on" DATE,
    "saved_by_employee_id" UUID,
    "completed_by_employee_id" UUID,
    "completed_at" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "access_request_assessments_pkey" PRIMARY KEY ("request_id")
);

-- AddForeignKey
ALTER TABLE "access_request_proposals" ADD CONSTRAINT "access_request_proposals_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "access_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_request_assessments" ADD CONSTRAINT "access_request_assessments_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "access_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_request_assessments" ADD CONSTRAINT "access_request_assessments_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_request_assessments" ADD CONSTRAINT "access_request_assessments_equivalent_plan_id_fkey" FOREIGN KEY ("equivalent_plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_request_assessments" ADD CONSTRAINT "access_request_assessments_proposed_business_owner_employe_fkey" FOREIGN KEY ("proposed_business_owner_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_request_assessments" ADD CONSTRAINT "access_request_assessments_saved_by_employee_id_fkey" FOREIGN KEY ("saved_by_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_request_assessments" ADD CONSTRAINT "access_request_assessments_completed_by_employee_id_fkey" FOREIGN KEY ("completed_by_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_request_assessments" ADD CONSTRAINT "access_request_assessments_quote_currency_fkey" FOREIGN KEY ("quote_currency") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Constraints Prisma cannot express (ADR-0005).
ALTER TABLE "access_requests"
    ADD CONSTRAINT "access_requests_plan_check" CHECK ("branch" = 'NEW_SOFTWARE' OR "plan_id" IS NOT NULL);

ALTER TABLE "access_request_proposals"
    ADD CONSTRAINT "access_request_proposals_text_check" CHECK (
        btrim("software_name") <> '' AND btrim("purpose") <> '' AND btrim("data_description") <> ''),
    ADD CONSTRAINT "access_request_proposals_homepage_check" CHECK ("homepage_url" ~ '^https?://[^[:space:]]+$'),
    ADD CONSTRAINT "access_request_proposals_users_check" CHECK ("expected_users" BETWEEN 1 AND 1000000);

-- The assessment: a text that is set says something, the quote is all there or not there at all, and a completed
-- assessment says who completed it, when, and what it concluded.
ALTER TABLE "access_request_assessments"
    ADD CONSTRAINT "access_request_assessments_text_check" CHECK (
        ("vendor_name" IS NULL OR btrim("vendor_name") <> '')
        AND ("planned_plan_name" IS NULL OR btrim("planned_plan_name") <> '')
        AND ("terms_summary" IS NULL OR btrim("terms_summary") <> '')
        AND ("member_usage_method" IS NULL OR btrim("member_usage_method") <> '')
        AND ("grant_revoke_method" IS NULL OR btrim("grant_revoke_method") <> '')
        AND ("opinion_note" IS NULL OR btrim("opinion_note") <> '')
        AND ("control_risk_note" IS NULL OR btrim("control_risk_note") <> '')),
    ADD CONSTRAINT "access_request_assessments_opinion_check" CHECK ("opinion_note" IS NULL OR "opinion_status" IS NOT NULL),
    ADD CONSTRAINT "access_request_assessments_quote_check" CHECK (
        ("quote_unit_price_minor" IS NULL) = ("quote_currency" IS NULL)
        AND ("quote_unit_price_minor" IS NULL) = ("quote_billing_cycle" IS NULL)
        AND ("quote_unit_price_minor" IS NULL) = ("quote_valid_from" IS NULL)
        AND ("quote_unit_price_minor" IS NULL OR "quote_unit_price_minor" >= 0)
        AND ("quote_billing_cycle" IS NULL OR "quote_billing_cycle" <> 'OTHER')
        AND ("quote_valid_until" IS NULL OR ("quote_valid_from" IS NOT NULL AND "quote_valid_until" >= "quote_valid_from"))),
    ADD CONSTRAINT "access_request_assessments_commitment_check" CHECK ("commitment_months" IS NULL OR "commitment_months" >= 1),
    ADD CONSTRAINT "access_request_assessments_completed_check" CHECK (
        ("status" = 'DRAFT' AND "completed_at" IS NULL AND "completed_by_employee_id" IS NULL)
        OR ("status" = 'COMPLETED' AND "completed_at" IS NOT NULL AND "completed_by_employee_id" IS NOT NULL
            AND "classification" IS NOT NULL));
