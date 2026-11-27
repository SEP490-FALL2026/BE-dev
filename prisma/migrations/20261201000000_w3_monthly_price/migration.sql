-- Migration M1 (W3-02): monthly seat price on subscriptions and reference commitment months on plans.
--
-- Roll-forward rollback (manual SQL if reverting before downstream code reads these columns):
--   ALTER TABLE "subscriptions" DROP CONSTRAINT IF EXISTS "subscriptions_active_term_monthly_price";
--   ALTER TABLE "subscriptions" DROP CONSTRAINT IF EXISTS "subscriptions_monthly_unit_price_non_negative";
--   ALTER TABLE "subscriptions" DROP COLUMN IF EXISTS "monthly_unit_price_minor";
--   ALTER TABLE "plans" DROP CONSTRAINT IF EXISTS "plans_reference_commitment_valid";
--   ALTER TABLE "plans" DROP CONSTRAINT IF EXISTS "plans_reference_commitment_kind";
--   ALTER TABLE "plans" DROP COLUMN IF EXISTS "reference_commitment_months";

-- Pre-checks: stop before altering tables if legacy rows violate M1 backfill assumptions.
DO $$
DECLARE
  non_vnd_term_count BIGINT;
  non_vnd_term_ids TEXT;
  active_other_term_count BIGINT;
  active_other_term_ids TEXT;
  active_unpriced_term_count BIGINT;
  active_unpriced_term_ids TEXT;
BEGIN
  SELECT COUNT(*), COALESCE(string_agg("id"::text, ', ' ORDER BY "id"), '')
  INTO non_vnd_term_count, non_vnd_term_ids
  FROM "subscriptions"
  WHERE "kind" = 'TERM'
    AND (
      ("unit_price_currency" IS NOT NULL AND "unit_price_currency" <> 'VND')
      OR ("price_reporting_currency" IS NOT NULL AND "price_reporting_currency" <> 'VND')
    );

  IF non_vnd_term_count > 0 THEN
    RAISE EXCEPTION 'M1 pre-check failed: % TERM subscription(s) have non-VND currency (ids: %)', non_vnd_term_count, non_vnd_term_ids;
  END IF;

  SELECT COUNT(*), COALESCE(string_agg("id"::text, ', ' ORDER BY "id"), '')
  INTO active_other_term_count, active_other_term_ids
  FROM "subscriptions"
  WHERE "kind" = 'TERM'
    AND "status" = 'ACTIVE'
    AND "billing_cycle" = 'OTHER';

  IF active_other_term_count > 0 THEN
    RAISE EXCEPTION 'M1 pre-check failed: % ACTIVE TERM subscription(s) have billing_cycle = OTHER (ids: %)', active_other_term_count, active_other_term_ids;
  END IF;

  SELECT COUNT(*), COALESCE(string_agg("id"::text, ', ' ORDER BY "id"), '')
  INTO active_unpriced_term_count, active_unpriced_term_ids
  FROM "subscriptions"
  WHERE "kind" = 'TERM'
    AND "status" = 'ACTIVE'
    AND COALESCE("price_reporting_minor", "unit_price_minor") IS NULL;

  IF active_unpriced_term_count > 0 THEN
    RAISE EXCEPTION 'M1 pre-check failed: % ACTIVE TERM subscription(s) have no price (ids: %)', active_unpriced_term_count, active_unpriced_term_ids;
  END IF;
END $$;

ALTER TABLE "plans"
  ADD COLUMN "reference_commitment_months" SMALLINT;

ALTER TABLE "subscriptions"
  ADD COLUMN "monthly_unit_price_minor" BIGINT;

-- Backfill subscriptions.monthly_unit_price_minor using integer round-half-up: (p * 2 + m) / (2 * m).
UPDATE "subscriptions"
SET "monthly_unit_price_minor" = CASE
  WHEN "kind" = 'TERM'
    AND "billing_cycle" IN ('MONTHLY', 'QUARTERLY', 'ANNUAL')
    AND COALESCE("price_reporting_minor", "unit_price_minor") IS NOT NULL
  THEN
    CASE "billing_cycle"
      WHEN 'MONTHLY' THEN (COALESCE("price_reporting_minor", "unit_price_minor") * 2 + 1) / 2
      WHEN 'QUARTERLY' THEN (COALESCE("price_reporting_minor", "unit_price_minor") * 2 + 3) / 6
      WHEN 'ANNUAL' THEN (COALESCE("price_reporting_minor", "unit_price_minor") * 2 + 12) / 24
    END
  ELSE NULL
END;

-- Backfill plans.reference_commitment_months: K1 -> 1; K2 -> primary subscription's commitment_term_months (if 1 or 12), else NULL.
UPDATE "plans" p
SET "reference_commitment_months" = CASE
  WHEN p."provisioning_type" = 'K1' THEN 1
  WHEN p."provisioning_type" = 'K2' THEN (
    SELECT s."commitment_term_months"
    FROM "subscriptions" s
    WHERE s."plan_id" = p."id"
      AND s."is_primary_for_plan" = true
      AND s."commitment_term_months" IN (1, 12)
    LIMIT 1
  )
  ELSE NULL
END;

-- CHECK constraints come after backfill so existing rows are already valid.
ALTER TABLE "plans"
  ADD CONSTRAINT "plans_reference_commitment_valid"
    CHECK ("reference_commitment_months" IS NULL OR "reference_commitment_months" IN (1, 12)),
  ADD CONSTRAINT "plans_reference_commitment_kind"
    CHECK ("reference_commitment_months" IS NULL OR "provisioning_type" IN ('K1', 'K2'));

ALTER TABLE "subscriptions"
  ADD CONSTRAINT "subscriptions_monthly_unit_price_non_negative"
    CHECK ("monthly_unit_price_minor" IS NULL OR "monthly_unit_price_minor" >= 0),
  ADD CONSTRAINT "subscriptions_active_term_monthly_price"
    CHECK ("status" <> 'ACTIVE' OR "kind" <> 'TERM' OR "monthly_unit_price_minor" IS NOT NULL);
