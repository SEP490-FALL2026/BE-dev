-- The renewal of a right that ends on a day (g5-return-and-renewal-requests, US-05-14): the old record keeps the end it had and
-- a new one begins where it ends, chained to it. Two rules of the assignments change for it.

-- 1. A record made by a request may name the record it renews. Only a handover (a service account that passes to another
-- person) had to name its predecessor so far; a baseline row still names none.
ALTER TABLE "license_assignments" DROP CONSTRAINT "license_assignments_handover_names_predecessor";
ALTER TABLE "license_assignments"
    ADD CONSTRAINT "license_assignments_handover_names_predecessor" CHECK (
        ("source" = 'HANDOVER' AND "predecessor_id" IS NOT NULL)
        OR ("source" = 'REQUEST')
        OR ("source" = 'BASELINE' AND "predecessor_id" IS NULL)
    );

-- 2. The day a right is expected to end is set once and is not edited: to change it is a renewal, a new record (US-05-14 AC-2).
-- It may still be set where there was none. This is the latest definition of the function (20261024030100) with that rule added.
CREATE OR REPLACE FUNCTION "license_assignment_reject_change"() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'A license assignment is never deleted'
            USING ERRCODE = '55000', CONSTRAINT = 'license_assignments_immutable';
    END IF;

    IF (NEW."id", NEW."organization_id", NEW."kind", NEW."source", NEW."plan_id", NEW."subscription_id",
        NEW."employee_id", NEW."account_identifier", NEW."normalized_account_identifier", NEW."reason",
        NEW."cost_center_id", NEW."owning_department_id", NEW."valid_from", NEW."valid_from_basis", NEW."predecessor_id",
        NEW."baseline_import_id", NEW."created_by_app_user_id", NEW."created_at")
       IS DISTINCT FROM
       (OLD."id", OLD."organization_id", OLD."kind", OLD."source", OLD."plan_id", OLD."subscription_id",
        OLD."employee_id", OLD."account_identifier", OLD."normalized_account_identifier", OLD."reason",
        OLD."cost_center_id", OLD."owning_department_id", OLD."valid_from", OLD."valid_from_basis", OLD."predecessor_id",
        OLD."baseline_import_id", OLD."created_by_app_user_id", OLD."created_at") THEN
        RAISE EXCEPTION 'Only when a license assignment ends and when it is expected to end may change'
            USING ERRCODE = '55000', CONSTRAINT = 'license_assignments_immutable';
    END IF;

    IF OLD."failed_at" IS NOT NULL
       AND (NEW."failed_at", NEW."cancelled_at", NEW."valid_until", NEW."expected_end_date")
           IS DISTINCT FROM (OLD."failed_at", OLD."cancelled_at", OLD."valid_until", OLD."expected_end_date") THEN
        RAISE EXCEPTION 'A license assignment that failed never changes again'
            USING ERRCODE = '55000', CONSTRAINT = 'license_assignments_failed_is_final';
    END IF;

    IF OLD."cancelled_at" IS NOT NULL
       AND (NEW."failed_at", NEW."cancelled_at", NEW."valid_until", NEW."expected_end_date")
           IS DISTINCT FROM (OLD."failed_at", OLD."cancelled_at", OLD."valid_until", OLD."expected_end_date") THEN
        RAISE EXCEPTION 'A license assignment that was cancelled never changes again'
            USING ERRCODE = '55000', CONSTRAINT = 'license_assignments_cancelled_is_final';
    END IF;

    IF OLD."failed_at" IS NULL AND NEW."failed_at" IS NOT NULL AND OLD."valid_until" IS NOT NULL THEN
        RAISE EXCEPTION 'Only an assignment that is still open can fail'
            USING ERRCODE = '55000', CONSTRAINT = 'license_assignments_failed_needs_open';
    END IF;

    IF OLD."cancelled_at" IS NULL AND NEW."cancelled_at" IS NOT NULL AND OLD."valid_until" IS NOT NULL THEN
        RAISE EXCEPTION 'Only an assignment that is still open can be cancelled'
            USING ERRCODE = '55000', CONSTRAINT = 'license_assignments_cancelled_needs_open';
    END IF;

    IF OLD."expected_end_date" IS NOT NULL AND NEW."expected_end_date" IS DISTINCT FROM OLD."expected_end_date" THEN
        RAISE EXCEPTION 'The day a license assignment is expected to end is not edited: a renewal is a new record'
            USING ERRCODE = '55000', CONSTRAINT = 'license_assignments_expected_end_is_final';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
