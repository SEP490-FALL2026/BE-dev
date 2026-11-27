-- The lots born from a subscription (license_lots.legacy_subscription_id) take its unit price as it stands, and a lot's price is in dong.
-- A source whose price is in another currency would be carried into a lot as if it were dong, so the migration stops and names it.
-- Changes no data and no schema: roll forward by correcting the price of the named subscriptions, then deploy again.
--
-- Pre-check SELECT (run before applying on existing databases; must return no rows):
--   SELECT l."id" AS "license_lot_id", s."id" AS "subscription_id", s."unit_price_currency"
--     FROM "license_lots" l
--     JOIN "subscriptions" s ON s."id" = l."legacy_subscription_id"
--    WHERE s."unit_price_currency" IS NOT NULL AND s."unit_price_currency" <> 'VND';

DO $$
DECLARE
  foreign_count integer;
  foreign_ids text;
BEGIN
  SELECT count(*), COALESCE(string_agg(s."id"::text, ', ' ORDER BY s."id"), '')
    INTO foreign_count, foreign_ids
    FROM "license_lots" l
    JOIN "subscriptions" s ON s."id" = l."legacy_subscription_id"
   WHERE s."unit_price_currency" IS NOT NULL AND s."unit_price_currency" <> 'VND';

  IF foreign_count > 0 THEN
    RAISE EXCEPTION 'Lot source pre-check failed: % license lot(s) were born from a subscription priced in another currency than VND (subscription ids: %)', foreign_count, foreign_ids
      USING ERRCODE = '23514', CONSTRAINT = 'license_lots_source_priced_in_vnd';
  END IF;
END $$;
