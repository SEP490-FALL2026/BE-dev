-- US-01-04 AC-9 (QĐ-42c): the reporting currency is free to change until a rate has been entered or a subscription has
-- a price converted into it, even a price in the reporting currency itself; from then on it is locked, because those
-- values are frozen in the currency they were converted into and are never computed again. The lock of g3-money-and-
-- exchange-rates covered the rates; this adds the converted prices of subscriptions.

CREATE OR REPLACE FUNCTION "organizations_reject_reporting_currency_change"() RETURNS trigger AS $$
BEGIN
    IF NEW."reporting_currency" IS DISTINCT FROM OLD."reporting_currency" THEN
        IF EXISTS (SELECT 1 FROM "exchange_rates" r WHERE r."organization_id" = OLD."id") THEN
            RAISE EXCEPTION 'The reporting currency cannot change while exchange rates are recorded'
                USING ERRCODE = '55000', CONSTRAINT = 'organizations_reporting_currency_locked';
        END IF;

        IF EXISTS (
            SELECT 1 FROM "subscriptions" s
             WHERE s."organization_id" = OLD."id" AND s."price_reporting_currency" IS NOT NULL
        ) THEN
            RAISE EXCEPTION 'The reporting currency cannot change while converted prices are recorded'
                USING ERRCODE = '55000', CONSTRAINT = 'organizations_reporting_currency_locked';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
