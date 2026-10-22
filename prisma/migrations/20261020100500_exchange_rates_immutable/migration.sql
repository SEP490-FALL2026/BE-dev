-- A recorded exchange rate is history (g3-money-and-exchange-rates, OQ-M-01): frozen snapshots point at it, so no writer
-- may change or delete it, and the reporting currency may not change while rates exist in the old one (a rate row stores
-- the currency it converts from, and the reporting currency is read from the organization).

CREATE FUNCTION "exchange_rates_reject_change"() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'A recorded exchange rate is never changed or deleted'
        USING ERRCODE = '55000', CONSTRAINT = 'exchange_rates_immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "exchange_rates_immutable"
    BEFORE UPDATE OR DELETE ON "exchange_rates"
    FOR EACH ROW EXECUTE FUNCTION "exchange_rates_reject_change"();

CREATE FUNCTION "organizations_reject_reporting_currency_change"() RETURNS trigger AS $$
BEGIN
    IF NEW."reporting_currency" IS DISTINCT FROM OLD."reporting_currency"
       AND EXISTS (SELECT 1 FROM "exchange_rates" r WHERE r."organization_id" = OLD."id") THEN
        RAISE EXCEPTION 'The reporting currency cannot change while exchange rates are recorded'
            USING ERRCODE = '55000', CONSTRAINT = 'organizations_reporting_currency_locked';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "organizations_reporting_currency_locked"
    BEFORE UPDATE OF "reporting_currency" ON "organizations"
    FOR EACH ROW EXECUTE FUNCTION "organizations_reject_reporting_currency_change"();
