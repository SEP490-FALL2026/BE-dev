-- The record of a change of department or job title with a day it takes effect and the basis it rests on (US-03-01 AC-1, AC-2,
-- AC-4 -> AC-8, AC-11, AC-13 -> AC-22). The periods of the placement are written when the transfer is recorded (the one in
-- force ends on the day, the new one begins on it), so every read by day is right from midnight of that day; this table keeps
-- what the transfer says about them and what became of it.

-- CreateEnum
CREATE TYPE "DepartmentTransferStatus" AS ENUM ('PENDING', 'EFFECTIVE', 'CANCELLED');
CREATE TYPE "DepartmentTransferChangeKind" AS ENUM ('RESCHEDULED', 'CANCELLED');

-- CreateTable
CREATE TABLE "department_transfers" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "from_department_id" UUID NOT NULL,
    "to_department_id" UUID NOT NULL,
    "from_job_title_id" UUID NOT NULL,
    "to_job_title_id" UUID NOT NULL,
    "effective_on" DATE NOT NULL,
    "status" "DepartmentTransferStatus" NOT NULL DEFAULT 'PENDING',
    -- The two placements the transfer wrote. The new one is removed when the transfer is cancelled or moved, so these name
    -- rows without a foreign key.
    "closes_placement_id" UUID NOT NULL,
    "opens_placement_id" UUID NOT NULL,
    -- The head periods the transfer moved when the person headed the department they leave: {endedPeriodId,
    -- endedPeriodValidTo, createdPeriodId, successor: EMPLOYEE | NONE, successorEmployeeId}. Null when it moved none.
    "head_handover" JSONB,
    "grounds_type" TEXT NOT NULL,
    "grounds_reference" TEXT NOT NULL,
    "grounds_issuer" TEXT NOT NULL,
    "grounds_issued_on" DATE NOT NULL,
    "self_executed" BOOLEAN NOT NULL DEFAULT false,
    "recorded_by_app_user_id" UUID NOT NULL,
    "recorded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effective_at" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),
    "cancelled_by_app_user_id" UUID,
    "cancelled_reason" TEXT,

    CONSTRAINT "department_transfers_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "department_transfers_something_changes_check"
      CHECK ("from_department_id" <> "to_department_id" OR "from_job_title_id" <> "to_job_title_id"),
    CONSTRAINT "department_transfers_grounds_check"
      CHECK (btrim("grounds_type") <> '' AND btrim("grounds_reference") <> '' AND btrim("grounds_issuer") <> ''),
    CONSTRAINT "department_transfers_cancelled_consistent"
      CHECK (("status" = 'CANCELLED') = (
        "cancelled_at" IS NOT NULL AND "cancelled_by_app_user_id" IS NOT NULL
        AND "cancelled_reason" IS NOT NULL AND btrim("cancelled_reason") <> '')),
    CONSTRAINT "department_transfers_effective_consistent"
      CHECK (("status" = 'EFFECTIVE') = ("effective_at" IS NOT NULL)),
    CONSTRAINT "department_transfers_head_handover_object_check"
      CHECK ("head_handover" IS NULL OR jsonb_typeof("head_handover") = 'object')
);

CREATE TABLE "department_transfer_changes" (
    "id" UUID NOT NULL,
    "transfer_id" UUID NOT NULL,
    "kind" "DepartmentTransferChangeKind" NOT NULL,
    "old_effective_on" DATE NOT NULL,
    "new_effective_on" DATE,
    "reason" TEXT NOT NULL,
    "grounds_type" TEXT NOT NULL,
    "grounds_reference" TEXT NOT NULL,
    "grounds_issuer" TEXT NOT NULL,
    "grounds_issued_on" DATE NOT NULL,
    "changed_by_app_user_id" UUID NOT NULL,
    "changed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "department_transfer_changes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "department_transfer_changes_reason_check" CHECK (btrim("reason") <> ''),
    CONSTRAINT "department_transfer_changes_grounds_check"
      CHECK (btrim("grounds_type") <> '' AND btrim("grounds_reference") <> '' AND btrim("grounds_issuer") <> ''),
    CONSTRAINT "department_transfer_changes_kind_check"
      CHECK (("kind" = 'RESCHEDULED') = ("new_effective_on" IS NOT NULL AND "new_effective_on" <> "old_effective_on"))
);

-- Each employee has at most one transfer waiting.
-- CreateIndex
CREATE UNIQUE INDEX "department_transfers_one_pending_per_employee" ON "department_transfers"("employee_id") WHERE "status" = 'PENDING';

-- CreateIndex
CREATE INDEX "department_transfers_effective_on_id_idx" ON "department_transfers"("effective_on" DESC, "id");
CREATE INDEX "department_transfers_employee_id_idx" ON "department_transfers"("employee_id");
CREATE INDEX "department_transfers_organization_id_idx" ON "department_transfers"("organization_id");
CREATE INDEX "department_transfer_changes_transfer_id_changed_at_id_idx" ON "department_transfer_changes"("transfer_id", "changed_at", "id");

-- AddForeignKey (the accounts that recorded, cancelled or changed are values, as `granted_by` of a role is: the history outlives the account)
ALTER TABLE "department_transfers"
  ADD CONSTRAINT "department_transfers_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "department_transfers"
  ADD CONSTRAINT "department_transfers_employee_id_fkey"
  FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "department_transfers"
  ADD CONSTRAINT "department_transfers_from_department_id_fkey"
  FOREIGN KEY ("from_department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "department_transfers"
  ADD CONSTRAINT "department_transfers_to_department_id_fkey"
  FOREIGN KEY ("to_department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "department_transfers"
  ADD CONSTRAINT "department_transfers_from_job_title_id_fkey"
  FOREIGN KEY ("from_job_title_id") REFERENCES "job_titles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "department_transfers"
  ADD CONSTRAINT "department_transfers_to_job_title_id_fkey"
  FOREIGN KEY ("to_job_title_id") REFERENCES "job_titles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "department_transfer_changes"
  ADD CONSTRAINT "department_transfer_changes_transfer_id_fkey"
  FOREIGN KEY ("transfer_id") REFERENCES "department_transfers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A transfer that has taken effect or been cancelled is a fact and never changes again, and none is ever deleted. While it
-- waits, only what moving or cancelling it touches may change: the day, the placements and head periods it wrote, the status.
CREATE FUNCTION department_transfers_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION 'department_transfers keeps its history (% rejected)', TG_OP
      USING ERRCODE = 'restrict_violation';
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

CREATE TRIGGER "department_transfers_no_rewrite"
  BEFORE UPDATE OR DELETE ON "department_transfers"
  FOR EACH ROW EXECUTE FUNCTION department_transfers_guard();
CREATE TRIGGER "department_transfers_no_truncate"
  BEFORE TRUNCATE ON "department_transfers"
  FOR EACH STATEMENT EXECUTE FUNCTION department_transfers_guard();

-- The log of moves and cancellations is append-only.
CREATE FUNCTION department_transfer_changes_reject_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'department_transfer_changes is append-only (% rejected)', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER "department_transfer_changes_no_update_delete"
  BEFORE UPDATE OR DELETE ON "department_transfer_changes"
  FOR EACH ROW EXECUTE FUNCTION department_transfer_changes_reject_change();
CREATE TRIGGER "department_transfer_changes_no_truncate"
  BEFORE TRUNCATE ON "department_transfer_changes"
  FOR EACH STATEMENT EXECUTE FUNCTION department_transfer_changes_reject_change();

-- The history of a placement also keeps what a transfer that took effect did: the placement it ended and the one it began are
-- not deleted. This replaces employee_placements_keep_history of 20261024140100 and keeps everything that function guards.
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
     OR NEW."department_id" IS DISTINCT FROM OLD."department_id"
     OR NEW."job_title_id" IS DISTINCT FROM OLD."job_title_id" THEN
    RAISE EXCEPTION 'the person, the department and the title of a placement never change'
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

-- A head is a member of the department for the whole period (QĐ-66a, INV-20), also when the days are covered by more than one
-- placement of the same department: a change of title inside the department (US-03-01 AC-11) closes one placement and opens
-- the next on the same day, and the head must stay a head across it. This replaces department_head_requires_membership of
-- 20261016160000, which wanted one placement to cover the whole period, and keeps its refusal.
CREATE OR REPLACE FUNCTION department_head_requires_membership() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT COALESCE((
    SELECT range_agg(daterange(p.valid_from, p.valid_to, '[)')) @> daterange(NEW.valid_from, NEW.valid_to, '[)')
      FROM employee_placements p
     WHERE p.employee_id = NEW.employee_id AND p.department_id = NEW.department_id
  ), false) THEN
    RAISE EXCEPTION 'the head of a department must be a member of it for the whole period'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
