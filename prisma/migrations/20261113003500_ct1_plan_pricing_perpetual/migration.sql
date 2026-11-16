-- CT-1.4 (QĐ-111d, QĐ-111f, B-5): the IT Admin names the kind of provisioning of a plan and the system works out how it is priced. K1 and K2 are
-- bought per seat; K4 is bought once (the pricing model has no value for that, so it has none) and its subscriptions are perpetual purchases; K5
-- has no price. An application declared in one command is `SAAS` or `INTERNAL` by its plan, never `LICENSED`, so the two rules of the database that
-- were written for "licensed software" now also stand for the K4 plan. Expand only: one CHECK replaced by a weaker one and one function replaced
-- by one that allows a kind more; every row stands as it was and nothing is dropped. Safe to run twice.

-- A K4 plan may have a pricing model (the rows made before) or none (the rows made now); K1 and K2 still name one, K3 and K5 still have none.
ALTER TABLE "plans" DROP CONSTRAINT IF EXISTS "plans_pricing_model_by_kind";
ALTER TABLE "plans" ADD CONSTRAINT "plans_pricing_model_by_kind" CHECK (
    ("provisioning_type" IN ('K1', 'K2') AND "pricing_model" IS NOT NULL)
    OR ("provisioning_type" IN ('K3', 'K5') AND "pricing_model" IS NULL)
    OR "provisioning_type" = 'K4'
);

-- A perpetual purchase belongs to licensed software or to a K4 plan; the other two rules of the function are those of migration
-- 20261020150000 as they were. The trigger itself stays.
CREATE OR REPLACE FUNCTION "subscriptions_fit_plan"() RETURNS trigger AS $$
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
    IF NEW."kind" = 'PERPETUAL' AND application_kind <> 'LICENSED' AND plan_type <> 'K4' THEN
        RAISE EXCEPTION 'A perpetual purchase belongs to licensed software or to a K4 plan'
            USING ERRCODE = '23514', CONSTRAINT = 'subscriptions_perpetual_needs_licensed';
    END IF;
    IF NEW."status" = 'ACTIVE' AND plan_pricing = 'PER_SEAT' AND NEW."purchased_quantity" IS NULL THEN
        RAISE EXCEPTION 'An active subscription of a per-seat plan has its quantity'
            USING ERRCODE = '23514', CONSTRAINT = 'subscriptions_per_seat_quantity';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
