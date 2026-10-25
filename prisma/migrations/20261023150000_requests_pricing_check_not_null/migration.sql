-- The pricing check let a priced request with no amount or no unit price through: a comparison with NULL is unknown, and a
-- CHECK accepts unknown. A priced request now names both outright (US-05-02 AC-1).
ALTER TABLE "access_requests" DROP CONSTRAINT "access_requests_pricing_check";

ALTER TABLE "access_requests"
    ADD CONSTRAINT "access_requests_pricing_check" CHECK (
        ("pricing_status" = 'NOT_APPLICABLE' AND "branch" = 'INTERNAL_FREE'
            AND "amount_minor" IS NULL AND "amount_currency" IS NULL AND "unit_price_minor" IS NULL
            AND "billing_cycle" IS NULL AND "payment_schedule" IS NULL AND "price_missing_reason" IS NULL
            AND "expected_spend_on" IS NULL AND "budget_year" IS NULL)
        OR ("pricing_status" = 'PRICED' AND "branch" <> 'INTERNAL_FREE'
            AND "amount_minor" IS NOT NULL AND "amount_minor" >= 0
            AND "amount_currency" IS NOT NULL
            AND "unit_price_minor" IS NOT NULL AND "unit_price_minor" >= 0
            AND "billing_cycle" IS NOT NULL AND "payment_schedule" IS NOT NULL
            AND jsonb_typeof("payment_schedule") = 'array' AND jsonb_array_length("payment_schedule") >= 1
            AND "price_missing_reason" IS NULL AND "expected_spend_on" IS NOT NULL AND "budget_year" IS NOT NULL)
        OR ("pricing_status" = 'MISSING' AND "branch" <> 'INTERNAL_FREE'
            AND "amount_minor" IS NULL AND "amount_currency" IS NULL AND "unit_price_minor" IS NULL
            AND "billing_cycle" IS NULL AND "payment_schedule" IS NULL
            AND "price_missing_reason" IS NOT NULL AND btrim("price_missing_reason") <> ''
            AND "expected_spend_on" IS NOT NULL AND "budget_year" IS NOT NULL)
    );
