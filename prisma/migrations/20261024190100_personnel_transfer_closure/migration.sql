-- The closing of a transfer (g6-service-account-handover, US-03-08 AC-5): an effective transfer is closed by the IT Admin once the
-- people who answer for the service accounts of the person are named. Closing never stops a transfer from taking effect.

-- AlterTable
ALTER TABLE "department_transfers" ADD COLUMN "closed_at" TIMESTAMPTZ(3), ADD COLUMN "closed_by_app_user_id" UUID;

-- Only an effective transfer is closed, with who closed it.
ALTER TABLE "department_transfers" ADD CONSTRAINT "department_transfers_closure_check" CHECK (
    ("closed_at" IS NULL AND "closed_by_app_user_id" IS NULL)
    OR ("closed_at" IS NOT NULL AND "closed_by_app_user_id" IS NOT NULL AND "status" = 'EFFECTIVE')
);

-- The guard of 20261024140200 with one thing added: an effective transfer that is not closed may be closed, and nothing else of it
-- changes then. A closed transfer, like any that is not waiting, never changes again.
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
     OR NEW."from_job_title_id" IS DISTINCT FROM OLD."from_job_title_id"
     OR NEW."to_job_title_id" IS DISTINCT FROM OLD."to_job_title_id"
     OR NEW."recorded_by_app_user_id" IS DISTINCT FROM OLD."recorded_by_app_user_id"
     OR NEW."recorded_at" IS DISTINCT FROM OLD."recorded_at" THEN
    RAISE EXCEPTION 'who is moved, from where to where, and who recorded it never change'
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN NEW;
END;
$$;
