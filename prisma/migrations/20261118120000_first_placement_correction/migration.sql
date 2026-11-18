-- QĐ-113e: the Super Admin may correct the department of the first placement of a person while it starts after today.
-- Chosen: change department_id in place (one UPDATE) instead of delete + insert. It keeps the id of the placement, so nothing that could point
-- at it is orphaned, and employee_placements_keep_one (which guards DELETE of the only placement) is left exactly as it is.
--
-- employee_placements_keep_history is replaced with ONE added exception: a placement may change its department only when all of these hold
--   - it starts after today in the calendar of the organization (not yet in effect),
--   - it is the only placement of the person (the first one),
--   - no PLACEMENT_START announcement was made for it, and no department transfer opens or closes it.
-- Everything else it guards is unchanged: the person of a placement never changes, the department of any other placement never changes,
-- the first day of an announced placement never changes, and an announced or transferred placement is never deleted.
-- Who may call, the checks of the new values and what refers to the placement (Requests, head periods, departures) are the application's
-- (EmployeeFirstPlacementCorrectionService); the database only keeps the history that cannot be rewritten.
CREATE OR REPLACE FUNCTION employee_placements_keep_history() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_today date;
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

  IF NEW."employee_id" IS DISTINCT FROM OLD."employee_id" THEN
    RAISE EXCEPTION 'the person of a placement never changes'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  IF NEW."department_id" IS DISTINCT FROM OLD."department_id" THEN
    SELECT (now() AT TIME ZONE o."time_zone")::date INTO v_today
      FROM "organizations" o WHERE o."id" = OLD."organization_id";

    -- Without the organization there is no "today" to compare with: refuse rather than let the change through.
    IF v_today IS NULL THEN
      RAISE EXCEPTION 'the department of a placement cannot change: the organization of the placement is not found'
        USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    IF OLD."valid_from" <= v_today
       OR EXISTS (
         SELECT 1 FROM "employee_placements" p
          WHERE p."employee_id" = OLD."employee_id" AND p."id" <> OLD."id"
       )
       OR EXISTS (
         SELECT 1 FROM "organization_change_announcements" a
          WHERE a."kind" = 'PLACEMENT_START' AND a."subject_id" = OLD."id"
       )
       OR EXISTS (
         SELECT 1 FROM "department_transfers" t
          WHERE OLD."id" IN (t."closes_placement_id", t."opens_placement_id")
       ) THEN
      RAISE EXCEPTION 'the department of a placement never changes, except that of the first placement before it takes effect'
        USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
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
