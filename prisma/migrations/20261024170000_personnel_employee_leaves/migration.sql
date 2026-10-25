-- The long leave of an employee with the day they are due back and the basis it rests on (g6-long-leave, US-03-03 AC-4, AC-5,
-- AC-7, AC-8, FR-2.14). One row for each period of leave; the work state of the employee (ON_LONG_LEAVE) is moved by the same
-- transaction through the organization. No column keeps the reason for the leave and none keeps medical data.

-- CreateEnum
CREATE TYPE "EmployeeLeaveStatus" AS ENUM ('ACTIVE', 'ENDED');
CREATE TYPE "EmployeeLeaveEndKind" AS ENUM ('RETURNED', 'DEPARTURE_STARTED');
CREATE TYPE "EmployeeLeaveChangeKind" AS ENUM ('STARTED', 'RETURN_DATE_CHANGED', 'RETURNED', 'ENDED_FOR_DEPARTURE', 'RESUMED');

-- CreateTable
CREATE TABLE "employee_leaves" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "started_on" DATE NOT NULL,
    "approved_return_on" DATE NOT NULL,
    "status" "EmployeeLeaveStatus" NOT NULL DEFAULT 'ACTIVE',
    "ended_on" DATE,
    "end_kind" "EmployeeLeaveEndKind",
    -- The leave that was ended for a handover and that this one carries on after the handover was cancelled.
    "resumes_leave_id" UUID,
    -- The basis of the approved day of return in force: the one of the start, or of the last change of the day.
    "grounds_type" TEXT NOT NULL,
    "grounds_reference" TEXT NOT NULL,
    "grounds_issuer" TEXT NOT NULL,
    "grounds_issued_on" DATE NOT NULL,
    "started_by_app_user_id" UUID NOT NULL,
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "self_executed" BOOLEAN NOT NULL DEFAULT false,
    -- The approved day of return that the reminder was written for: one reminder for each approved day.
    "return_overdue_noticed_for" DATE,

    CONSTRAINT "employee_leaves_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "employee_leaves_return_after_start_check" CHECK ("approved_return_on" > "started_on"),
    CONSTRAINT "employee_leaves_end_consistent_check"
      CHECK (("status" = 'ENDED') = ("ended_on" IS NOT NULL AND "end_kind" IS NOT NULL)
         AND ("status" = 'ENDED' OR ("ended_on" IS NULL AND "end_kind" IS NULL))),
    CONSTRAINT "employee_leaves_end_not_before_start_check" CHECK ("ended_on" IS NULL OR "ended_on" >= "started_on"),
    CONSTRAINT "employee_leaves_grounds_check"
      CHECK (btrim("grounds_type") <> '' AND btrim("grounds_reference") <> '' AND btrim("grounds_issuer") <> '')
);

CREATE TABLE "employee_leave_changes" (
    "id" UUID NOT NULL,
    "leave_id" UUID NOT NULL,
    "kind" "EmployeeLeaveChangeKind" NOT NULL,
    "old_return_on" DATE,
    "new_return_on" DATE,
    -- The day the person came back, or the day the leave ended for a handover.
    "returned_on" DATE,
    -- A return on the approved day, which needs no new document. Only a return says it.
    "on_schedule" BOOLEAN,
    "grounds_type" TEXT,
    "grounds_reference" TEXT,
    "grounds_issuer" TEXT,
    "grounds_issued_on" DATE,
    "recorded_by_app_user_id" UUID NOT NULL,
    "recorded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "self_executed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "employee_leave_changes_pkey" PRIMARY KEY ("id"),
    -- The basis is whole or absent.
    CONSTRAINT "employee_leave_changes_grounds_whole_check"
      CHECK (("grounds_type" IS NULL AND "grounds_reference" IS NULL AND "grounds_issuer" IS NULL AND "grounds_issued_on" IS NULL)
          OR (btrim("grounds_type") <> '' AND btrim("grounds_reference") <> '' AND btrim("grounds_issuer") <> ''
              AND "grounds_issued_on" IS NOT NULL)),
    CONSTRAINT "employee_leave_changes_kind_check" CHECK (
      CASE "kind"
        WHEN 'STARTED' THEN "new_return_on" IS NOT NULL AND "old_return_on" IS NULL AND "grounds_type" IS NOT NULL
        WHEN 'RETURN_DATE_CHANGED' THEN "old_return_on" IS NOT NULL AND "new_return_on" IS NOT NULL
          AND "new_return_on" <> "old_return_on" AND "grounds_type" IS NOT NULL
        WHEN 'RETURNED' THEN "returned_on" IS NOT NULL AND "on_schedule" IS NOT NULL
          AND ("on_schedule" OR "grounds_type" IS NOT NULL)
        WHEN 'ENDED_FOR_DEPARTURE' THEN "returned_on" IS NOT NULL
        WHEN 'RESUMED' THEN "new_return_on" IS NOT NULL
      END)
);

-- A person is on one leave at a time.
-- CreateIndex
CREATE UNIQUE INDEX "employee_leaves_one_active_per_employee" ON "employee_leaves"("employee_id") WHERE "status" = 'ACTIVE';
CREATE INDEX "employee_leaves_approved_return_on_id_idx" ON "employee_leaves"("approved_return_on", "id");
CREATE INDEX "employee_leaves_employee_id_started_on_idx" ON "employee_leaves"("employee_id", "started_on");
CREATE INDEX "employee_leaves_organization_id_idx" ON "employee_leaves"("organization_id");
CREATE INDEX "employee_leave_changes_leave_id_recorded_at_id_idx" ON "employee_leave_changes"("leave_id", "recorded_at", "id");

-- AddForeignKey (the accounts that started or recorded are values: the history outlives the account)
ALTER TABLE "employee_leaves"
  ADD CONSTRAINT "employee_leaves_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "employee_leaves"
  ADD CONSTRAINT "employee_leaves_employee_id_fkey"
  FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "employee_leaves"
  ADD CONSTRAINT "employee_leaves_resumes_leave_id_fkey"
  FOREIGN KEY ("resumes_leave_id") REFERENCES "employee_leaves"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "employee_leave_changes"
  ADD CONSTRAINT "employee_leave_changes_leave_id_fkey"
  FOREIGN KEY ("leave_id") REFERENCES "employee_leaves"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A leave that has ended is a fact and never changes again, and none is deleted. While it runs, only the approved day of return
-- with its basis, the mark of the reminder and the step to the end may change.
CREATE FUNCTION employee_leaves_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION 'employee_leaves keeps its history (% rejected)', TG_OP
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF OLD."status" <> 'ACTIVE' THEN
    RAISE EXCEPTION 'a leave that has ended cannot change again'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF NEW."organization_id" IS DISTINCT FROM OLD."organization_id"
     OR NEW."employee_id" IS DISTINCT FROM OLD."employee_id"
     OR NEW."started_on" IS DISTINCT FROM OLD."started_on"
     OR NEW."resumes_leave_id" IS DISTINCT FROM OLD."resumes_leave_id"
     OR NEW."started_by_app_user_id" IS DISTINCT FROM OLD."started_by_app_user_id"
     OR NEW."started_at" IS DISTINCT FROM OLD."started_at"
     OR NEW."self_executed" IS DISTINCT FROM OLD."self_executed" THEN
    RAISE EXCEPTION 'who is on leave, since when and who started it never change'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "employee_leaves_no_rewrite"
  BEFORE UPDATE OR DELETE ON "employee_leaves"
  FOR EACH ROW EXECUTE FUNCTION employee_leaves_guard();
CREATE TRIGGER "employee_leaves_no_truncate"
  BEFORE TRUNCATE ON "employee_leaves"
  FOR EACH STATEMENT EXECUTE FUNCTION employee_leaves_guard();

-- The log of what happened to a leave is append-only.
CREATE FUNCTION employee_leave_changes_reject_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'employee_leave_changes is append-only (% rejected)', TG_OP
    USING ERRCODE = 'object_not_in_prerequisite_state';
END;
$$;

CREATE TRIGGER "employee_leave_changes_no_update_delete"
  BEFORE UPDATE OR DELETE ON "employee_leave_changes"
  FOR EACH ROW EXECUTE FUNCTION employee_leave_changes_reject_change();
CREATE TRIGGER "employee_leave_changes_no_truncate"
  BEFORE TRUNCATE ON "employee_leave_changes"
  FOR EACH STATEMENT EXECUTE FUNCTION employee_leave_changes_reject_change();
