-- The check of the budget of a request and the review of Finance that follows it (US-06-12, US-06-13). Every check is a
-- row of its own and none is changed (INV-05): a check made again is a new check. How a Finance review ended is kept as it
-- was given, for the spending approver to read next to the check.

-- CreateEnum
CREATE TYPE "BudgetCheckTrigger" AS ENUM ('SUBMISSION', 'PLAN_LINE_MOVED', 'BUDGET_VERSION_APPROVED');

-- CreateEnum
CREATE TYPE "BudgetCheckRoute" AS ENUM ('BLOCKED', 'FINANCE_REVIEW', 'SPEND_APPROVAL');

-- CreateEnum
CREATE TYPE "FinanceReviewOutcome" AS ENUM ('ASSESSED', 'RETURNED_TO_HEAD', 'BUDGET_REVISION_NEEDED', 'LINE_UPDATED');

-- CreateEnum
CREATE TYPE "FinanceDirection" AS ENUM ('RECOMMEND_APPROVE', 'RECOMMEND_OVERRIDE', 'RECOMMEND_REJECT');

-- CreateEnum
CREATE TYPE "BudgetYearCode" AS ENUM ('BUDGET_OK', 'HIGH_VALUE', 'INSUFFICIENT_BUDGET', 'NO_ACTIVE_BUDGET');

-- AlterTable: the plan line a request is attached to, as values (the budgets context owns the line), and the flags the
-- head sets (US-05-04 AC-12, AC-13).
ALTER TABLE "access_requests"
    ADD COLUMN "plan_line_version_id" UUID,
    ADD COLUMN "plan_line_position" INTEGER,
    ADD COLUMN "plan_line_confirmed" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "off_plan" BOOLEAN NOT NULL DEFAULT false,
    ADD CONSTRAINT "access_requests_plan_line_check" CHECK (
        ("plan_line_version_id" IS NULL AND "plan_line_position" IS NULL)
        OR ("plan_line_version_id" IS NOT NULL AND "plan_line_position" IS NOT NULL AND "plan_line_position" >= 1)
    ),
    ADD CONSTRAINT "access_requests_off_plan_check" CHECK (NOT ("off_plan" AND "plan_line_version_id" IS NOT NULL)),
    ADD CONSTRAINT "access_requests_plan_line_confirmed_check" CHECK (NOT "plan_line_confirmed" OR "plan_line_version_id" IS NOT NULL);

-- AlterTable
ALTER TABLE "access_request_steps" ADD COLUMN "no_independent_review" BOOLEAN NOT NULL DEFAULT false;

-- A step that ended without approving or refusing is complete or closed: a completed one was held by a person, a closed one
-- may never have been.
ALTER TABLE "access_request_steps" DROP CONSTRAINT "access_request_steps_holder_check";
ALTER TABLE "access_request_steps"
    ADD CONSTRAINT "access_request_steps_holder_check" CHECK (
        ("state" = 'PENDING' AND "assignee_employee_id" IS NOT NULL AND "assigned_at" IS NOT NULL AND "waiting_reason" IS NULL AND "decided_at" IS NULL)
        OR ("state" = 'WAITING' AND "assignee_employee_id" IS NULL AND "assigned_at" IS NULL AND "waiting_reason" IS NOT NULL AND "decided_at" IS NULL)
        OR ("state" IN ('APPROVED', 'REJECTED', 'COMPLETED') AND "assignee_employee_id" IS NOT NULL AND "assigned_at" IS NOT NULL AND "waiting_reason" IS NULL AND "decided_at" IS NOT NULL)
        OR ("state" = 'CLOSED' AND ("assignee_employee_id" IS NULL) = ("assigned_at" IS NULL) AND "waiting_reason" IS NULL AND "decided_at" IS NOT NULL)
    );

-- One review and one spend step open at a time for a request (INV-21 of the chain): a second one would let two people decide.
CREATE UNIQUE INDEX "access_request_steps_one_open_spend_step"
    ON "access_request_steps" ("request_id", "kind")
    WHERE "kind" IN ('FINANCE_REVIEW', 'SPEND_APPROVAL') AND "state" IN ('PENDING', 'WAITING');

-- CreateTable
CREATE TABLE "request_budget_checks" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "trigger" "BudgetCheckTrigger" NOT NULL,
    "route" "BudgetCheckRoute" NOT NULL,
    "stale_cost_evidence" BOOLEAN NOT NULL,
    "plan_line_overdue" BOOLEAN NOT NULL,
    "period_closed" BOOLEAN NOT NULL,
    "off_plan" BOOLEAN NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "binding_total_minor" BIGINT NOT NULL,
    "ran_by_employee_id" UUID,
    "ran_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "request_budget_checks_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "request_budget_checks_number_check" CHECK ("number" >= 1),
    CONSTRAINT "request_budget_checks_total_check" CHECK ("binding_total_minor" >= 0),
    -- A request with a problem in its data goes nowhere; one without goes to Finance when anything is out of the ordinary.
    CONSTRAINT "request_budget_checks_blocked_check" CHECK (
        ("route" = 'BLOCKED') = ("stale_cost_evidence" OR "period_closed")
    ),
    CONSTRAINT "request_budget_checks_overdue_check" CHECK (NOT ("route" = 'SPEND_APPROVAL' AND "plan_line_overdue"))
);

-- CreateTable
CREATE TABLE "request_budget_check_years" (
    "check_id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "cost_minor" BIGINT NOT NULL,
    "code" "BudgetYearCode",
    "version_id" UUID,
    "budget_minor" BIGINT,
    "held_minor" BIGINT,
    "spent_minor" BIGINT,
    "remaining_minor" BIGINT,
    "share_basis_points" INTEGER,

    CONSTRAINT "request_budget_check_years_pkey" PRIMARY KEY ("check_id", "year"),
    CONSTRAINT "request_budget_check_years_year_check" CHECK ("year" BETWEEN 2000 AND 2200),
    CONSTRAINT "request_budget_check_years_cost_check" CHECK ("cost_minor" >= 0),
    CONSTRAINT "request_budget_check_years_share_check" CHECK ("share_basis_points" IS NULL OR "share_basis_points" >= 0),
    -- A year that has ended has no code and no figures; a year with no budget has a code and no figures of a budget; every
    -- other year has all of them (US-06-12 AC-5, AC-7). A code that is missing is tested, since a comparison with it is unknown.
    CONSTRAINT "request_budget_check_years_shape_check" CHECK (
        ("code" IS NULL AND "version_id" IS NULL AND "budget_minor" IS NULL AND "held_minor" IS NULL AND "spent_minor" IS NULL AND "remaining_minor" IS NULL AND "share_basis_points" IS NULL)
        OR ("code" IS NOT NULL AND "code" = 'NO_ACTIVE_BUDGET' AND "version_id" IS NULL AND "budget_minor" IS NULL AND "held_minor" IS NULL AND "spent_minor" IS NULL AND "remaining_minor" IS NULL AND "share_basis_points" IS NULL)
        OR ("code" IS NOT NULL AND "code" IN ('BUDGET_OK', 'HIGH_VALUE', 'INSUFFICIENT_BUDGET') AND "version_id" IS NOT NULL AND "budget_minor" IS NOT NULL AND "held_minor" IS NOT NULL AND "spent_minor" IS NOT NULL AND "remaining_minor" IS NOT NULL)
    )
);

-- CreateTable
CREATE TABLE "request_finance_reviews" (
    "step_id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "check_id" UUID NOT NULL,
    "outcome" "FinanceReviewOutcome" NOT NULL,
    "opinion" TEXT,
    "direction" "FinanceDirection",
    "reason" TEXT,
    "decided_by_employee_id" UUID NOT NULL,
    "decided_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "request_finance_reviews_pkey" PRIMARY KEY ("step_id"),
    -- An opinion needs its direction and no reason; every other outcome needs its reason and has no opinion (US-06-13 AC-3).
    CONSTRAINT "request_finance_reviews_shape_check" CHECK (
        ("outcome" = 'ASSESSED' AND "opinion" IS NOT NULL AND btrim("opinion") <> '' AND "direction" IS NOT NULL AND "reason" IS NULL)
        OR ("outcome" IN ('RETURNED_TO_HEAD', 'BUDGET_REVISION_NEEDED', 'LINE_UPDATED') AND "reason" IS NOT NULL AND btrim("reason") <> '' AND "opinion" IS NULL AND "direction" IS NULL)
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "request_budget_checks_request_id_number_key" ON "request_budget_checks"("request_id", "number");

-- CreateIndex
CREATE INDEX "request_finance_reviews_request_id_decided_at_idx" ON "request_finance_reviews"("request_id", "decided_at");

-- AddForeignKey
ALTER TABLE "request_budget_checks" ADD CONSTRAINT "request_budget_checks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_budget_checks" ADD CONSTRAINT "request_budget_checks_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "access_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_budget_checks" ADD CONSTRAINT "request_budget_checks_currency_fkey" FOREIGN KEY ("currency") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_budget_checks" ADD CONSTRAINT "request_budget_checks_ran_by_employee_id_fkey" FOREIGN KEY ("ran_by_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_budget_check_years" ADD CONSTRAINT "request_budget_check_years_check_id_fkey" FOREIGN KEY ("check_id") REFERENCES "request_budget_checks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_finance_reviews" ADD CONSTRAINT "request_finance_reviews_step_id_fkey" FOREIGN KEY ("step_id") REFERENCES "access_request_steps"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_finance_reviews" ADD CONSTRAINT "request_finance_reviews_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "access_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_finance_reviews" ADD CONSTRAINT "request_finance_reviews_check_id_fkey" FOREIGN KEY ("check_id") REFERENCES "request_budget_checks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_finance_reviews" ADD CONSTRAINT "request_finance_reviews_decided_by_employee_id_fkey" FOREIGN KEY ("decided_by_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- INV-05: a check, its years and the way a review ended are append-only, so no code path, including raw SQL from another module, can
-- rewrite what the spending approver relies on.
CREATE FUNCTION request_budget_records_reject_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only (% rejected)', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER request_budget_checks_no_update_delete
  BEFORE UPDATE OR DELETE ON request_budget_checks
  FOR EACH ROW EXECUTE FUNCTION request_budget_records_reject_change();

CREATE TRIGGER request_budget_checks_no_truncate
  BEFORE TRUNCATE ON request_budget_checks
  FOR EACH STATEMENT EXECUTE FUNCTION request_budget_records_reject_change();

CREATE TRIGGER request_budget_check_years_no_update_delete
  BEFORE UPDATE OR DELETE ON request_budget_check_years
  FOR EACH ROW EXECUTE FUNCTION request_budget_records_reject_change();

CREATE TRIGGER request_budget_check_years_no_truncate
  BEFORE TRUNCATE ON request_budget_check_years
  FOR EACH STATEMENT EXECUTE FUNCTION request_budget_records_reject_change();

CREATE TRIGGER request_finance_reviews_no_update_delete
  BEFORE UPDATE OR DELETE ON request_finance_reviews
  FOR EACH ROW EXECUTE FUNCTION request_budget_records_reject_change();

CREATE TRIGGER request_finance_reviews_no_truncate
  BEFORE TRUNCATE ON request_finance_reviews
  FOR EACH STATEMENT EXECUTE FUNCTION request_budget_records_reject_change();
