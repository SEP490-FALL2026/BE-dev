-- G-6 & G-11 (W3 Final 2):
--   1. G-6: Allow `it_admin_handovers` rows when a departing/transferring IT Admin answers only for workspaces or license lots (`subscriptions_at_record + applications_at_record = 0`).
--   2. G-11: Allow multi-line K2 `license_assignments` whose `plan_id` matches a live or declared `subscription_lines` row of `NEW.subscription_id`.
--
-- Pre-check SELECTs before applying on any existing database:
--   SELECT COUNT(*) AS zero_count_handovers FROM "it_admin_handovers" WHERE "subscriptions_at_record" + "applications_at_record" = 0;
--   SELECT COUNT(*) AS multiline_assignments FROM "license_assignments" a
--     JOIN "subscriptions" s ON s."id" = a."subscription_id"
--     WHERE a."subscription_id" IS NOT NULL AND s."plan_id" <> a."plan_id";
--
-- Reversal (only safe if zero rows have subscriptions_at_record + applications_at_record = 0 and no multi-line assignments exist):
--   ALTER TABLE "it_admin_handovers" DROP CONSTRAINT "it_admin_handovers_counts";
--   ALTER TABLE "it_admin_handovers" ADD CONSTRAINT "it_admin_handovers_counts" CHECK (
--       "subscriptions_at_record" >= 0 AND "applications_at_record" >= 0
--       AND "subscriptions_at_record" + "applications_at_record" > 0
--   );
--   CREATE OR REPLACE FUNCTION "license_assignment_check_rules"() RETURNS trigger AS $$
--   DECLARE
--       employment "EmploymentType";
--   BEGIN
--       IF TG_OP = 'INSERT' THEN
--           IF NEW."subscription_id" IS NOT NULL AND NOT EXISTS (
--               SELECT 1 FROM "subscriptions" s WHERE s."id" = NEW."subscription_id" AND s."plan_id" = NEW."plan_id"
--           ) THEN
--               RAISE EXCEPTION 'The subscription of an assignment belongs to the plan the assignment names'
--                   USING ERRCODE = '23514', CONSTRAINT = 'license_assignments_subscription_of_plan';
--           END IF;
--           IF NEW."source" = 'BASELINE' AND EXISTS (
--               SELECT 1 FROM "seat_baseline_states" b
--                WHERE b."organization_id" = NEW."organization_id" AND b."closed_at" IS NOT NULL
--           ) THEN
--               RAISE EXCEPTION 'The seat baseline is closed: an assignment without a request is no longer taken'
--                   USING ERRCODE = '55000', CONSTRAINT = 'license_assignments_baseline_closed';
--           END IF;
--       END IF;
--       IF TG_OP = 'INSERT'
--          OR NEW."expected_end_date" IS DISTINCT FROM OLD."expected_end_date"
--          OR NEW."employee_id" IS DISTINCT FROM OLD."employee_id" THEN
--           IF NEW."expected_end_date" IS NULL THEN
--               SELECT e."employment_type" INTO employment FROM "employees" e WHERE e."id" = NEW."employee_id" FOR SHARE;
--               IF employment IN ('CONTRACTOR', 'FREELANCER', 'INTERN') THEN
--                   RAISE EXCEPTION 'A contractor, freelancer or intern needs an expected end date'
--                       USING ERRCODE = '23514', CONSTRAINT = 'license_assignments_expected_end_required';
--               END IF;
--           END IF;
--       END IF;
--       RETURN NEW;
--   END;
--   $$ LANGUAGE plpgsql;

ALTER TABLE "it_admin_handovers" DROP CONSTRAINT "it_admin_handovers_counts";
ALTER TABLE "it_admin_handovers" ADD CONSTRAINT "it_admin_handovers_counts" CHECK (
    "subscriptions_at_record" >= 0 AND "applications_at_record" >= 0
);

CREATE OR REPLACE FUNCTION "license_assignment_check_rules"() RETURNS trigger AS $$
DECLARE
    employment "EmploymentType";
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW."subscription_id" IS NOT NULL
           AND NOT EXISTS (
               SELECT 1 FROM "subscriptions" s WHERE s."id" = NEW."subscription_id" AND s."plan_id" = NEW."plan_id"
           )
           AND NOT EXISTS (
               SELECT 1 FROM "subscription_lines" sl WHERE sl."subscription_id" = NEW."subscription_id" AND sl."plan_id" = NEW."plan_id"
           ) THEN
            RAISE EXCEPTION 'The subscription of an assignment belongs to the plan the assignment names'
                USING ERRCODE = '23514', CONSTRAINT = 'license_assignments_subscription_of_plan';
        END IF;

        IF NEW."source" = 'BASELINE' AND EXISTS (
            SELECT 1 FROM "seat_baseline_states" b
             WHERE b."organization_id" = NEW."organization_id" AND b."closed_at" IS NOT NULL
        ) THEN
            RAISE EXCEPTION 'The seat baseline is closed: an assignment without a request is no longer taken'
                USING ERRCODE = '55000', CONSTRAINT = 'license_assignments_baseline_closed';
        END IF;
    END IF;

    IF TG_OP = 'INSERT'
       OR NEW."expected_end_date" IS DISTINCT FROM OLD."expected_end_date"
       OR NEW."employee_id" IS DISTINCT FROM OLD."employee_id" THEN
        IF NEW."expected_end_date" IS NULL THEN
            SELECT e."employment_type" INTO employment FROM "employees" e WHERE e."id" = NEW."employee_id" FOR SHARE;
            IF employment IN ('CONTRACTOR', 'FREELANCER', 'INTERN') THEN
                RAISE EXCEPTION 'A contractor, freelancer or intern needs an expected end date'
                    USING ERRCODE = '23514', CONSTRAINT = 'license_assignments_expected_end_required';
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
