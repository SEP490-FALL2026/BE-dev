-- B-5 (Owner 27/11): Persist submit-day monthly price on access_requests so hold, release, and 01/01 read the stored column directly without recomputing unit_price_minor / billing_cycle.
-- Reversal SQL:
--   ALTER TABLE "access_requests" DROP CONSTRAINT IF EXISTS "access_requests_monthly_price_check";
--   ALTER TABLE "access_requests" DROP COLUMN IF EXISTS "monthly_price_minor";

-- Pre-check SELECT (run before applying on existing databases to verify zero invalid recurring rows):
--   SELECT
--     COUNT(*) FILTER (
--       WHERE "pricing_status" = 'PRICED'
--         AND ("price_kind" IS NULL OR "price_kind" = 'RECURRING')
--         AND "unit_price_minor" IS NOT NULL
--         AND "amount_currency" IS NOT NULL
--         AND "billing_cycle" IN ('MONTHLY', 'QUARTERLY', 'ANNUAL')
--     ) AS backfill_candidates,
--     COUNT(*) FILTER (
--       WHERE "pricing_status" = 'PRICED'
--         AND ("price_kind" IS NULL OR "price_kind" = 'RECURRING')
--         AND ("unit_price_minor" IS NULL OR "unit_price_minor" < 0)
--     ) AS invalid_unit_price_rows
--   FROM "access_requests";

DO $$
DECLARE
  invalid_count BIGINT;
BEGIN
  SELECT COUNT(*)
    INTO invalid_count
    FROM "access_requests"
   WHERE "pricing_status" = 'PRICED'
     AND ("price_kind" IS NULL OR "price_kind" = 'RECURRING')
     AND ("unit_price_minor" IS NULL OR "unit_price_minor" < 0);

  IF invalid_count > 0 THEN
    RAISE EXCEPTION 'Found % PRICED recurring access_requests with NULL or negative unit_price_minor', invalid_count;
  END IF;
END $$;

ALTER TABLE "access_requests" ADD COLUMN "monthly_price_minor" BIGINT;

ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_monthly_price_check"
  CHECK ("monthly_price_minor" IS NULL OR "monthly_price_minor" >= 0);

UPDATE "access_requests"
   SET "monthly_price_minor" = CASE "billing_cycle"
     WHEN 'MONTHLY' THEN ("unit_price_minor" * 2 + 1) / 2
     WHEN 'QUARTERLY' THEN ("unit_price_minor" * 2 + 3) / 6
     WHEN 'ANNUAL' THEN ("unit_price_minor" * 2 + 12) / 24
   END
 WHERE "monthly_price_minor" IS NULL
   AND "pricing_status" = 'PRICED'
   AND ("price_kind" IS NULL OR "price_kind" = 'RECURRING')
   AND "unit_price_minor" IS NOT NULL
   AND "amount_currency" IS NOT NULL
   AND "billing_cycle" IN ('MONTHLY', 'QUARTERLY', 'ANNUAL');
