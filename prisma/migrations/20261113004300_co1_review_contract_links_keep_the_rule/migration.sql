-- CO-1 review (QĐ-111t, US-04-13 AC-7): the rule that only a subscription of a shared stock (K2 or K4) of the vendor of the contract rests on a contract
-- was judged when the link was made (the application, and the trigger `contract_subscription_check` of migration 20261113004200, which ran on INSERT
-- only). Two ways round it are closed. (1) A plan could leave K2 and K4 under a link: `plans_keep_children_valid` kept K4 in and out, K5 and the
-- quantity, so a K2 plan could become K1 (both per seat) or K3 and its subscription stayed on a contract; the function is replaced by the one of
-- migration 20261113004000 with a case more: a plan that leaves K2 and K4 while a subscription of it rests on a contract is refused (the reason the
-- application answers with is the word after `plan_change_blocked:`). (2) A link could be pointed at another subscription or contract by an UPDATE, which
-- the INSERT-only trigger never saw: it now runs on an UPDATE of `contract_id` or `subscription_id` too (the function reads the new row only).
-- Expand only: one function replaced, one trigger replaced by itself on more events; no row changes and nothing is dropped. Safe to run twice.
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

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "contract_subscriptions_check" ON "contract_subscriptions";
CREATE TRIGGER "contract_subscriptions_check"
    BEFORE INSERT OR UPDATE OF "contract_id", "subscription_id" ON "contract_subscriptions"
    FOR EACH ROW EXECUTE FUNCTION "contract_subscription_check"();
