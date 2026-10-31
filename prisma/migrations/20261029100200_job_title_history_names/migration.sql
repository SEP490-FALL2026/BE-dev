-- The job title is free text; the catalogue is gone (g0-g6-final-business-baseline-remediation, Task 1.3; F03, F41; P03-D04 = A,
-- P03-D05 = A; spec L.4 and L.10). The compatibility release already writes `employees.job_title` and no longer names a
-- catalogue entry, so this migration keeps the NAME the catalogue gave to each historical row, closes the two kinds of
-- record that no longer exist (a `BM-09` notice of a change of job title, a transfer that changes the job title only) and
-- removes the four `job_title_id` columns and their synchronisation triggers. The catalogue table itself (`job_titles`) is
-- dropped by the migration that removes the standard toolset (Task 1.4), which still keys on it.
--
-- The compatibility image stays valid on this schema: it names no `job_title_id`, it writes `employees.job_title`, it
-- rejects a retired kind with a 4xx before it writes, and it reads no history name.

-- 1. A row that still waits and is of a kind that no longer exists is closed by the running release with the fixed reasons of
-- spec L.4 BEFORE this migration (`pnpm ops:preflight` is `BLOCKED` otherwise); nothing is written while one remains.
DO $$
DECLARE
    pending_notices TEXT;
    pending_transfers TEXT;
BEGIN
    SELECT string_agg(n."id"::text, ', ' ORDER BY n."id")
      INTO pending_notices
      FROM "personnel_notices" n
     WHERE n."kind" = 'JOB_TITLE_CHANGE' AND n."status" = 'PENDING_VERIFICATION';

    SELECT string_agg(t."id"::text, ', ' ORDER BY t."id")
      INTO pending_transfers
      FROM "department_transfers" t
     WHERE t."status" = 'PENDING' AND t."from_department_id" = t."to_department_id";

    IF pending_notices IS NOT NULL OR pending_transfers IS NOT NULL THEN
        RAISE EXCEPTION 'Waiting BM-09 notices of a change of job title: %. Waiting transfers that change the job title only: %. Nothing was changed. Reject the notices and cancel the transfers with the reasons of the spec on the running release, then run `pnpm ops:preflight`.',
                        COALESCE(pending_notices, 'none'), COALESCE(pending_transfers, 'none')
            USING ERRCODE = '23503';
    END IF;
END
$$;

-- 2. The names the catalogue gave to the history, read only: nothing in `src` reads or writes them (a row written after
-- this migration keeps NULL).
ALTER TABLE "employee_placements" ADD COLUMN "job_title_name" TEXT;
ALTER TABLE "department_transfers" ADD COLUMN "from_job_title_name" TEXT, ADD COLUMN "to_job_title_name" TEXT;
ALTER TABLE "transfer_reviews" ADD COLUMN "job_title_name" TEXT;

UPDATE "employee_placements" p SET "job_title_name" = t."name" FROM "job_titles" t WHERE t."id" = p."job_title_id";
UPDATE "transfer_reviews" r SET "job_title_name" = t."name" FROM "job_titles" t WHERE t."id" = r."job_title_id";

-- A transfer keeps its history (an effective one cannot change again); the guard is set aside for the one statement that
-- copies the names, as the migrations that corrected history before did, and put back at once. Nothing else of a row changes.
ALTER TABLE "department_transfers" DISABLE TRIGGER "department_transfers_no_rewrite";

UPDATE "department_transfers" d
   SET "from_job_title_name" = f."name", "to_job_title_name" = u."name"
  FROM "job_titles" f, "job_titles" u
 WHERE f."id" = d."from_job_title_id" AND u."id" = d."to_job_title_id";

ALTER TABLE "department_transfers" ENABLE TRIGGER "department_transfers_no_rewrite";

-- 3. The names never change and no new row writes one.
CREATE FUNCTION history_job_title_name_frozen() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF COALESCE(to_jsonb(NEW) ->> 'job_title_name', to_jsonb(NEW) ->> 'from_job_title_name',
                    to_jsonb(NEW) ->> 'to_job_title_name') IS NOT NULL THEN
            RAISE EXCEPTION '% keeps the job title names of its history read only', TG_TABLE_NAME
                USING ERRCODE = 'check_violation', CONSTRAINT = 'history_job_title_name_frozen';
        END IF;
    ELSIF jsonb_build_array(to_jsonb(NEW) -> 'job_title_name', to_jsonb(NEW) -> 'from_job_title_name',
                            to_jsonb(NEW) -> 'to_job_title_name')
          IS DISTINCT FROM
          jsonb_build_array(to_jsonb(OLD) -> 'job_title_name', to_jsonb(OLD) -> 'from_job_title_name',
                            to_jsonb(OLD) -> 'to_job_title_name') THEN
        RAISE EXCEPTION '% keeps the job title names of its history read only', TG_TABLE_NAME
            USING ERRCODE = 'check_violation', CONSTRAINT = 'history_job_title_name_frozen';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER history_job_title_name_frozen
    BEFORE INSERT OR UPDATE ON "employee_placements"
    FOR EACH ROW EXECUTE FUNCTION history_job_title_name_frozen();
CREATE TRIGGER history_job_title_name_frozen
    BEFORE INSERT OR UPDATE ON "department_transfers"
    FOR EACH ROW EXECUTE FUNCTION history_job_title_name_frozen();
CREATE TRIGGER history_job_title_name_frozen
    BEFORE INSERT OR UPDATE ON "transfer_reviews"
    FOR EACH ROW EXECUTE FUNCTION history_job_title_name_frozen();

-- 4. No new row of the two retired kinds. A CHECK ... NOT VALID would still refuse a legitimate update of a historical row
-- (closing the record of a transfer), so the rule is a trigger on INSERT.
CREATE FUNCTION personnel_notices_no_retired_kind() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW."kind" = 'JOB_TITLE_CHANGE' THEN
        RAISE EXCEPTION 'a change of job title is no BM-09 notice any more (QĐ-87e)'
            USING ERRCODE = 'check_violation', CONSTRAINT = 'personnel_notices_no_retired_kind';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER personnel_notices_no_retired_kind
    BEFORE INSERT ON "personnel_notices"
    FOR EACH ROW EXECUTE FUNCTION personnel_notices_no_retired_kind();

CREATE FUNCTION department_transfers_department_changes() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW."from_department_id" = NEW."to_department_id" THEN
        RAISE EXCEPTION 'a transfer changes the department (QĐ-87e)'
            USING ERRCODE = 'check_violation', CONSTRAINT = 'department_transfers_department_changes';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER department_transfers_department_changes
    BEFORE INSERT ON "department_transfers"
    FOR EACH ROW EXECUTE FUNCTION department_transfers_department_changes();

-- 5. The synchronisation of the compatibility step goes: nothing names a catalogue entry any more.
DROP TRIGGER "job_title_id_backfill" ON "employee_placements";
DROP TRIGGER "job_title_id_backfill" ON "department_transfers";
DROP TRIGGER "job_title_id_backfill" ON "transfer_reviews";
DROP TRIGGER "employees_job_title_forward" ON "employee_placements";
DROP FUNCTION job_title_id_backfill();
DROP FUNCTION employees_job_title_forward();
DROP FUNCTION job_title_id_of_employee(uuid);

-- 6. The three guards of history no longer name the columns that go (the rest of each rule is the one they had).
CREATE OR REPLACE FUNCTION department_transfers_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION 'department_transfers keeps its history (% rejected)', TG_OP
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD."status" = 'EFFECTIVE' AND OLD."closed_at" IS NULL AND NEW."closed_at" IS NOT NULL THEN
    IF (to_jsonb(NEW) - 'closed_at' - 'closed_by_app_user_id') IS DISTINCT FROM (to_jsonb(OLD) - 'closed_at' - 'closed_by_app_user_id') THEN
      RAISE EXCEPTION 'closing a transfer changes nothing else of it'
        USING ERRCODE = 'restrict_violation';
    END IF;

    RETURN NEW;
  END IF;
  IF OLD."status" <> 'PENDING' THEN
    RAISE EXCEPTION 'a transfer that is %, cannot change again', OLD."status"
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW."employee_id" IS DISTINCT FROM OLD."employee_id"
     OR NEW."from_department_id" IS DISTINCT FROM OLD."from_department_id"
     OR NEW."to_department_id" IS DISTINCT FROM OLD."to_department_id"
     OR NEW."recorded_by_app_user_id" IS DISTINCT FROM OLD."recorded_by_app_user_id"
     OR NEW."recorded_at" IS DISTINCT FROM OLD."recorded_at" THEN
    RAISE EXCEPTION 'who is moved, from where to where, and who recorded it never change'
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION employee_placements_keep_history() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (
      SELECT 1 FROM "organization_change_announcements" a
       WHERE a."kind" = 'PLACEMENT_START' AND a."subject_id" = OLD."id"
    ) OR EXISTS (
      SELECT 1 FROM "department_transfers" t
       WHERE t."status" = 'EFFECTIVE' AND OLD."id" IN (t."closes_placement_id", t."opens_placement_id")
    ) THEN
      RAISE EXCEPTION 'a placement that has been told to the organization cannot be deleted'
        USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    RETURN OLD;
  END IF;

  IF NEW."employee_id" IS DISTINCT FROM OLD."employee_id"
     OR NEW."department_id" IS DISTINCT FROM OLD."department_id" THEN
    RAISE EXCEPTION 'the person and the department of a placement never change'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF NEW."valid_from" IS DISTINCT FROM OLD."valid_from" AND EXISTS (
    SELECT 1 FROM "organization_change_announcements" a
     WHERE a."kind" = 'PLACEMENT_START' AND a."subject_id" = OLD."id"
  ) THEN
    RAISE EXCEPTION 'the first day of a placement that has been told to the organization cannot change'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION transfer_review_guard() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'A transfer review is never deleted'
            USING ERRCODE = '55000', CONSTRAINT = 'transfer_review_kept';
    END IF;
    IF NEW."organization_id" IS DISTINCT FROM OLD."organization_id" OR NEW."employee_id" IS DISTINCT FROM OLD."employee_id"
       OR NEW."placement_id" IS DISTINCT FROM OLD."placement_id" OR NEW."department_id" IS DISTINCT FROM OLD."department_id"
       OR NEW."effective_on" IS DISTINCT FROM OLD."effective_on"
       OR NEW."due_on" IS DISTINCT FROM OLD."due_on" OR NEW."transfer_id" IS DISTINCT FROM OLD."transfer_id" THEN
        RAISE EXCEPTION 'A transfer review keeps its person, its department and its deadline'
            USING ERRCODE = '55000', CONSTRAINT = 'transfer_review_identity_fixed';
    END IF;
    IF OLD."status" <> 'OPEN' AND NEW."status" IS DISTINCT FROM OLD."status" THEN
        RAISE EXCEPTION 'A transfer review that ended is never reopened'
            USING ERRCODE = '55000', CONSTRAINT = 'transfer_review_status_final';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 7. The catalogue columns and the rule that needed them. (`job_title_display_name` was the SQL form of the name rule of
-- the catalogue; nothing reads it now.)
ALTER TABLE "department_transfers" DROP CONSTRAINT "department_transfers_something_changes_check";
ALTER TABLE "employee_placements" DROP COLUMN "job_title_id";
ALTER TABLE "department_transfers" DROP COLUMN "from_job_title_id", DROP COLUMN "to_job_title_id";
ALTER TABLE "transfer_reviews" DROP COLUMN "job_title_id";
DROP FUNCTION job_title_display_name(text);
