-- The budgets context (C5, ADR-0016): the proposal a head of department sends for a Cost Center and a fiscal year, and the
-- versions of the budget Finance builds from it and the spending approver decides (US-06-09, US-06-10, US-06-11). A
-- Cost Center and year has at most one current version (INV-21) and one version in flight; a proposal is never edited
-- once sent. Money is in whole minor units of one currency (ADR-0007).

-- CreateEnum
CREATE TYPE "BudgetProposalState" AS ENUM ('SUBMITTED', 'WITHDRAWN', 'RETURNED', 'REVIEWED');

-- CreateEnum
CREATE TYPE "BudgetRepeatCycle" AS ENUM ('MONTHLY', 'QUARTERLY', 'ANNUAL', 'ONE_TIME');

-- CreateEnum
CREATE TYPE "BudgetVersionKind" AS ENUM ('INITIAL', 'REVISION');

-- CreateEnum
CREATE TYPE "BudgetVersionState" AS ENUM ('DRAFT', 'SENT', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED', 'SUPERSEDED');

-- CreateTable
CREATE TABLE "budget_proposals" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "cost_center_id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "state" "BudgetProposalState" NOT NULL,
    "previous_proposal_id" UUID,
    "total_minor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "submitted_by_employee_id" UUID NOT NULL,
    "submitted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "returned_reason" TEXT,
    "returned_by_employee_id" UUID,
    "returned_at" TIMESTAMPTZ(3),
    "withdrawn_at" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "budget_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_proposal_lines" (
    "proposal_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "plan_id" UUID,
    "seats" INTEGER,
    "amount_minor" BIGINT NOT NULL,
    "window_from" DATE NOT NULL,
    "window_to" DATE NOT NULL,
    "service_period_months" INTEGER NOT NULL,
    "repeat_cycle" "BudgetRepeatCycle" NOT NULL,
    "quote_valid_until" DATE,
    "note" TEXT,

    CONSTRAINT "budget_proposal_lines_pkey" PRIMARY KEY ("proposal_id","position")
);

-- CreateTable
CREATE TABLE "budget_versions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "cost_center_id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "number" INTEGER NOT NULL,
    "kind" "BudgetVersionKind" NOT NULL,
    "state" "BudgetVersionState" NOT NULL,
    "proposal_id" UUID,
    "based_on_version_id" UUID,
    "base_minor" BIGINT NOT NULL,
    "reserve_minor" BIGINT NOT NULL,
    "total_minor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "high_value_percent" INTEGER NOT NULL,
    "q1_minor" BIGINT,
    "q2_minor" BIGINT,
    "q3_minor" BIGINT,
    "q4_minor" BIGINT,
    "reason" TEXT,
    "created_by_employee_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_by_employee_id" UUID,
    "sent_at" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "budget_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_version_lines" (
    "version_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "proposal_id" UUID,
    "proposal_position" INTEGER,
    "description" TEXT NOT NULL,
    "plan_id" UUID,
    "seats" INTEGER,
    "amount_minor" BIGINT NOT NULL,
    "window_from" DATE NOT NULL,
    "window_to" DATE NOT NULL,
    "service_period_months" INTEGER NOT NULL,
    "repeat_cycle" "BudgetRepeatCycle" NOT NULL,
    "quote_valid_until" DATE,
    "finance_comment" TEXT,
    "adjustment_reason" TEXT,

    CONSTRAINT "budget_version_lines_pkey" PRIMARY KEY ("version_id","position")
);

-- CreateTable
CREATE TABLE "budget_version_line_changes" (
    "id" UUID NOT NULL,
    "version_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "window_from_before" DATE NOT NULL,
    "window_to_before" DATE NOT NULL,
    "window_from_after" DATE NOT NULL,
    "window_to_after" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "changed_by_employee_id" UUID NOT NULL,
    "changed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "budget_version_line_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "budget_proposals_cost_center_id_year_state_idx" ON "budget_proposals"("cost_center_id", "year", "state");

-- CreateIndex
CREATE INDEX "budget_proposals_state_submitted_at_idx" ON "budget_proposals"("state", "submitted_at");

-- CreateIndex
CREATE INDEX "budget_versions_cost_center_id_year_state_idx" ON "budget_versions"("cost_center_id", "year", "state");

-- CreateIndex
CREATE INDEX "budget_versions_state_created_at_idx" ON "budget_versions"("state", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "budget_versions_cost_center_id_year_number_key" ON "budget_versions"("cost_center_id", "year", "number");

-- CreateIndex
CREATE INDEX "budget_version_line_changes_version_id_position_idx" ON "budget_version_line_changes"("version_id", "position");

-- AddForeignKey
ALTER TABLE "budget_proposals" ADD CONSTRAINT "budget_proposals_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_proposals" ADD CONSTRAINT "budget_proposals_cost_center_id_fkey" FOREIGN KEY ("cost_center_id") REFERENCES "cost_centers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_proposals" ADD CONSTRAINT "budget_proposals_currency_fkey" FOREIGN KEY ("currency") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_proposals" ADD CONSTRAINT "budget_proposals_previous_proposal_id_fkey" FOREIGN KEY ("previous_proposal_id") REFERENCES "budget_proposals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_proposal_lines" ADD CONSTRAINT "budget_proposal_lines_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "budget_proposals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_proposal_lines" ADD CONSTRAINT "budget_proposal_lines_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_versions" ADD CONSTRAINT "budget_versions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_versions" ADD CONSTRAINT "budget_versions_cost_center_id_fkey" FOREIGN KEY ("cost_center_id") REFERENCES "cost_centers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_versions" ADD CONSTRAINT "budget_versions_currency_fkey" FOREIGN KEY ("currency") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_versions" ADD CONSTRAINT "budget_versions_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "budget_proposals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_versions" ADD CONSTRAINT "budget_versions_based_on_version_id_fkey" FOREIGN KEY ("based_on_version_id") REFERENCES "budget_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_version_lines" ADD CONSTRAINT "budget_version_lines_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "budget_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_version_lines" ADD CONSTRAINT "budget_version_lines_proposal_id_proposal_position_fkey" FOREIGN KEY ("proposal_id", "proposal_position") REFERENCES "budget_proposal_lines"("proposal_id", "position") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_version_lines" ADD CONSTRAINT "budget_version_lines_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_version_line_changes" ADD CONSTRAINT "budget_version_line_changes_version_id_position_fkey" FOREIGN KEY ("version_id", "position") REFERENCES "budget_version_lines"("version_id", "position") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Constraints Prisma cannot express (ADR-0005).
ALTER TABLE "budget_proposals"
    ADD CONSTRAINT "budget_proposals_year_check" CHECK ("year" BETWEEN 2000 AND 2200),
    ADD CONSTRAINT "budget_proposals_total_check" CHECK ("total_minor" >= 0),
    ADD CONSTRAINT "budget_proposals_state_check" CHECK (
        ("state" = 'RETURNED' AND "returned_reason" IS NOT NULL AND btrim("returned_reason") <> ''
            AND "returned_by_employee_id" IS NOT NULL AND "returned_at" IS NOT NULL AND "withdrawn_at" IS NULL)
        OR ("state" = 'WITHDRAWN' AND "withdrawn_at" IS NOT NULL
            AND "returned_reason" IS NULL AND "returned_by_employee_id" IS NULL AND "returned_at" IS NULL)
        OR ("state" IN ('SUBMITTED', 'REVIEWED') AND "withdrawn_at" IS NULL
            AND "returned_reason" IS NULL AND "returned_by_employee_id" IS NULL AND "returned_at" IS NULL)
    );
-- One proposal waits or is being reviewed for a Cost Center and a year at a time (US-06-10 AC-1, AC-4, AC-5).
CREATE UNIQUE INDEX "budget_proposals_open_key" ON "budget_proposals" ("cost_center_id", "year")
    WHERE "state" IN ('SUBMITTED', 'REVIEWED');

ALTER TABLE "budget_proposal_lines"
    ADD CONSTRAINT "budget_proposal_lines_text_check" CHECK (
        btrim("description") <> '' AND ("note" IS NULL OR btrim("note") <> '')),
    ADD CONSTRAINT "budget_proposal_lines_seats_check" CHECK ("seats" IS NULL OR "seats" >= 1),
    ADD CONSTRAINT "budget_proposal_lines_amount_check" CHECK ("amount_minor" >= 0),
    ADD CONSTRAINT "budget_proposal_lines_window_check" CHECK ("window_to" >= "window_from"),
    ADD CONSTRAINT "budget_proposal_lines_service_check" CHECK ("service_period_months" >= 1),
    ADD CONSTRAINT "budget_proposal_lines_position_check" CHECK ("position" >= 1);

ALTER TABLE "budget_versions"
    ADD CONSTRAINT "budget_versions_year_check" CHECK ("year" BETWEEN 2000 AND 2200),
    ADD CONSTRAINT "budget_versions_number_check" CHECK ("number" >= 1),
    ADD CONSTRAINT "budget_versions_amount_check" CHECK (
        "base_minor" >= 0 AND "reserve_minor" >= 0 AND "total_minor" = "base_minor" + "reserve_minor"),
    ADD CONSTRAINT "budget_versions_threshold_check" CHECK ("high_value_percent" BETWEEN 0 AND 100),
    -- Forecast by quarter: all four or none, adding up to the total; it never limits a payment (QĐ-82e).
    ADD CONSTRAINT "budget_versions_quarters_check" CHECK (
        ("q1_minor" IS NULL AND "q2_minor" IS NULL AND "q3_minor" IS NULL AND "q4_minor" IS NULL)
        OR ("q1_minor" IS NOT NULL AND "q2_minor" IS NOT NULL AND "q3_minor" IS NOT NULL AND "q4_minor" IS NOT NULL
            AND "q1_minor" >= 0 AND "q2_minor" >= 0 AND "q3_minor" >= 0 AND "q4_minor" >= 0
            AND "q1_minor" + "q2_minor" + "q3_minor" + "q4_minor" = "total_minor")),
    ADD CONSTRAINT "budget_versions_source_check" CHECK (
        ("kind" = 'INITIAL' AND "proposal_id" IS NOT NULL AND "based_on_version_id" IS NULL)
        OR ("kind" = 'REVISION' AND "based_on_version_id" IS NOT NULL AND "proposal_id" IS NULL)),
    ADD CONSTRAINT "budget_versions_reason_check" CHECK (
        ("reason" IS NULL OR btrim("reason") <> '')
        AND ("kind" = 'INITIAL' OR "state" = 'DRAFT' OR "reason" IS NOT NULL)),
    ADD CONSTRAINT "budget_versions_sent_check" CHECK (
        ("state" = 'DRAFT' AND "sent_at" IS NULL AND "sent_by_employee_id" IS NULL)
        OR ("state" <> 'DRAFT' AND "sent_at" IS NOT NULL AND "sent_by_employee_id" IS NOT NULL));
-- At most one current version, and one in flight, for a Cost Center and a year (INV-21).
CREATE UNIQUE INDEX "budget_versions_current_key" ON "budget_versions" ("cost_center_id", "year")
    WHERE "state" = 'APPROVED';
CREATE UNIQUE INDEX "budget_versions_in_flight_key" ON "budget_versions" ("cost_center_id", "year")
    WHERE "state" IN ('DRAFT', 'SENT', 'CHANGES_REQUESTED');

ALTER TABLE "budget_version_lines"
    ADD CONSTRAINT "budget_version_lines_text_check" CHECK (
        btrim("description") <> ''
        AND ("finance_comment" IS NULL OR btrim("finance_comment") <> '')
        AND ("adjustment_reason" IS NULL OR btrim("adjustment_reason") <> '')),
    ADD CONSTRAINT "budget_version_lines_seats_check" CHECK ("seats" IS NULL OR "seats" >= 1),
    ADD CONSTRAINT "budget_version_lines_amount_check" CHECK ("amount_minor" >= 0),
    ADD CONSTRAINT "budget_version_lines_window_check" CHECK ("window_to" >= "window_from"),
    ADD CONSTRAINT "budget_version_lines_service_check" CHECK ("service_period_months" >= 1),
    ADD CONSTRAINT "budget_version_lines_position_check" CHECK ("position" >= 1),
    ADD CONSTRAINT "budget_version_lines_source_check" CHECK (("proposal_id" IS NULL) = ("proposal_position" IS NULL));

ALTER TABLE "budget_version_line_changes"
    ADD CONSTRAINT "budget_version_line_changes_reason_check" CHECK (btrim("reason") <> ''),
    ADD CONSTRAINT "budget_version_line_changes_window_check" CHECK (
        "window_to_before" >= "window_from_before" AND "window_to_after" >= "window_from_after");
