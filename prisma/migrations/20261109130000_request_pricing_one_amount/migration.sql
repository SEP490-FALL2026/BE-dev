-- BR-MF1-06, QĐ-109: a request has one amount for one year (the price of the months left of the year), not a schedule of payments.
-- `payment_schedule` and `expected_spend_on` are not written any more. The columns stay (RV-15: nothing is dropped in this round; rows written
-- before keep their values), so a CHECK cannot refuse them on every update of an old row: a trigger refuses a NEW value instead, and the
-- pricing CHECK no longer asks for them.

-- 1. The pricing CHECK without the schedule and the day the money goes out; a draft is judged only when it is sent, as before.
ALTER TABLE "access_requests" DROP CONSTRAINT "access_requests_pricing_check";

ALTER TABLE "access_requests"
    ADD CONSTRAINT "access_requests_pricing_check" CHECK (
        "state" = 'DRAFT'
        OR ("pricing_status" = 'NOT_APPLICABLE' AND "branch" = 'INTERNAL_FREE'
            AND "amount_minor" IS NULL AND "amount_currency" IS NULL AND "unit_price_minor" IS NULL
            AND "billing_cycle" IS NULL AND "price_missing_reason" IS NULL AND "budget_year" IS NULL)
        OR ("pricing_status" = 'PRICED' AND "branch" <> 'INTERNAL_FREE'
            AND "amount_minor" IS NOT NULL AND "amount_minor" >= 0
            AND "amount_currency" IS NOT NULL
            AND "unit_price_minor" IS NOT NULL AND "unit_price_minor" >= 0
            AND "billing_cycle" IS NOT NULL
            AND "price_missing_reason" IS NULL AND "budget_year" IS NOT NULL)
        OR ("pricing_status" = 'MISSING' AND "branch" <> 'INTERNAL_FREE'
            AND "amount_minor" IS NULL AND "amount_currency" IS NULL AND "unit_price_minor" IS NULL
            AND "billing_cycle" IS NULL
            AND "price_missing_reason" IS NOT NULL AND btrim("price_missing_reason") <> ''
            AND "budget_year" IS NOT NULL)
    );

-- 1b. What the first year of a request to go on using would cost when its new period begins in the year after the day it is priced
-- (QĐ-109b): the amount of this year is 0, the amount of that year is shown to the approver and never held against a budget.
ALTER TABLE "access_requests" ADD COLUMN "next_year_amount_minor" BIGINT;
ALTER TABLE "access_requests"
    ADD CONSTRAINT "access_requests_next_year_amount_check" CHECK ("next_year_amount_minor" IS NULL OR "next_year_amount_minor" >= 0);

-- 2. No new value in the two retired columns (an old row keeps what it has: only a value that is new is refused).
CREATE FUNCTION "access_request_reject_retired_pricing"() RETURNS trigger AS $$
BEGIN
    IF NEW."payment_schedule" IS NOT NULL
       AND (TG_OP = 'INSERT' OR NEW."payment_schedule" IS DISTINCT FROM OLD."payment_schedule") THEN
        RAISE EXCEPTION 'A request has one amount for one year: payment_schedule is not written any more'
            USING ERRCODE = '23514', CONSTRAINT = 'access_requests_payment_schedule_retired';
    END IF;
    IF NEW."expected_spend_on" IS NOT NULL
       AND (TG_OP = 'INSERT' OR NEW."expected_spend_on" IS DISTINCT FROM OLD."expected_spend_on") THEN
        RAISE EXCEPTION 'A request has one amount for one year: expected_spend_on is not written any more'
            USING ERRCODE = '23514', CONSTRAINT = 'access_requests_expected_spend_on_retired';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "access_requests_retired_pricing_columns"
    BEFORE INSERT OR UPDATE OF "payment_schedule", "expected_spend_on" ON "access_requests"
    FOR EACH ROW EXECUTE FUNCTION "access_request_reject_retired_pricing"();

-- 3. A supplementary file keeps the end date it changed, not the day the money goes out. The rows are append-only, so NOT VALID (old rows
-- are not checked) refuses exactly the new ones.
ALTER TABLE "request_supplements"
    ADD CONSTRAINT "request_supplements_retired_spend_day_check"
    CHECK ("before_expected_spend_on" IS NULL AND "after_expected_spend_on" IS NULL) NOT VALID;

-- A file still has to change something: the end date or the amount (the old CHECK compared the spend days, which a new file leaves empty).
ALTER TABLE "request_supplements"
    ADD CONSTRAINT "request_supplements_change_v2_check"
    CHECK ("before_amount_minor" IS DISTINCT FROM "after_amount_minor"
           OR "before_expected_end_date" IS DISTINCT FROM "after_expected_end_date") NOT VALID;

-- 4. `granted_on` (20261109120000) is written once, when the task of the grant is completed (BR-MF1-06a, RV-04), and with it the end the
-- request asked for may be cut to a year from that day: the only edit of a day that is "set once" (20261024090200) that is allowed. Everything
-- else of the function is as the latest definition of it (20261024090200), `granted_on` aside.
CREATE OR REPLACE FUNCTION "license_assignment_reject_change"() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'A license assignment is never deleted'
            USING ERRCODE = '55000', CONSTRAINT = 'license_assignments_immutable';
    END IF;

    IF (NEW."id", NEW."organization_id", NEW."kind", NEW."source", NEW."plan_id", NEW."subscription_id",
        NEW."employee_id", NEW."account_identifier", NEW."normalized_account_identifier", NEW."reason",
        NEW."cost_center_id", NEW."owning_department_id", NEW."valid_from", NEW."valid_from_basis", NEW."predecessor_id",
        NEW."baseline_import_id", NEW."created_by_app_user_id", NEW."created_at")
       IS DISTINCT FROM
       (OLD."id", OLD."organization_id", OLD."kind", OLD."source", OLD."plan_id", OLD."subscription_id",
        OLD."employee_id", OLD."account_identifier", OLD."normalized_account_identifier", OLD."reason",
        OLD."cost_center_id", OLD."owning_department_id", OLD."valid_from", OLD."valid_from_basis", OLD."predecessor_id",
        OLD."baseline_import_id", OLD."created_by_app_user_id", OLD."created_at") THEN
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
