-- QĐ-111an, R-4, S-1 (FX-1.1, data): the system prices in dong only. A price, a quote and the amount of a request that an earlier release held in
-- another currency are turned into dong ONCE, here, at the newest exchange rate entered on or before the day this runs, rounded to the nearest
-- dong with an exact half moving away from zero (ADR-0007, the same arithmetic as `core/money/convert.ts`). The price it was is kept in the two
-- columns of `20261113002800_fx_original_price_columns`; the snapshot of a converted subscription price is the one of the same currency
-- (rate 1, `SAME_CURRENCY`, dated by the day the price was recorded), so no CHECK or trigger of the table is loosened. One audit event of
-- the system (actor kind SYSTEM, no user) is written for each row changed, naming the price before and after and the rate used (m-16).
--
-- What is converted: the price of every subscription; the quote of every assessment; the amount of a request that no commitment holds yet and
-- that no approved spend decision names (the amount, the unit price, the amount of the year after) and its supplementary files. What is NOT
-- touched: a commitment, a check of the budget, an invoice and the request behind a commitment (money already counted, in the currency it
-- was counted in), the retired `payment_schedule` (a trigger refuses a new value; nothing reads it), the shares of a person in a commitment
-- (they exist only with a commitment). A row whose currency has no rate on or before today is left as it is and named in a notice: nothing
-- is guessed. Safe to run twice: a row already in dong is not selected, so nothing is converted or written a second time.
-- It stops, with nothing changed, if an organization reports in a currency other than dong: the one currency every figure here becomes.

DO $$
DECLARE
    foreign_reporting TEXT;
BEGIN
    SELECT string_agg(o."id"::text || ' (' || o."reporting_currency" || ')', ', ')
      INTO foreign_reporting
      FROM "organizations" o
     WHERE o."reporting_currency" <> 'VND';

    IF foreign_reporting IS NOT NULL THEN
        RAISE EXCEPTION 'QĐ-111an: prices are converted into dong, so the reporting currency of every organization must be VND first; found %', foreign_reporting
            USING ERRCODE = '55000';
    END IF;
END $$;

DROP TABLE IF EXISTS pg_temp."fx_latest_rate";
DROP TABLE IF EXISTS pg_temp."fx_subscription_changes";
DROP TABLE IF EXISTS pg_temp."fx_assessment_changes";
DROP TABLE IF EXISTS pg_temp."fx_request_changes";
DROP TABLE IF EXISTS pg_temp."fx_supplement_changes";

-- The rounding of ADR-0007: the nearest minor unit of dong, an exact half away from zero (`round` of a `numeric` does exactly that). The exchange
-- rate is units of dong for one unit of the currency; the minor digits of the two currencies move the decimal point.
CREATE OR REPLACE FUNCTION pg_temp.fx_to_dong(amount BIGINT, rate NUMERIC, from_minor INT, dong_minor INT) RETURNS BIGINT
LANGUAGE sql IMMUTABLE AS $$
    SELECT round(amount::numeric * rate * 10::numeric ^ GREATEST(dong_minor - from_minor, 0)
                 / 10::numeric ^ GREATEST(from_minor - dong_minor, 0))::bigint
$$;

-- The newest rate of each currency on or before today (the day this migration runs), with the minor digits of the currency.
CREATE TEMP TABLE "fx_latest_rate" AS
SELECT DISTINCT ON (e."organization_id", e."currency")
       e."organization_id", e."currency", e."rate", e."rate_date", c."minor_unit"
  FROM "exchange_rates" e
  JOIN "currencies" c ON c."code" = e."currency"
 WHERE e."rate_date" <= CURRENT_DATE
 ORDER BY e."organization_id", e."currency", e."rate_date" DESC;

-- 1. The price of a subscription.
CREATE TEMP TABLE "fx_subscription_changes" AS
SELECT s."id", s."organization_id", s."unit_price_minor" AS "old_minor", s."unit_price_currency" AS "old_currency",
       s."price_recorded_on", s."price_reporting_minor" AS "old_reporting_minor", l."rate", l."rate_date",
       pg_temp.fx_to_dong(s."unit_price_minor", l."rate", l."minor_unit", dong."minor_unit") AS "new_minor"
  FROM "subscriptions" s
  JOIN "fx_latest_rate" l ON l."organization_id" = s."organization_id" AND l."currency" = s."unit_price_currency"
  CROSS JOIN (SELECT "minor_unit" FROM "currencies" WHERE "code" = 'VND') dong
 WHERE s."unit_price_minor" IS NOT NULL AND s."unit_price_currency" <> 'VND';

INSERT INTO "audit_events" (
    "id", "organization_id", "actor_kind", "actor_app_user_id", "actor_roles", "action", "resource_type", "resource_id",
    "before", "after", "correlation_id"
)
SELECT gen_random_uuid(), c."organization_id", 'SYSTEM', NULL, '{}', 'SUBSCRIPTION.UPDATED', 'Subscription', c."id"::text,
       jsonb_build_object(
           'unitPrice', c."old_minor"::text || ' ' || c."old_currency" || ' on ' || to_char(c."price_recorded_on", 'YYYY-MM-DD'),
           'reporting', c."old_reporting_minor"::text || ' VND'
       ),
       jsonb_build_object(
           'unitPrice', c."new_minor"::text || ' VND on ' || to_char(c."price_recorded_on", 'YYYY-MM-DD'),
           'reporting', c."new_minor"::text || ' VND at 1 of ' || to_char(c."price_recorded_on", 'YYYY-MM-DD'),
           'originalPrice', c."old_minor"::text || ' ' || c."old_currency",
           'convertedAt', c."rate"::text || ' of ' || to_char(c."rate_date", 'YYYY-MM-DD'),
           'rule', 'the price is in dong (QĐ-111an); converted once at the newest rate on or before the day of the migration'
       ),
       '20261113002900_fx_prices_to_vnd'
  FROM "fx_subscription_changes" c;

UPDATE "subscriptions" s
   SET "original_unit_price_minor" = c."old_minor",
       "original_currency" = c."old_currency",
       "unit_price_minor" = c."new_minor",
       "unit_price_currency" = 'VND',
       "price_rate" = 1,
       "price_rate_date" = s."price_recorded_on",
       "price_rate_source" = 'SAME_CURRENCY',
       "price_reporting_minor" = c."new_minor",
       "price_reporting_currency" = 'VND',
       "price_exchange_rate_id" = NULL,
       "updated_at" = now()
  FROM "fx_subscription_changes" c
 WHERE s."id" = c."id";

-- 2. The quote of an assessment of software that is not in the catalog; the audit event is on its request.
CREATE TEMP TABLE "fx_assessment_changes" AS
SELECT a."request_id", r."organization_id", a."quote_unit_price_minor" AS "old_minor", a."quote_currency" AS "old_currency",
       l."rate", l."rate_date",
       pg_temp.fx_to_dong(a."quote_unit_price_minor", l."rate", l."minor_unit", dong."minor_unit") AS "new_minor"
  FROM "access_request_assessments" a
  JOIN "access_requests" r ON r."id" = a."request_id"
  JOIN "fx_latest_rate" l ON l."organization_id" = r."organization_id" AND l."currency" = a."quote_currency"
  CROSS JOIN (SELECT "minor_unit" FROM "currencies" WHERE "code" = 'VND') dong
 WHERE a."quote_unit_price_minor" IS NOT NULL AND a."quote_currency" <> 'VND';

INSERT INTO "audit_events" (
    "id", "organization_id", "actor_kind", "actor_app_user_id", "actor_roles", "action", "resource_type", "resource_id",
    "before", "after", "correlation_id"
)
SELECT gen_random_uuid(), c."organization_id", 'SYSTEM', NULL, '{}', 'ACCESS_REQUEST.REPRICED', 'ACCESS_REQUEST', c."request_id"::text,
       jsonb_build_object('requestId', c."request_id", 'source', 'ASSESSMENT_QUOTE',
                          'beforeUnitPriceMinor', c."old_minor"::text, 'beforeCurrency', c."old_currency"),
       jsonb_build_object('requestId', c."request_id", 'source', 'ASSESSMENT_QUOTE',
                          'afterUnitPriceMinor', c."new_minor"::text, 'afterCurrency', 'VND',
                          'convertedAt', c."rate"::text || ' of ' || to_char(c."rate_date", 'YYYY-MM-DD'),
                          'rule', 'the quote is in dong (QĐ-111an); converted once at the newest rate on or before the day of the migration'),
       '20261113002900_fx_prices_to_vnd'
  FROM "fx_assessment_changes" c;

UPDATE "access_request_assessments" a
   SET "quote_original_unit_price_minor" = c."old_minor",
       "quote_original_currency" = c."old_currency",
       "quote_unit_price_minor" = c."new_minor",
       "quote_currency" = 'VND',
       "updated_at" = now()
  FROM "fx_assessment_changes" c
 WHERE a."request_id" = c."request_id";

-- 3. A request whose spend is not decided: no commitment holds it and no approved spend decision names it.
CREATE TEMP TABLE "fx_request_changes" AS
SELECT r."id", r."organization_id", r."amount_currency" AS "old_currency", r."amount_minor" AS "old_amount",
       r."unit_price_minor" AS "old_unit", r."next_year_amount_minor" AS "old_next", l."rate", l."rate_date",
       pg_temp.fx_to_dong(r."amount_minor", l."rate", l."minor_unit", dong."minor_unit") AS "new_amount",
       pg_temp.fx_to_dong(r."unit_price_minor", l."rate", l."minor_unit", dong."minor_unit") AS "new_unit",
       pg_temp.fx_to_dong(r."next_year_amount_minor", l."rate", l."minor_unit", dong."minor_unit") AS "new_next"
  FROM "access_requests" r
  JOIN "fx_latest_rate" l ON l."organization_id" = r."organization_id" AND l."currency" = r."amount_currency"
  CROSS JOIN (SELECT "minor_unit" FROM "currencies" WHERE "code" = 'VND') dong
 WHERE r."amount_currency" IS NOT NULL AND r."amount_currency" <> 'VND'
   AND NOT EXISTS (SELECT 1 FROM "budget_commitments" c WHERE c."request_id" = r."id")
   AND NOT EXISTS (SELECT 1 FROM "spend_decisions" d WHERE d."request_id" = r."id" AND d."decision" = 'APPROVED');

INSERT INTO "audit_events" (
    "id", "organization_id", "actor_kind", "actor_app_user_id", "actor_roles", "action", "resource_type", "resource_id",
    "before", "after", "correlation_id"
)
SELECT gen_random_uuid(), c."organization_id", 'SYSTEM', NULL, '{}', 'ACCESS_REQUEST.REPRICED', 'ACCESS_REQUEST', c."id"::text,
       jsonb_build_object('requestId', c."id", 'source', 'REQUEST', 'trigger', 'FX_CONVERSION',
                          'beforeAmountMinor', c."old_amount"::text, 'beforeCurrency', c."old_currency",
                          'beforeUnitPriceMinor', c."old_unit"::text),
       jsonb_build_object('requestId', c."id", 'source', 'REQUEST', 'trigger', 'FX_CONVERSION',
                          'afterAmountMinor', c."new_amount"::text, 'afterCurrency', 'VND',
                          'afterUnitPriceMinor', c."new_unit"::text,
                          'convertedAt', c."rate"::text || ' of ' || to_char(c."rate_date", 'YYYY-MM-DD'),
                          'rule', 'the amount is in dong (QĐ-111an); converted once at the newest rate on or before the day of the migration'),
       '20261113002900_fx_prices_to_vnd'
  FROM "fx_request_changes" c;

UPDATE "access_requests" r
   SET "amount_minor" = c."new_amount",
       "amount_currency" = 'VND',
       "unit_price_minor" = c."new_unit",
       "next_year_amount_minor" = c."new_next",
       "updated_at" = now()
  FROM "fx_request_changes" c
 WHERE r."id" = c."id";

-- 4. The supplementary files of those requests. A file is append-only (INV-05): the trigger that refuses a change is switched off for this one
-- statement and on again, in the same transaction, so no other session ever sees it off.
CREATE TEMP TABLE "fx_supplement_changes" AS
SELECT p."id", p."organization_id", p."request_id", p."number", p."currency" AS "old_currency",
       p."before_amount_minor" AS "old_before", p."after_amount_minor" AS "old_after", l."rate", l."rate_date",
       pg_temp.fx_to_dong(p."before_amount_minor", l."rate", l."minor_unit", dong."minor_unit") AS "new_before",
       pg_temp.fx_to_dong(p."after_amount_minor", l."rate", l."minor_unit", dong."minor_unit") AS "new_after"
  FROM "request_supplements" p
  JOIN "fx_latest_rate" l ON l."organization_id" = p."organization_id" AND l."currency" = p."currency"
  CROSS JOIN (SELECT "minor_unit" FROM "currencies" WHERE "code" = 'VND') dong
 WHERE p."currency" IS NOT NULL AND p."currency" <> 'VND'
   AND NOT EXISTS (SELECT 1 FROM "budget_commitments" c WHERE c."request_id" = p."request_id")
   AND NOT EXISTS (SELECT 1 FROM "spend_decisions" d WHERE d."request_id" = p."request_id" AND d."decision" = 'APPROVED');

INSERT INTO "audit_events" (
    "id", "organization_id", "actor_kind", "actor_app_user_id", "actor_roles", "action", "resource_type", "resource_id",
    "before", "after", "correlation_id"
)
SELECT gen_random_uuid(), c."organization_id", 'SYSTEM', NULL, '{}', 'ACCESS_REQUEST.REPRICED', 'ACCESS_REQUEST', c."request_id"::text,
       jsonb_build_object('requestId', c."request_id", 'source', 'SUPPLEMENT', 'supplementNumber', c."number",
                          'beforeAmountMinor', c."old_before"::text, 'afterAmountMinor', c."old_after"::text,
                          'beforeCurrency', c."old_currency"),
       jsonb_build_object('requestId', c."request_id", 'source', 'SUPPLEMENT', 'supplementNumber', c."number",
                          'beforeAmountMinor', c."new_before"::text, 'afterAmountMinor', c."new_after"::text,
                          'afterCurrency', 'VND',
                          'convertedAt', c."rate"::text || ' of ' || to_char(c."rate_date", 'YYYY-MM-DD'),
                          'rule', 'the amounts of the file are in dong (QĐ-111an); converted once at the newest rate on or before the day of the migration'),
       '20261113002900_fx_prices_to_vnd'
  FROM "fx_supplement_changes" c;

ALTER TABLE "request_supplements" DISABLE TRIGGER "request_supplements_no_update_delete";

UPDATE "request_supplements" p
   SET "before_amount_minor" = c."new_before",
       "after_amount_minor" = c."new_after",
       "currency" = 'VND'
  FROM "fx_supplement_changes" c
 WHERE p."id" = c."id";

ALTER TABLE "request_supplements" ENABLE TRIGGER "request_supplements_no_update_delete";

-- What could not be converted for want of a rate: named, never guessed.
DO $$
DECLARE
    left_subscriptions TEXT;
    left_requests TEXT;
BEGIN
    SELECT string_agg(s."id"::text, ', ' ORDER BY s."id") INTO left_subscriptions
      FROM "subscriptions" s WHERE s."unit_price_minor" IS NOT NULL AND s."unit_price_currency" <> 'VND';
    SELECT string_agg(r."id"::text, ', ' ORDER BY r."id") INTO left_requests
      FROM "access_requests" r
     WHERE r."amount_currency" IS NOT NULL AND r."amount_currency" <> 'VND'
       AND NOT EXISTS (SELECT 1 FROM "budget_commitments" c WHERE c."request_id" = r."id")
       AND NOT EXISTS (SELECT 1 FROM "spend_decisions" d WHERE d."request_id" = r."id" AND d."decision" = 'APPROVED');

    IF left_subscriptions IS NOT NULL THEN
        RAISE NOTICE 'QĐ-111an: subscriptions priced in another currency with no exchange rate, left as they are: %', left_subscriptions;
    END IF;
    IF left_requests IS NOT NULL THEN
        RAISE NOTICE 'QĐ-111an: requests not yet decided as spend, in another currency with no exchange rate, left as they are: %', left_requests;
    END IF;
END $$;

DROP TABLE "fx_supplement_changes";
DROP TABLE "fx_request_changes";
DROP TABLE "fx_assessment_changes";
DROP TABLE "fx_subscription_changes";
DROP TABLE "fx_latest_rate";
DROP FUNCTION pg_temp.fx_to_dong(BIGINT, NUMERIC, INT, INT);
