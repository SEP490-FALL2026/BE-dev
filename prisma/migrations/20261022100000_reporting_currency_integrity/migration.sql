-- The reporting currency of the organization (US-01-04 AC-9, QĐ-42c) kept whole under concurrency and known to the system
-- (post-merge review 22/10/2026, DB-01 and DB-02).
--
-- DB-01: the lock trigger of `organizations` looks for rates and converted prices, and the writers of those look at the
-- reporting currency, each without locking what the other reads. Under READ COMMITTED a change and a write can both pass
-- their check and both commit (write skew), leaving a rate or a price frozen in a currency that is no longer the reporting
-- one. Every writer now reads the organization row FOR SHARE, which conflicts with the update of the currency: whichever
-- transaction comes second waits for the first, then sees what it committed and is refused by the rule.
--
-- DB-02: the currency must be one of `currencies`, so that a conversion never meets a reporting currency it has no minor
-- unit for. The inventory runs first and stops with instructions instead of an obscure foreign key failure.

-- Inventory: read only.
DO $$
DECLARE
    unknown_currencies TEXT;
BEGIN
    SELECT string_agg(DISTINCT o."reporting_currency", ', ')
      INTO unknown_currencies
      FROM "organizations" o
     WHERE NOT EXISTS (SELECT 1 FROM "currencies" c WHERE c."code" = o."reporting_currency");

    IF unknown_currencies IS NOT NULL THEN
        RAISE EXCEPTION 'The reporting currency % is not in the currencies table. Add it to currencies (code, name, minor_unit) or change the reporting currency to a listed code, then run this migration again.', unknown_currencies
            USING ERRCODE = '23503';
    END IF;
END
$$;

-- The column takes the type of the key it will reference. A trigger defined on the column blocks the change, so it is
-- dropped and created again exactly as before (migration 20261020100500).
DROP TRIGGER "organizations_reporting_currency_locked" ON "organizations";
ALTER TABLE "organizations" ALTER COLUMN "reporting_currency" TYPE CHAR(3);
CREATE TRIGGER "organizations_reporting_currency_locked"
    BEFORE UPDATE OF "reporting_currency" ON "organizations"
    FOR EACH ROW EXECUTE FUNCTION "organizations_reject_reporting_currency_change"();

ALTER TABLE "organizations" ADD CONSTRAINT "organizations_reporting_currency_fkey"
    FOREIGN KEY ("reporting_currency") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A rate is entered only after the organization row is held FOR SHARE until the rate commits, so a change of the reporting
-- currency waits for it, and a rate that comes after a change reads the new currency.
CREATE OR REPLACE FUNCTION "exchange_rates_reject_reporting_currency"() RETURNS trigger AS $$
DECLARE
    current_currency CHAR(3);
BEGIN
    SELECT o."reporting_currency" INTO current_currency
      FROM "organizations" o WHERE o."id" = NEW."organization_id"
       FOR SHARE;

    IF current_currency = NEW."currency" THEN
        RAISE EXCEPTION 'A rate for the reporting currency % is not stored', NEW."currency"
            USING ERRCODE = '23514', CONSTRAINT = 'exchange_rates_not_reporting_currency';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- A converted price is frozen into the reporting currency of the moment, and that currency is then locked (migration
-- 20261020200000); so a price may only be written in the reporting currency as it is now, and holds the same share.
CREATE FUNCTION "subscriptions_require_reporting_currency_price"() RETURNS trigger AS $$
DECLARE
    current_currency CHAR(3);
BEGIN
    IF NEW."price_reporting_currency" IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT o."reporting_currency" INTO current_currency
      FROM "organizations" o WHERE o."id" = NEW."organization_id"
       FOR SHARE;

    IF NEW."price_reporting_currency" IS DISTINCT FROM current_currency THEN
        RAISE EXCEPTION 'A converted price is in the reporting currency %, not %', current_currency, NEW."price_reporting_currency"
            USING ERRCODE = '23514', CONSTRAINT = 'subscriptions_price_in_reporting_currency';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "subscriptions_price_in_reporting_currency"
    BEFORE INSERT OR UPDATE OF "price_reporting_currency", "organization_id" ON "subscriptions"
    FOR EACH ROW EXECUTE FUNCTION "subscriptions_require_reporting_currency_price"();
