-- MF-3 (QĐ-110p, QĐ-110r, QĐ-111bg, SPEC §6, MF3-B.1): the grace of the old rights of a transferred person is kept on the transfer. Expand only:
-- every column is nullable or has a default, nothing is dropped, no seat, task or notice is changed, and no transfer gets a grace here (the
-- next migration gives it to the ones that took effect before this release). Safe to run twice: columns and checks are added if absent.
--
-- `grace_ends_on` is the last day the person keeps the rights of the old department, `grace_reminder_on` the day they are told once more,
-- `reminded_at` when that was done. `snapshot_before` is what the person held when the transfer took effect and `snapshot_after` what is left
-- of it when the transfer closes (codec `transfer-snapshot.json.ts`). `closed_by_system` says the system closed it (no account did): the
-- transfers closed by an IT Admin before the rule keep their account.

ALTER TABLE "department_transfers"
  ADD COLUMN IF NOT EXISTS "grace_ends_on" DATE,
  ADD COLUMN IF NOT EXISTS "grace_reminder_on" DATE,
  ADD COLUMN IF NOT EXISTS "reminded_at" TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS "snapshot_before" JSONB,
  ADD COLUMN IF NOT EXISTS "snapshot_after" JSONB,
  ADD COLUMN IF NOT EXISTS "closed_by_system" BOOLEAN NOT NULL DEFAULT false;

-- The two days of the grace come together, only on a transfer that took effect, and neither is before the day it took effect; the reminder is
-- not after the end. Each column is asked on its own: a CHECK passes on NULL.
ALTER TABLE "department_transfers" DROP CONSTRAINT IF EXISTS "department_transfers_grace_check";
ALTER TABLE "department_transfers" ADD CONSTRAINT "department_transfers_grace_check" CHECK (
  ("grace_ends_on" IS NULL AND "grace_reminder_on" IS NULL AND "reminded_at" IS NULL)
  OR (
    "grace_ends_on" IS NOT NULL AND "grace_reminder_on" IS NOT NULL
    AND "status" = 'EFFECTIVE'
    AND "grace_ends_on" >= "effective_on"
    AND "grace_reminder_on" >= "effective_on"
    AND "grace_reminder_on" <= "grace_ends_on"
  )
);

-- The snapshots are objects; the one before exists only on a transfer that took effect, the one after only on a transfer that closed.
ALTER TABLE "department_transfers" DROP CONSTRAINT IF EXISTS "department_transfers_snapshot_check";
ALTER TABLE "department_transfers" ADD CONSTRAINT "department_transfers_snapshot_check" CHECK (
  ("snapshot_before" IS NULL OR ("status" = 'EFFECTIVE' AND jsonb_typeof("snapshot_before") = 'object'))
  AND ("snapshot_after" IS NULL OR ("closed_at" IS NOT NULL AND jsonb_typeof("snapshot_after") = 'object'))
);

-- Closing: by an account (a transfer closed by an IT Admin before the rule) or by the system, never both and never neither.
ALTER TABLE "department_transfers" DROP CONSTRAINT IF EXISTS "department_transfers_closure_check";
ALTER TABLE "department_transfers" ADD CONSTRAINT "department_transfers_closure_check" CHECK (
  ("closed_at" IS NULL AND "closed_by_app_user_id" IS NULL AND NOT "closed_by_system")
  OR (
    "closed_at" IS NOT NULL AND "status" = 'EFFECTIVE'
    AND (
      ("closed_by_system" AND "closed_by_app_user_id" IS NULL)
      OR (NOT "closed_by_system" AND "closed_by_app_user_id" IS NOT NULL)
    )
  )
);

-- The guard of 20261024190100 (as 20261029100700 extended it) with the settlement of a transfer that took effect: until it closes, only the
-- columns the settlement writes change (the grace, the reminder, the snapshots, the closing), and the grace and the snapshots are written once.
-- A closed transfer, like a cancelled one, never changes again. A transfer that waits changes as before.
CREATE OR REPLACE FUNCTION department_transfers_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION 'department_transfers keeps its history (% rejected)', TG_OP
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD."status" = 'EFFECTIVE' AND OLD."closed_at" IS NULL THEN
    IF (to_jsonb(NEW) - 'grace_ends_on' - 'grace_reminder_on' - 'reminded_at' - 'snapshot_before' - 'snapshot_after'
          - 'closed_at' - 'closed_by_app_user_id' - 'closed_by_system')
       IS DISTINCT FROM
       (to_jsonb(OLD) - 'grace_ends_on' - 'grace_reminder_on' - 'reminded_at' - 'snapshot_before' - 'snapshot_after'
          - 'closed_at' - 'closed_by_app_user_id' - 'closed_by_system') THEN
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
