-- BR-MF1-06e..i, QĐ-97c: the check of the budget of a request gives one of three outcomes (within the base, uses the reserve, blocked) on the one year
-- of the request, against a base and a reserve. Only additions here: the columns of the old check stay (RV-15: nothing is dropped in this
-- round) and rows written before keep what they have.
-- A new enum value cannot be used in the transaction that adds it, so the CHECKs that name the new values are in the next migration.

-- 1. The three outcomes and the two triggers/outcomes that are new.
CREATE TYPE "BudgetCheckOutcome" AS ENUM ('WITHIN_BASE', 'USES_RESERVE', 'BLOCKED');

ALTER TYPE "BudgetCheckTrigger" ADD VALUE 'RESERVE_CONFIRMATION';
ALTER TYPE "SpendBatchItemOutcome" ADD VALUE 'AWAITING_RESERVE_CONFIRMATION';

-- 2. What a check says now. A row written before has no outcome (it is read from its code); a row written now has one (the NOT VALID CHECK
-- below refuses a new row without it and does not look at the old ones).
ALTER TABLE "request_budget_checks"
    ADD COLUMN "outcome" "BudgetCheckOutcome",
    ADD COLUMN "block_reasons" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    ADD COLUMN "over_base_by_minor" BIGINT,
    ADD COLUMN "over_by_minor" BIGINT,
    -- The Cost Center the check read (the current one of the department, M-12): the approval checks again against the current one and a
    -- Cost Center that is not the one of the check before is blocked. Null for a check made before.
    ADD COLUMN "cost_center_id" UUID;

ALTER TABLE "request_budget_checks"
    ADD CONSTRAINT "request_budget_checks_block_reasons_check"
        CHECK ("block_reasons" <@ ARRAY['OVER_RESERVE', 'NO_APPROVED_BUDGET', 'PRICE_EXPIRED']::TEXT[]),
    ADD CONSTRAINT "request_budget_checks_over_check"
        CHECK (("over_base_by_minor" IS NULL OR "over_base_by_minor" > 0) AND ("over_by_minor" IS NULL OR "over_by_minor" > 0)),
    ADD CONSTRAINT "request_budget_checks_outcome_required_check" CHECK ("outcome" IS NOT NULL) NOT VALID;

-- The old rule tied the route to the two codes of the data. A check with an outcome is blocked when the outcome is, with its reasons and no
-- other; it never goes to Finance, never has a closed period, an overdue plan line or "outside the plan" (nothing of these is judged any more).
ALTER TABLE "request_budget_checks" DROP CONSTRAINT "request_budget_checks_blocked_check";
ALTER TABLE "request_budget_checks"
    ADD CONSTRAINT "request_budget_checks_blocked_check" CHECK (
        ("outcome" IS NULL AND ("route" = 'BLOCKED') = ("stale_cost_evidence" OR "period_closed"))
        OR ("outcome" IS NOT NULL
            AND "route" <> 'FINANCE_REVIEW'
            AND ("route" = 'BLOCKED') = ("outcome" = 'BLOCKED')
            AND ("outcome" = 'BLOCKED') = (cardinality("block_reasons") > 0)
            AND ("over_by_minor" IS NOT NULL) = ('OVER_RESERVE' = ANY ("block_reasons"))
            AND "stale_cost_evidence" = ('PRICE_EXPIRED' = ANY ("block_reasons"))
            AND NOT "period_closed" AND NOT "plan_line_overdue" AND NOT "off_plan")
    );

-- 3. The year of a check with its base, its reserve and what is left at the two levels. A year that has no approved version has none of them.
ALTER TABLE "request_budget_check_years"
    ADD COLUMN "base_minor" BIGINT,
    ADD COLUMN "reserve_minor" BIGINT,
    ADD COLUMN "remaining_base_minor" BIGINT,
    ADD COLUMN "remaining_with_reserve_minor" BIGINT;

ALTER TABLE "request_budget_check_years"
    ADD CONSTRAINT "request_budget_check_years_levels_check" CHECK (
        ("base_minor" IS NULL AND "reserve_minor" IS NULL AND "remaining_base_minor" IS NULL AND "remaining_with_reserve_minor" IS NULL)
        OR ("base_minor" IS NOT NULL AND "reserve_minor" IS NOT NULL AND "remaining_base_minor" IS NOT NULL
            AND "remaining_with_reserve_minor" IS NOT NULL AND "base_minor" >= 0 AND "reserve_minor" >= 0)
    ),
    -- A year that is judged now has a code that exists now and the figures of its budget at both levels (the old codes stay readable).
    ADD CONSTRAINT "request_budget_check_years_judged_check" CHECK (
        ("code" = 'NO_ACTIVE_BUDGET' AND "base_minor" IS NULL)
        OR ("code" IN ('BUDGET_OK', 'INSUFFICIENT_BUDGET') AND "base_minor" IS NOT NULL)
    ) NOT VALID;

-- 4. The confirmation of the head that a request uses the reserve (BR-MF1-06h): one line of reason, for one check and the one spend step it opens.
-- The person is the head of the department at that moment; a confirmation stays when the head changes, so it is kept as written and never changed.
CREATE TABLE "request_reserve_confirmations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "check_id" UUID NOT NULL,
    "spend_step_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "confirmed_by_employee_id" UUID NOT NULL,
    "confirmed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "request_reserve_confirmations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "request_reserve_confirmations_reason_check"
        CHECK (char_length(btrim("reason")) BETWEEN 1 AND 500 AND "reason" !~ E'[\\r\\n]')
);

CREATE UNIQUE INDEX "request_reserve_confirmations_check_id_key" ON "request_reserve_confirmations"("check_id");
CREATE UNIQUE INDEX "request_reserve_confirmations_spend_step_id_key" ON "request_reserve_confirmations"("spend_step_id");
CREATE INDEX "request_reserve_confirmations_request_id_idx" ON "request_reserve_confirmations"("request_id");

ALTER TABLE "request_reserve_confirmations" ADD CONSTRAINT "request_reserve_confirmations_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "request_reserve_confirmations" ADD CONSTRAINT "request_reserve_confirmations_request_id_fkey"
    FOREIGN KEY ("request_id") REFERENCES "access_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "request_reserve_confirmations" ADD CONSTRAINT "request_reserve_confirmations_check_id_fkey"
    FOREIGN KEY ("check_id") REFERENCES "request_budget_checks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "request_reserve_confirmations" ADD CONSTRAINT "request_reserve_confirmations_spend_step_id_fkey"
    FOREIGN KEY ("spend_step_id") REFERENCES "access_request_steps"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "request_reserve_confirmations" ADD CONSTRAINT "request_reserve_confirmations_confirmed_by_employee_id_fkey"
    FOREIGN KEY ("confirmed_by_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- INV-05: what the head confirmed is never rewritten (the same function that keeps the checks append-only).
CREATE TRIGGER request_reserve_confirmations_no_update_delete
    BEFORE UPDATE OR DELETE ON request_reserve_confirmations
    FOR EACH ROW EXECUTE FUNCTION request_budget_records_reject_change();

CREATE TRIGGER request_reserve_confirmations_no_truncate
    BEFORE TRUNCATE ON request_reserve_confirmations
    FOR EACH STATEMENT EXECUTE FUNCTION request_budget_records_reject_change();
