-- QĐ-111an, R-4, S-1 (FX-1.1, expand): a price is entered in dong, and the price a vendor quoted in another currency is kept beside it as a
-- structured value (the amount in the minor units of its own currency and the currency), so that an invoice can be matched against it (R-44).
-- Two columns for a subscription and two for the quote of an assessment of software that is not in the catalog; each pair is whole or absent.
-- Nothing is read or dropped here: `20261113002900_fx_prices_to_vnd` turns the prices already held in another currency into dong.

ALTER TABLE "subscriptions"
    ADD COLUMN "original_unit_price_minor" BIGINT,
    ADD COLUMN "original_currency" CHAR(3);

ALTER TABLE "subscriptions"
    ADD CONSTRAINT "subscriptions_original_price_whole" CHECK (
        ("original_unit_price_minor" IS NULL) = ("original_currency" IS NULL)
        AND ("original_unit_price_minor" IS NULL OR "original_unit_price_minor" BETWEEN 0 AND 1000000000000000)
    );

ALTER TABLE "subscriptions"
    ADD CONSTRAINT "subscriptions_original_currency_fkey"
    FOREIGN KEY ("original_currency") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "access_request_assessments"
    ADD COLUMN "quote_original_unit_price_minor" BIGINT,
    ADD COLUMN "quote_original_currency" CHAR(3);

ALTER TABLE "access_request_assessments"
    ADD CONSTRAINT "access_request_assessments_quote_original_whole" CHECK (
        ("quote_original_unit_price_minor" IS NULL) = ("quote_original_currency" IS NULL)
        AND ("quote_original_unit_price_minor" IS NULL OR "quote_original_unit_price_minor" BETWEEN 0 AND 1000000000000000)
    );

ALTER TABLE "access_request_assessments"
    ADD CONSTRAINT "access_request_assessments_quote_original_currency_fkey"
    FOREIGN KEY ("quote_original_currency") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
