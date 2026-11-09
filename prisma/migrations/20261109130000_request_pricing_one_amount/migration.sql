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
