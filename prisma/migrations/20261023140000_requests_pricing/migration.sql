-- The amount of a request for paid software and the day it is expected to be paid (US-05-02 AC-1, AC-4, AC-11, QĐ-82e,
-- QĐ-84). Internal software has none of it; paid software is priced from its plan, or is missing its price and says why.
-- The migration puts the rows that exist (a request sent before the amount was kept) in the state they are in: paid
-- software with no price recorded is missing its price.

-- CreateEnum
CREATE TYPE "AccessRequestPricingStatus" AS ENUM ('NOT_APPLICABLE', 'PRICED', 'MISSING');

-- AlterTable
ALTER TABLE "access_requests"
    ADD COLUMN "pricing_status" "AccessRequestPricingStatus" NOT NULL DEFAULT 'NOT_APPLICABLE',
    ADD COLUMN "price_missing_reason" TEXT,
    ADD COLUMN "expected_spend_on" DATE,
    ADD COLUMN "budget_year" INTEGER,
    ADD COLUMN "amount_minor" BIGINT,
    ADD COLUMN "amount_currency" CHAR(3),
    ADD COLUMN "unit_price_minor" BIGINT,
    ADD COLUMN "billing_cycle" "BillingCycle",
    ADD COLUMN "payment_schedule" JSONB;

UPDATE "access_requests"
   SET "pricing_status" = 'MISSING',
       "price_missing_reason" = 'NO_PRICED_SUBSCRIPTION',
       "expected_spend_on" = "submitted_at"::date,
       "budget_year" = EXTRACT(YEAR FROM "submitted_at")::int
 WHERE "branch" = 'PAID_IN_CATALOG';

-- AddForeignKey
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_amount_currency_fkey" FOREIGN KEY ("amount_currency") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Constraints Prisma cannot express (ADR-0005): the three states of a price each carry exactly what they mean, and
-- internal software is the only request with no price to speak of.
ALTER TABLE "access_requests"
    ADD CONSTRAINT "access_requests_pricing_check" CHECK (
        ("pricing_status" = 'NOT_APPLICABLE' AND "branch" = 'INTERNAL_FREE'
            AND "amount_minor" IS NULL AND "amount_currency" IS NULL AND "unit_price_minor" IS NULL
            AND "billing_cycle" IS NULL AND "payment_schedule" IS NULL AND "price_missing_reason" IS NULL
            AND "expected_spend_on" IS NULL AND "budget_year" IS NULL)
        OR ("pricing_status" = 'PRICED' AND "branch" <> 'INTERNAL_FREE'
            AND "amount_minor" >= 0 AND "amount_currency" IS NOT NULL AND "unit_price_minor" >= 0
            AND "billing_cycle" IS NOT NULL AND "payment_schedule" IS NOT NULL
            AND jsonb_typeof("payment_schedule") = 'array' AND jsonb_array_length("payment_schedule") >= 1
            AND "price_missing_reason" IS NULL AND "expected_spend_on" IS NOT NULL AND "budget_year" IS NOT NULL)
        OR ("pricing_status" = 'MISSING' AND "branch" <> 'INTERNAL_FREE'
            AND "amount_minor" IS NULL AND "amount_currency" IS NULL AND "unit_price_minor" IS NULL
            AND "billing_cycle" IS NULL AND "payment_schedule" IS NULL
            AND "price_missing_reason" IS NOT NULL AND btrim("price_missing_reason") <> ''
            AND "expected_spend_on" IS NOT NULL AND "budget_year" IS NOT NULL)
    );
