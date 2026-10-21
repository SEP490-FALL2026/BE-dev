-- Subscriptions and perpetual purchases of a plan (g3-subscription-purchase, US-04-03, US-04-05). The unit price keeps
-- the conversion snapshot taken when it was recorded: whole minor units and a NUMERIC rate, never a float (ADR-0007).
-- A subscription is DRAFT until its data is complete; the notice deadline, its source and the alert dates are derived
-- on read from what is stored here, so they cannot disagree with it.

-- CreateEnum
CREATE TYPE "SubscriptionKind" AS ENUM ('TERM', 'PERPETUAL');
CREATE TYPE "SubscriptionStatus" AS ENUM ('DRAFT', 'ACTIVE');
CREATE TYPE "BillingCycle" AS ENUM ('MONTHLY', 'QUARTERLY', 'ANNUAL', 'OTHER');
CREATE TYPE "PriceRateSource" AS ENUM ('MANUAL', 'SAME_CURRENCY');

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "kind" "SubscriptionKind" NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'DRAFT',
    "purchased_quantity" INTEGER,
    "unit_price_minor" BIGINT,
    "unit_price_currency" CHAR(3),
    "price_recorded_on" DATE,
    "price_rate" NUMERIC(20,10),
    "price_rate_date" DATE,
    "price_rate_source" "PriceRateSource",
    "price_reporting_minor" BIGINT,
    "price_reporting_currency" CHAR(3),
    "price_exchange_rate_id" UUID,
    "billing_cycle" "BillingCycle",
    "start_date" DATE,
    "end_date" DATE,
    "renewal_date" DATE,
    "notice_deadline" DATE,
    "notice_period_days" INTEGER,
    "auto_renew" BOOLEAN NOT NULL DEFAULT false,
    "allows_mid_term_reduction" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "subscriptions_quantity_range" CHECK ("purchased_quantity" IS NULL OR "purchased_quantity" BETWEEN 0 AND 1000000000),
    CONSTRAINT "subscriptions_notice_period_range" CHECK ("notice_period_days" IS NULL OR "notice_period_days" BETWEEN 0 AND 3650),
    -- The price is whole or absent (INV-04): amount, currency and the day it was recorded go together.
    CONSTRAINT "subscriptions_price_whole" CHECK (
        ("unit_price_minor" IS NULL) = ("unit_price_currency" IS NULL)
        AND ("unit_price_minor" IS NULL) = ("price_recorded_on" IS NULL)
    ),
    CONSTRAINT "subscriptions_price_range" CHECK ("unit_price_minor" IS NULL OR "unit_price_minor" BETWEEN 0 AND 1000000000000000),
    -- The snapshot is whole or absent, and exists only for a price. A rate the day was missing leaves it absent: no
    -- provisional converted value (US-04-05 AC-5).
    CONSTRAINT "subscriptions_snapshot_whole" CHECK (
        ("price_rate" IS NULL) = ("price_rate_date" IS NULL)
        AND ("price_rate" IS NULL) = ("price_rate_source" IS NULL)
        AND ("price_rate" IS NULL) = ("price_reporting_minor" IS NULL)
        AND ("price_rate" IS NULL) = ("price_reporting_currency" IS NULL)
        AND ("price_rate" IS NULL OR "unit_price_minor" IS NOT NULL)
    ),
    CONSTRAINT "subscriptions_reporting_range" CHECK (
        "price_reporting_minor" IS NULL OR "price_reporting_minor" BETWEEN 0 AND 1000000000000000000
    ),
    CONSTRAINT "subscriptions_dates_in_order" CHECK (
        ("start_date" IS NULL OR "end_date" IS NULL OR "start_date" <= "end_date")
        AND ("end_date" IS NULL OR "renewal_date" IS NULL OR "renewal_date" <= "end_date" + 1)
        AND ("renewal_date" IS NULL OR "notice_deadline" IS NULL OR "notice_deadline" <= "renewal_date")
    ),
    -- A perpetual purchase has no term at all (QĐ-49c).
    CONSTRAINT "subscriptions_perpetual_no_term" CHECK (
        "kind" <> 'PERPETUAL' OR (
            "end_date" IS NULL AND "renewal_date" IS NULL AND "notice_deadline" IS NULL AND "notice_period_days" IS NULL
            AND "billing_cycle" IS NULL AND NOT "auto_renew" AND NOT "allows_mid_term_reduction"
        )
    ),
    -- It is active only with its data complete; the quantity a per-seat plan needs is checked by the trigger below.
    CONSTRAINT "subscriptions_active_complete" CHECK (
        "status" <> 'ACTIVE' OR (
            "start_date" IS NOT NULL AND "unit_price_minor" IS NOT NULL AND "price_rate" IS NOT NULL
            AND ("kind" = 'PERPETUAL' OR "billing_cycle" IS NOT NULL)
            AND ("kind" <> 'PERPETUAL' OR "purchased_quantity" IS NOT NULL)
        )
    )
);

-- CreateIndex
CREATE INDEX "subscriptions_plan_id_idx" ON "subscriptions"("plan_id");

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_fkey"
    FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_unit_price_currency_fkey"
    FOREIGN KEY ("unit_price_currency") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_price_exchange_rate_id_fkey"
    FOREIGN KEY ("price_exchange_rate_id") REFERENCES "exchange_rates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- What the plan decides: an internal application (a K5 plan) has no subscription; a perpetual purchase belongs to licensed
-- software; an active subscription of a per-seat plan has its quantity. An unknown plan is left to the foreign key.
CREATE FUNCTION "subscriptions_fit_plan"() RETURNS trigger AS $$
DECLARE
    plan_type "ProvisioningType";
    plan_pricing "PricingModel";
    application_kind "ApplicationKind";
BEGIN
    SELECT p."provisioning_type", p."pricing_model", a."kind"
      INTO plan_type, plan_pricing, application_kind
      FROM "plans" p JOIN "applications" a ON a."id" = p."application_id"
     WHERE p."id" = NEW."plan_id";
    IF NOT FOUND THEN
        RETURN NEW;
    END IF;

    IF plan_type = 'K5' THEN
        RAISE EXCEPTION 'A K5 plan of an internal application has no subscription'
            USING ERRCODE = '23514', CONSTRAINT = 'subscriptions_plan_has_no_subscription';
    END IF;
    IF NEW."kind" = 'PERPETUAL' AND application_kind <> 'LICENSED' THEN
        RAISE EXCEPTION 'A perpetual purchase belongs to licensed software'
            USING ERRCODE = '23514', CONSTRAINT = 'subscriptions_perpetual_needs_licensed';
    END IF;
    IF NEW."status" = 'ACTIVE' AND plan_pricing = 'PER_SEAT' AND NEW."purchased_quantity" IS NULL THEN
        RAISE EXCEPTION 'An active subscription of a per-seat plan has its quantity'
            USING ERRCODE = '23514', CONSTRAINT = 'subscriptions_per_seat_quantity';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "subscriptions_fit_plan"
    BEFORE INSERT OR UPDATE OF "plan_id", "kind", "status", "purchased_quantity" ON "subscriptions"
    FOR EACH ROW EXECUTE FUNCTION "subscriptions_fit_plan"();
