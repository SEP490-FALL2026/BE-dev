-- Currencies and manually entered exchange rates (g3-money-and-exchange-rates, US-04-05, ADR-0007).
-- `currencies` is reference data seeded here; adding a currency is a later migration. A rate is the number of units of
-- the organization's reporting currency for one unit of `currency`.

-- CreateEnum
CREATE TYPE "ExchangeRateSource" AS ENUM ('MANUAL');

-- CreateTable
CREATE TABLE "currencies" (
    "code" CHAR(3) NOT NULL,
    "name" TEXT NOT NULL,
    "minor_unit" SMALLINT NOT NULL,

    CONSTRAINT "currencies_pkey" PRIMARY KEY ("code"),
    CONSTRAINT "currencies_code_shape" CHECK ("code" ~ '^[A-Z]{3}$'),
    CONSTRAINT "currencies_minor_unit_range" CHECK ("minor_unit" BETWEEN 0 AND 4)
);

INSERT INTO "currencies" ("code", "name", "minor_unit") VALUES
    ('AUD', 'Australian dollar', 2),
    ('CAD', 'Canadian dollar', 2),
    ('CNY', 'Chinese yuan', 2),
    ('EUR', 'Euro', 2),
    ('GBP', 'Pound sterling', 2),
    ('JPY', 'Japanese yen', 0),
    ('KRW', 'South Korean won', 0),
    ('SGD', 'Singapore dollar', 2),
    ('THB', 'Thai baht', 2),
    ('USD', 'United States dollar', 2),
    ('VND', 'Vietnamese dong', 0);

-- CreateTable
CREATE TABLE "exchange_rates" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "rate_date" DATE NOT NULL,
    "rate" NUMERIC(20,10) NOT NULL,
    "source" "ExchangeRateSource" NOT NULL DEFAULT 'MANUAL',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exchange_rates_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "exchange_rates_rate_range" CHECK ("rate" > 0 AND "rate" < 10000000000)
);

-- CreateIndex
CREATE UNIQUE INDEX "exchange_rates_organization_id_currency_rate_date_key"
    ON "exchange_rates"("organization_id", "currency", "rate_date");

-- AddForeignKey
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_currency_fkey"
    FOREIGN KEY ("currency") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A rate for the reporting currency itself is meaningless (the conversion is always 1, SAME_CURRENCY): refuse it in the
-- database too, so no other writer can store one (T-M6).
CREATE FUNCTION "exchange_rates_reject_reporting_currency"() RETURNS trigger AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM "organizations" o WHERE o."id" = NEW."organization_id" AND o."reporting_currency" = NEW."currency"
    ) THEN
        RAISE EXCEPTION 'A rate for the reporting currency % is not stored', NEW."currency"
            USING ERRCODE = '23514', CONSTRAINT = 'exchange_rates_not_reporting_currency';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "exchange_rates_not_reporting_currency"
    BEFORE INSERT OR UPDATE OF "currency", "organization_id" ON "exchange_rates"
    FOR EACH ROW EXECUTE FUNCTION "exchange_rates_reject_reporting_currency"();
