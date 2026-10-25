-- What an employee is doing for the organization apart from whether they have left (US-03-01 AC-15, AC-21, FR-2.13): working,
-- on a long leave, handing over before leaving, or gone. The status stays ACTIVE until the person has left, so every place
-- that filters on `status = 'ACTIVE'` (the search for a recipient, the import, the sign-in) keeps its meaning; the work state
-- is the one the personnel flows (transfer, long leave, leaving) read and move.

-- CreateEnum
CREATE TYPE "EmployeeWorkState" AS ENUM ('WORKING', 'ON_LONG_LEAVE', 'HANDING_OVER', 'LEFT');

-- AlterTable
ALTER TABLE "employees" ADD COLUMN "work_state" "EmployeeWorkState" NOT NULL DEFAULT 'WORKING';

-- Everyone who has already left is LEFT.
UPDATE "employees" SET "work_state" = 'LEFT' WHERE "status" = 'TERMINATED';

-- The person has left exactly when the work state says so.
ALTER TABLE "employees"
  ADD CONSTRAINT "employees_work_state_matches_status"
  CHECK (("status" = 'TERMINATED') = ("work_state" = 'LEFT'));

-- The graph of the work state, kept where no code path can step around it:
--   WORKING <-> ON_LONG_LEAVE; WORKING or ON_LONG_LEAVE -> HANDING_OVER; HANDING_OVER -> WORKING, ON_LONG_LEAVE or LEFT;
--   WORKING or ON_LONG_LEAVE -> LEFT; LEFT ends it.
-- The status is the master when it changes in the same statement: whoever sets `TERMINATED` makes the person LEFT, and the
-- operator who sets a record back to ACTIVE makes the person WORKING again, so a write of the status alone never meets the
-- CHECK above.
CREATE FUNCTION employees_guard_work_state() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."status" = 'TERMINATED' THEN NEW."work_state" := 'LEFT'; END IF;
    RETURN NEW;
  END IF;

  IF NEW."status" IS DISTINCT FROM OLD."status" THEN
    NEW."work_state" := CASE WHEN NEW."status" = 'TERMINATED' THEN 'LEFT' ELSE 'WORKING' END;
    RETURN NEW;
  END IF;

  IF NEW."work_state" IS DISTINCT FROM OLD."work_state" AND NOT (
       (OLD."work_state" = 'WORKING' AND NEW."work_state" IN ('ON_LONG_LEAVE', 'HANDING_OVER', 'LEFT'))
    OR (OLD."work_state" = 'ON_LONG_LEAVE' AND NEW."work_state" IN ('WORKING', 'HANDING_OVER', 'LEFT'))
    OR (OLD."work_state" = 'HANDING_OVER' AND NEW."work_state" IN ('WORKING', 'ON_LONG_LEAVE', 'LEFT'))
  ) THEN
    RAISE EXCEPTION 'the work state cannot move from % to %', OLD."work_state", NEW."work_state"
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "employees_work_state_guard"
  BEFORE INSERT OR UPDATE ON "employees"
  FOR EACH ROW EXECUTE FUNCTION employees_guard_work_state();
