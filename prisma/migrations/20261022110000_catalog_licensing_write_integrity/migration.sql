-- Write integrity of catalog, finance and licensing (post-merge review 22/10/2026: DB-03, DB-07, DB-08, DB-14). Each rule
-- below was kept by the application alone, or by a trigger on one table while the rows it protects are written through
-- another; the database now holds them for every writer. Nothing here changes a row; the application changes that go
-- with it are in the same release.

-- DB-03: a vendor takes its dictionary group once (LR-10 holds for the group it has). The trigger on `applications` checks
-- an application against the group of its vendor, but nothing stopped the group of the vendor from moving afterwards;
-- two adopters at once could each pass an unconditional update, the second silently replacing the first.
CREATE FUNCTION "vendors_dictionary_group_fixed"() RETURNS trigger AS $$
BEGIN
    IF OLD."dictionary_group_id" IS NOT NULL AND NEW."dictionary_group_id" IS DISTINCT FROM OLD."dictionary_group_id" THEN
        RAISE EXCEPTION 'A vendor keeps the dictionary group it took'
            USING ERRCODE = '55000', CONSTRAINT = 'vendors_dictionary_group_fixed';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "vendors_dictionary_group_fixed"
    BEFORE UPDATE OF "dictionary_group_id" ON "vendors"
    FOR EACH ROW EXECUTE FUNCTION "vendors_dictionary_group_fixed"();

-- DB-07: changing the pricing model or the provisioning type of a plan must not leave a subscription or a key invalid.
-- The writers of subscriptions and keys take the plan row FOR SHARE, which this update (it takes the row for itself)
-- waits for and which waits for it, so a child cannot slip in between the check and the change. The reason is the words
-- after `plan_change_blocked:` in the message, for the application to answer with. A cost allocation is not blocked on:
-- US-04-08 keeps the allocation declared before a plan became per-seat and reports that it no longer applies
-- (`cost-allocation-http`), so only a new declaration is refused (the application, under the same plan lock).
CREATE FUNCTION "plans_keep_children_valid"() RETURNS trigger AS $$
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

    -- A K5 plan of an internal application has no subscription (subscriptions_fit_plan).
    IF NEW."provisioning_type" IS DISTINCT FROM OLD."provisioning_type" AND NEW."provisioning_type" = 'K5'
       AND EXISTS (SELECT 1 FROM "subscriptions" s WHERE s."plan_id" = NEW."id") THEN
        RAISE EXCEPTION 'plan_change_blocked: SUBSCRIPTIONS'
            USING ERRCODE = '23514', CONSTRAINT = 'plans_change_keeps_no_subscription';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "plans_keep_children_valid"
    BEFORE UPDATE OF "pricing_model", "provisioning_type" ON "plans"
    FOR EACH ROW EXECUTE FUNCTION "plans_keep_children_valid"();

-- DB-14: the history of a tax profile and of a cost allocation grows in order. A version is the next one of its head,
-- and the head moves up by one to a version that exists; the writer does it in that order inside one transaction under
-- the lock of the head (as the standard toolset does, migration 20261021110000).
CREATE FUNCTION "vendor_tax_profile_version_guard"() RETURNS trigger AS $$
DECLARE
    "current" INTEGER;
BEGIN
    IF NEW."version" >= 1 THEN
        SELECT "current_version" INTO "current" FROM "vendor_tax_profiles" WHERE "vendor_id" = NEW."vendor_id";
        IF NEW."version" <> COALESCE("current", 0) + 1 THEN
            RAISE EXCEPTION 'A tax profile version is the next one of its vendor'
                USING ERRCODE = '55000', CONSTRAINT = 'vendor_tax_profile_version_next';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "vendor_tax_profile_versions_next"
    BEFORE INSERT ON "vendor_tax_profile_versions"
    FOR EACH ROW EXECUTE FUNCTION "vendor_tax_profile_version_guard"();

CREATE FUNCTION "vendor_tax_profile_head_guard"() RETURNS trigger AS $$
BEGIN
    IF NEW."current_version" <> OLD."current_version" THEN
        IF NEW."current_version" <> OLD."current_version" + 1
           OR NOT EXISTS (
               SELECT 1 FROM "vendor_tax_profile_versions" v
                WHERE v."vendor_id" = NEW."vendor_id" AND v."version" = NEW."current_version"
           ) THEN
            RAISE EXCEPTION 'The head of a tax profile moves up by one, to a version that exists'
                USING ERRCODE = '55000', CONSTRAINT = 'vendor_tax_profile_head_forward';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "vendor_tax_profiles_forward"
    BEFORE UPDATE ON "vendor_tax_profiles"
    FOR EACH ROW EXECUTE FUNCTION "vendor_tax_profile_head_guard"();

CREATE FUNCTION "subscription_cost_allocation_version_guard"() RETURNS trigger AS $$
DECLARE
    "current" INTEGER;
BEGIN
    IF NEW."version" >= 1 THEN
        SELECT "current_version" INTO "current" FROM "subscription_cost_allocations"
         WHERE "subscription_id" = NEW."subscription_id";
        IF NEW."version" <> COALESCE("current", 0) + 1 THEN
            RAISE EXCEPTION 'A cost allocation version is the next one of its subscription'
                USING ERRCODE = '55000', CONSTRAINT = 'subscription_cost_allocation_version_next';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "subscription_cost_allocation_versions_next"
    BEFORE INSERT ON "subscription_cost_allocation_versions"
    FOR EACH ROW EXECUTE FUNCTION "subscription_cost_allocation_version_guard"();

CREATE FUNCTION "subscription_cost_allocation_head_guard"() RETURNS trigger AS $$
BEGIN
    IF NEW."current_version" <> OLD."current_version" THEN
        IF NEW."current_version" <> OLD."current_version" + 1
           OR NOT EXISTS (
               SELECT 1 FROM "subscription_cost_allocation_versions" v
                WHERE v."subscription_id" = NEW."subscription_id" AND v."version" = NEW."current_version"
           ) THEN
            RAISE EXCEPTION 'The head of a cost allocation moves up by one, to a version that exists'
                USING ERRCODE = '55000', CONSTRAINT = 'subscription_cost_allocation_head_forward';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "subscription_cost_allocations_forward"
    BEFORE UPDATE ON "subscription_cost_allocations"
    FOR EACH ROW EXECUTE FUNCTION "subscription_cost_allocation_head_guard"();

-- DB-08: INV-01 counts the assignments of a subscription after it has locked the row of the subscription. That is right
-- only when the count reads what the lock waited for, which a READ COMMITTED statement does and a REPEATABLE READ or
-- SERIALIZABLE transaction does not (its snapshot predates the wait). The function is the same as in migration
-- 20261020190100 but for the first check: every writer of assignments runs READ COMMITTED, and any other is refused
-- instead of counting a stale picture. Reducing the number of seats below the seats taken stays the application's check
-- (`assertQuantityNotBelowOccupied`), under the same row lock; the database holds the bound only where seats are added.
CREATE OR REPLACE FUNCTION "license_assignment_check_capacity"() RETURNS trigger AS $$
DECLARE
    seats INTEGER;
    peak BIGINT;
BEGIN
    IF current_setting('transaction_isolation') <> 'read committed' THEN
        RAISE EXCEPTION 'The seats of a subscription are counted under READ COMMITTED only'
            USING ERRCODE = '55000', CONSTRAINT = 'license_assignments_capacity_isolation';
    END IF;

    SELECT s."purchased_quantity" INTO seats FROM "subscriptions" s WHERE s."id" = NEW."subscription_id" FOR UPDATE;
    IF seats IS NULL THEN
        RAISE EXCEPTION 'The number of seats of the subscription is not known'
            USING ERRCODE = '23514', CONSTRAINT = 'license_assignments_seat_capacity';
    END IF;

    SELECT COALESCE(MAX(per_day."occupied"), 0) INTO peak FROM (
        SELECT (
            SELECT count(*) FROM "license_assignments" b
             WHERE b."subscription_id" = NEW."subscription_id"
               AND b."valid_from" <= d."day"
               AND (b."valid_until" IS NULL OR d."day" < b."valid_until")
        ) AS "occupied"
        FROM (
            SELECT NEW."valid_from" AS "day"
            UNION
            SELECT a."valid_from"
              FROM "license_assignments" a
             WHERE a."subscription_id" = NEW."subscription_id"
               AND a."valid_from" > NEW."valid_from"
               AND (NEW."valid_until" IS NULL OR a."valid_from" < NEW."valid_until")
        ) d
    ) per_day;

    IF peak > seats THEN
        RAISE EXCEPTION 'The seats of the subscription are all taken: % assignments for % seats', peak, seats
            USING ERRCODE = '23514', CONSTRAINT = 'license_assignments_seat_capacity';
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;
