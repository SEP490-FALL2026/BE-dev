-- MF-3 (R-49, QĐ-110q, SPEC MF3-C.4): a person in the grace of a transfer asked again, on the same subscription, for software they hold, and the grant of the new
-- right ends the old one the day it is given. The new right names the one it replaced, so the old right is read as given again (P7 `regranted`, the picture
-- of the closing) and is not taken back when the grace ends. Expand only: one nullable column on the new right, one foreign key, one index; no row changes,
-- nothing is dropped, and the old right is ended through its own `valid_until` (the one column the guard of the table lets change); the function of that guard is
-- replaced once, with the new column among the ones that never change after the row is written. Safe to run twice.

ALTER TABLE "license_assignments" ADD COLUMN IF NOT EXISTS "replaces_assignment_id" UUID;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'license_assignments_replaces_assignment_id_fkey') THEN
    ALTER TABLE "license_assignments" ADD CONSTRAINT "license_assignments_replaces_assignment_id_fkey"
      FOREIGN KEY ("replaces_assignment_id") REFERENCES "license_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END
$$;

-- A right never replaces itself, and only a request writes one (each column asked on its own: a CHECK passes on NULL).
ALTER TABLE "license_assignments" DROP CONSTRAINT IF EXISTS "license_assignments_replaces_check";
ALTER TABLE "license_assignments" ADD CONSTRAINT "license_assignments_replaces_check" CHECK (
  "replaces_assignment_id" IS NULL
  OR ("replaces_assignment_id" <> "id" AND "source" = 'REQUEST')
);

CREATE INDEX IF NOT EXISTS "license_assignments_replaces_assignment_id_idx" ON "license_assignments" ("replaces_assignment_id");

-- The right a seat replaced is written when the seat is, by the grant that gave it, and is never edited after (a request writes it once; reading it back
-- as "given again" depends on that). Everything else of the function is as the latest definition of it (20261109130000), `replaces_assignment_id` aside; the
-- old right can still be opened again (`valid_until` back to empty) when the new one failed or was cancelled, which is a change of the old right, not of this one.
CREATE OR REPLACE FUNCTION "license_assignment_reject_change"() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'A license assignment is never deleted'
            USING ERRCODE = '55000', CONSTRAINT = 'license_assignments_immutable';
    END IF;

    IF (NEW."id", NEW."organization_id", NEW."kind", NEW."source", NEW."plan_id", NEW."subscription_id",
        NEW."employee_id", NEW."account_identifier", NEW."normalized_account_identifier", NEW."reason",
        NEW."cost_center_id", NEW."owning_department_id", NEW."valid_from", NEW."valid_from_basis", NEW."predecessor_id",
        NEW."replaces_assignment_id", NEW."baseline_import_id", NEW."created_by_app_user_id", NEW."created_at")
       IS DISTINCT FROM
       (OLD."id", OLD."organization_id", OLD."kind", OLD."source", OLD."plan_id", OLD."subscription_id",
        OLD."employee_id", OLD."account_identifier", OLD."normalized_account_identifier", OLD."reason",
        OLD."cost_center_id", OLD."owning_department_id", OLD."valid_from", OLD."valid_from_basis", OLD."predecessor_id",
        OLD."replaces_assignment_id", OLD."baseline_import_id", OLD."created_by_app_user_id", OLD."created_at") THEN
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

    IF OLD."granted_on" IS NOT NULL AND NEW."granted_on" IS DISTINCT FROM OLD."granted_on" THEN
        RAISE EXCEPTION 'The day the task of the grant was completed is written once'
            USING ERRCODE = '55000', CONSTRAINT = 'license_assignments_granted_on_is_final';
    END IF;

    IF OLD."expected_end_date" IS NOT NULL AND NEW."expected_end_date" IS DISTINCT FROM OLD."expected_end_date"
       AND NOT (OLD."granted_on" IS NULL AND NEW."granted_on" IS NOT NULL AND NEW."expected_end_date" < OLD."expected_end_date") THEN
        RAISE EXCEPTION 'The day a license assignment is expected to end is not edited: a renewal is a new record'
            USING ERRCODE = '55000', CONSTRAINT = 'license_assignments_expected_end_is_final';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
