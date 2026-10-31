-- P28-04 (Prompt 29, 23/10/2026): INV-07 — a contractor, freelancer or intern holds every seat with an expected end
-- date — held from both sides. Migration 20261020190100 checks it when an assignment is written; a change of a person's
-- kind of staff (US-02-02 AC-19, PATCH /employees/{id}) was not checked, so a STAFF person holding an open seat without
-- an expected end could become a CONTRACTOR. Now:
--   * changing employment_type to CONTRACTOR, FREELANCER or INTERN is refused while the person holds an open assignment
--     (not ended, not failed) without an expected end date;
--   * the assignment rule reads the person's kind with the row held FOR SHARE, so a new seat and a change of kind queue
--     one behind the other: whichever commits second sees the other, in both orders, under Read Committed.

CREATE FUNCTION "employees_time_limited_need_assignment_end"() RETURNS trigger AS $$
BEGIN
    IF NEW."employment_type" IN ('CONTRACTOR', 'FREELANCER', 'INTERN')
       AND NEW."employment_type" IS DISTINCT FROM OLD."employment_type"
       AND EXISTS (
           SELECT 1 FROM "license_assignments" a
            WHERE a."employee_id" = NEW."id" AND a."valid_until" IS NULL AND a."failed_at" IS NULL
              AND a."expected_end_date" IS NULL
       ) THEN
        RAISE EXCEPTION 'A contractor, freelancer or intern needs an expected end date on every open seat'
            USING ERRCODE = '23514', CONSTRAINT = 'employees_time_limited_open_assignments_have_end';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "employees_time_limited_open_assignments_have_end"
    BEFORE UPDATE OF "employment_type" ON "employees"
    FOR EACH ROW EXECUTE FUNCTION "employees_time_limited_need_assignment_end"();

-- The rules of 20261020190100, unchanged except that the person's kind of staff is read with the row held FOR SHARE.
CREATE OR REPLACE FUNCTION "license_assignment_check_rules"() RETURNS trigger AS $$
DECLARE
    employment "EmploymentType";
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW."subscription_id" IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM "subscriptions" s WHERE s."id" = NEW."subscription_id" AND s."plan_id" = NEW."plan_id"
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
