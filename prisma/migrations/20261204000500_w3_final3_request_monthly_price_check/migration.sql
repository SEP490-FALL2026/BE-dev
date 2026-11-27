-- H-7 (complete B-5): Enforce NOT NULL monthly_price_minor for priced recurring non-DRAFT requests via CHECK constraint (without modifying committed migration 20261204000100).
-- Reversal SQL:
--   ALTER TABLE "access_requests" DROP CONSTRAINT IF EXISTS "access_requests_monthly_price_check";
--   ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_monthly_price_check"
--     CHECK ("monthly_price_minor" IS NULL OR "monthly_price_minor" >= 0);
--
-- Pre-check SELECT (run before applying on existing databases):
--   SELECT
--     COUNT(*) FILTER (
--       WHERE "state" <> 'DRAFT'
--         AND "pricing_status" = 'PRICED'
--         AND "price_kind" = 'RECURRING'
--         AND "monthly_price_minor" IS NULL
--         AND "unit_price_minor" IS NOT NULL
--         AND "unit_price_minor" >= 0
--         AND "billing_cycle" IN ('MONTHLY', 'QUARTERLY', 'ANNUAL')
--     ) AS backfill_candidates,
--     COUNT(*) FILTER (
--       WHERE "state" <> 'DRAFT'
--         AND "pricing_status" = 'PRICED'
--         AND "price_kind" = 'RECURRING'
--         AND "monthly_price_minor" IS NULL
--         AND (
--           "unit_price_minor" IS NULL
--           OR "unit_price_minor" < 0
--           OR "billing_cycle" IS NULL
--           OR "billing_cycle" NOT IN ('MONTHLY', 'QUARTERLY', 'ANNUAL')
--         )
--     ) AS invalid_priced_recurring_rows
--   FROM "access_requests";

UPDATE "access_requests"
   SET "monthly_price_minor" = CASE "billing_cycle"
     WHEN 'MONTHLY' THEN ("unit_price_minor" * 2 + 1) / 2
     WHEN 'QUARTERLY' THEN ("unit_price_minor" * 2 + 3) / 6
     WHEN 'ANNUAL' THEN ("unit_price_minor" * 2 + 12) / 24
   END
 WHERE "state" <> 'DRAFT'
   AND "pricing_status" = 'PRICED'
   AND "price_kind" = 'RECURRING'
   AND "monthly_price_minor" IS NULL
   AND "unit_price_minor" IS NOT NULL
   AND "unit_price_minor" >= 0
   AND "billing_cycle" IN ('MONTHLY', 'QUARTERLY', 'ANNUAL');

DO $$
DECLARE
  invalid_count BIGINT;
BEGIN
  SELECT COUNT(*)
    INTO invalid_count
    FROM "access_requests"
   WHERE "state" <> 'DRAFT'
     AND "pricing_status" = 'PRICED'
     AND "price_kind" = 'RECURRING'
     AND "monthly_price_minor" IS NULL;

  IF invalid_count > 0 THEN
    RAISE EXCEPTION 'Found % non-DRAFT PRICED RECURRING access_requests with NULL monthly_price_minor', invalid_count;
  END IF;
END $$;

ALTER TABLE "access_requests" DROP CONSTRAINT IF EXISTS "access_requests_monthly_price_check";

ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_monthly_price_check"
  CHECK (
    ("monthly_price_minor" IS NULL OR "monthly_price_minor" >= 0)
    AND (
      "state" = 'DRAFT'
      OR "pricing_status" <> 'PRICED'
      OR "price_kind" IS DISTINCT FROM 'RECURRING'
      OR "monthly_price_minor" IS NOT NULL
    )
  );
