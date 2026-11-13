-- MF-3 (QĐ-110r, SPEC MF3-C.2): a departure recorded while the grace of a transfer lasts takes over the old rights, and the transfer is closed as
-- superseded by that departure. Expand only: one nullable column, one check, one function replaced; nothing is dropped and no row changes. Safe to
-- run twice.
--
-- `superseded_by_case_id` names the departure that took the transfer over. A transfer superseded is a transfer closed by the system, so the column
-- only exists beside a closing by the system on a transfer that took effect (each column asked on its own: a CHECK passes on NULL).

ALTER TABLE "department_transfers" ADD COLUMN IF NOT EXISTS "superseded_by_case_id" UUID;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'department_transfers_superseded_by_case_id_fkey') THEN
    ALTER TABLE "department_transfers" ADD CONSTRAINT "department_transfers_superseded_by_case_id_fkey"
      FOREIGN KEY ("superseded_by_case_id") REFERENCES "offboarding_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END
$$;

ALTER TABLE "department_transfers" DROP CONSTRAINT IF EXISTS "department_transfers_superseded_check";
ALTER TABLE "department_transfers" ADD CONSTRAINT "department_transfers_superseded_check" CHECK (
  "superseded_by_case_id" IS NULL
  OR (
    "status" = 'EFFECTIVE'
    AND "closed_at" IS NOT NULL
    AND "closed_by_system"
  )
);

-- The guard of 20261113001800 with the column of the closing added: until a transfer that took effect closes, only the columns the settlement
-- writes change (the grace, the reminder, the snapshots, the closing, and the departure that took it over); the grace and the snapshots are
-- written once. A closed transfer, like a cancelled one, never changes again. A transfer that waits changes as before.
CREATE OR REPLACE FUNCTION department_transfers_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION 'department_transfers keeps its history (% rejected)', TG_OP
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD."status" = 'EFFECTIVE' AND OLD."closed_at" IS NULL THEN
    IF (to_jsonb(NEW) - 'grace_ends_on' - 'grace_reminder_on' - 'reminded_at' - 'snapshot_before' - 'snapshot_after'
          - 'closed_at' - 'closed_by_app_user_id' - 'closed_by_system' - 'superseded_by_case_id')
       IS DISTINCT FROM
       (to_jsonb(OLD) - 'grace_ends_on' - 'grace_reminder_on' - 'reminded_at' - 'snapshot_before' - 'snapshot_after'
          - 'closed_at' - 'closed_by_app_user_id' - 'closed_by_system' - 'superseded_by_case_id') THEN
      RAISE EXCEPTION 'a transfer that took effect changes only its grace, its snapshots and its closing'
        USING ERRCODE = 'restrict_violation';
    END IF;
    IF (OLD."grace_ends_on" IS NOT NULL AND NEW."grace_ends_on" IS DISTINCT FROM OLD."grace_ends_on")
       OR (OLD."grace_reminder_on" IS NOT NULL AND NEW."grace_reminder_on" IS DISTINCT FROM OLD."grace_reminder_on")
       OR (OLD."reminded_at" IS NOT NULL AND NEW."reminded_at" IS DISTINCT FROM OLD."reminded_at")
       OR (OLD."snapshot_before" IS NOT NULL AND NEW."snapshot_before" IS DISTINCT FROM OLD."snapshot_before")
       OR (OLD."snapshot_after" IS NOT NULL AND NEW."snapshot_after" IS DISTINCT FROM OLD."snapshot_after") THEN
      RAISE EXCEPTION 'the grace and the snapshots of a transfer are written once'
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
     OR NEW."recorded_by_ticket_id" IS DISTINCT FROM OLD."recorded_by_ticket_id"
     OR NEW."recorded_at" IS DISTINCT FROM OLD."recorded_at" THEN
    RAISE EXCEPTION 'who is moved, from where to where, and who recorded it never change'
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN NEW;
END;
$$;
