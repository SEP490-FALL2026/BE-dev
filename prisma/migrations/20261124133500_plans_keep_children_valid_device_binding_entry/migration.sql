-- Entering K4 bound to an account (NULL -> 'ACCOUNT') preserves the account-bound semantics of K1/K2/K5, so existing
-- perpetual purchases or person assignments do not block it; entering K4 bound to a machine ('DEVICE_KEY' / 'DEVICE_BUNDLED')
-- is blocked when perpetual purchases or person assignments already exist.
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

    -- A subscription that rests on a contract is of a shared stock (K2 or K4, QĐ-111t): the plan cannot leave K2 and K4 under the link. The rule is
    -- judged when a subscription is linked and never again, so without this the link of a subscription of a plan that became K1 or K3 would stay.
    IF NEW."provisioning_type" IS DISTINCT FROM OLD."provisioning_type" AND NEW."provisioning_type" NOT IN ('K2', 'K4')
       AND EXISTS (
           SELECT 1
             FROM "contract_subscriptions" l
             JOIN "subscriptions" s ON s."id" = l."subscription_id"
            WHERE s."plan_id" = NEW."id"
       ) THEN
        RAISE EXCEPTION 'plan_change_blocked: CONTRACT_LINKS'
            USING ERRCODE = '23514', CONSTRAINT = 'plans_change_keeps_contract_links';
    END IF;

    -- The binding of a K4 plan cannot move while something rests on it: a perpetual purchase, an assignment of a person, an activation of a machine.
    IF NEW."key_binding" IS DISTINCT FROM OLD."key_binding" THEN
        IF NEW."key_binding" IS NOT NULL AND NEW."key_binding" IS DISTINCT FROM COALESCE(OLD."key_binding", 'ACCOUNT') THEN
            IF EXISTS (SELECT 1 FROM "subscriptions" s WHERE s."plan_id" = NEW."id" AND s."kind" = 'PERPETUAL') THEN
                RAISE EXCEPTION 'plan_change_blocked: KEY_BINDING_PURCHASES'
                    USING ERRCODE = '23514', CONSTRAINT = 'plans_change_keeps_key_binding';
            END IF;
            IF EXISTS (SELECT 1 FROM "license_assignments" a WHERE a."plan_id" = NEW."id") THEN
                RAISE EXCEPTION 'plan_change_blocked: KEY_BINDING_ASSIGNMENTS'
                    USING ERRCODE = '23514', CONSTRAINT = 'plans_change_keeps_key_binding_assignments';
            END IF;
        END IF;
        IF EXISTS (SELECT 1 FROM "device_activations" d WHERE d."plan_id" = NEW."id") THEN
            RAISE EXCEPTION 'plan_change_blocked: DEVICE_ACTIVATIONS'
                USING ERRCODE = '23514', CONSTRAINT = 'plans_change_keeps_device_activations';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
