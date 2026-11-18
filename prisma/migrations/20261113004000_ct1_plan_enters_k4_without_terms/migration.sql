-- CT-1 review round 2 (C-R1, QĐ-111f, B-5, DB-07): a K4 plan is bought once, so only a perpetual purchase is written for it (`assertPoolTerms`,
-- 422 SUBSCRIPTION.K4_PERPETUAL_ONLY for a new term). Migration 20261113003800 keeps what hangs on a plan when it LEAVES K4; nothing kept the way IN:
-- a plan of seats (K1, K2) with a subscription over a term could be changed to K4, leaving a term subscription on a plan bought once, which can then
-- neither be renewed (every next period is refused as a term for K4) nor be changed in its terms. The plan keeps what hangs on it on the way in too:
-- it cannot enter K4 while a subscription over a term exists, whatever its status (an ended or a draft one counts, which is the plain and safe rule).
-- Expand only: one function replaced by one that refuses a case more (the other four are those of migration 20261113003800 as they were); no row
-- changes and nothing is dropped. Safe to run twice. The reason is the words after `plan_change_blocked:`, which the application answers with.
CREATE OR REPLACE FUNCTION "plans_keep_children_valid"() RETURNS trigger AS $$
BEGIN
    -- An active subscription of a per-seat plan has its quantity (subscriptions_fit_plan).
    IF NEW."pricing_model" IS DISTINCT FROM OLD."pricing_model" AND NEW."pricing_model" = 'PER_SEAT'
       AND EXISTS (
           SELECT 1 FROM "subscriptions" s
            WHERE s."plan_id" = NEW."id" AND s."status" = 'ACTIVE' AND s."purchased_quantity" IS NULL
       ) THEN
        RAISE EXCEPTION 'plan_change_blocked: ACTIVE_SUBSCRIPTION_WITHOUT_QUANTITY'
            USING ERRCODE = '23514', CONSTRAINT = 'plans_change_keeps_active_quantity';
    END IF;

    -- The keys kept for a K4 purchase belong to K4 (US-04-07).
    IF NEW."provisioning_type" IS DISTINCT FROM OLD."provisioning_type" AND OLD."provisioning_type" = 'K4'
       AND EXISTS (
           SELECT 1
             FROM "license_keys" k
             JOIN "subscriptions" s ON s."id" = k."subscription_id"
            WHERE s."plan_id" = NEW."id"
       ) THEN
        RAISE EXCEPTION 'plan_change_blocked: LICENSE_KEYS'
            USING ERRCODE = '23514', CONSTRAINT = 'plans_change_keeps_license_keys';
    END IF;

    -- A perpetual purchase of an application that is not licensed belongs to the K4 plan (subscriptions_fit_plan): the plan cannot stop being K4 under it.
    IF NEW."provisioning_type" IS DISTINCT FROM OLD."provisioning_type" AND OLD."provisioning_type" = 'K4'
       AND EXISTS (SELECT 1 FROM "applications" a WHERE a."id" = NEW."application_id" AND a."kind" <> 'LICENSED')
       AND EXISTS (SELECT 1 FROM "subscriptions" s WHERE s."plan_id" = NEW."id" AND s."kind" = 'PERPETUAL') THEN
        RAISE EXCEPTION 'plan_change_blocked: PERPETUAL_SUBSCRIPTIONS'
            USING ERRCODE = '23514', CONSTRAINT = 'plans_change_keeps_perpetual';
    END IF;

    -- A plan bought once (K4) has no subscription over a term (B-5): a plan of seats cannot enter K4 with one hanging on it.
    IF NEW."provisioning_type" IS DISTINCT FROM OLD."provisioning_type" AND NEW."provisioning_type" = 'K4'
       AND EXISTS (SELECT 1 FROM "subscriptions" s WHERE s."plan_id" = NEW."id" AND s."kind" = 'TERM') THEN
        RAISE EXCEPTION 'plan_change_blocked: TERM_SUBSCRIPTIONS'
            USING ERRCODE = '23514', CONSTRAINT = 'plans_change_keeps_terms';
    END IF;

    -- A K5 plan of an internal application has no subscription (subscriptions_fit_plan).
    IF NEW."provisioning_type" IS DISTINCT FROM OLD."provisioning_type" AND NEW."provisioning_type" = 'K5'
       AND EXISTS (SELECT 1 FROM "subscriptions" s WHERE s."plan_id" = NEW."id") THEN
        RAISE EXCEPTION 'plan_change_blocked: SUBSCRIPTIONS'
            USING ERRCODE = '23514', CONSTRAINT = 'plans_change_keeps_no_subscription';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
