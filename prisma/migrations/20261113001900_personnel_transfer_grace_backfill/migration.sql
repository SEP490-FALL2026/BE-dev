-- MF-3 (m-17, QĐ-110p, QĐ-110r, QĐ-111bg, SPEC §6, MF3-B.2, D-82): the transfers that took effect before this release get the grace of the old
-- rights from the day of the release. From now on the system closes a transfer once every old right is taken back, and no one can close it by
-- hand; a transfer without a grace would stay open forever, and the record of a new transfer of the person is refused while one is open
-- (409 `TRANSFER_SETTLING`).
--
-- The scope is the very definition of "not closed" the refusal uses: `status = 'EFFECTIVE' AND closed_at IS NULL`. It holds three kinds, which
-- the old release left in three states, and all three get the same grace:
--   (i)   no review at all: the person held no seat when the transfer took effect, so the old code opened none;
--   (ii)  a review still open: the new head never decided it (the way to decide is gone);
--   (iii) a review decided or superseded, but the transfer not closed by the IT Admin.
-- The grace begins on the day of the release (`graceStartsOn`: the later of the day the transfer took effect and the day the system notes it, here
-- always the release) and ends on the `TRANSFER_GRACE_WORKING_DAYS`th working day counting that day as day 1; the reminder is
-- `TRANSFER_GRACE_REMINDER_WORKING_DAYS` working days before the end, never before the first working day (the code of the policy does the same).
-- A review still open ends as `SUPERSEDED` (nothing is deleted); a transfer that waits, is cancelled or was closed by an IT Admin is not touched,
-- nor is the review of another transfer. No seat, task or notice is written here: the sweeper of MF3-C tells the person and takes the rights back.
-- Safe to run twice: only a transfer without a grace is given one, and a review that ended is not touched.

-- The working day number `n` counting `start` as day 1: `start` itself when it is a working day, else the next one. Saturday, Sunday and the
-- days off of the organization do not count. The window of 400 days holds the largest `n` the parameter allows (30) with the days off between.
CREATE OR REPLACE FUNCTION pg_temp.slm_nth_working_day_from(start date, n integer, org uuid) RETURNS date
LANGUAGE sql STABLE AS $$
    SELECT days."day"
      FROM (SELECT start + k AS "day" FROM generate_series(0, 400) AS k) days
     WHERE extract(isodow FROM days."day") < 6
       AND NOT EXISTS (
           SELECT 1 FROM "non_working_dates" d WHERE d."organization_id" = org AND d."date" = days."day"
       )
     ORDER BY days."day"
    OFFSET n - 1 LIMIT 1
$$;

-- The working day `n` working days before `last_day`, which is not counted (the code does `addWorkingDays(last_day, -n)`).
CREATE OR REPLACE FUNCTION pg_temp.slm_working_days_before(last_day date, n integer, org uuid) RETURNS date
LANGUAGE sql STABLE AS $$
    SELECT days."day"
      FROM (SELECT last_day - k AS "day" FROM generate_series(1, 400) AS k) days
     WHERE extract(isodow FROM days."day") < 6
       AND NOT EXISTS (
           SELECT 1 FROM "non_working_dates" d WHERE d."organization_id" = org AND d."date" = days."day"
       )
     ORDER BY days."day" DESC
    OFFSET n - 1 LIMIT 1
$$;

-- The value of an integer parameter of the organization, or the default of the definition when none is set.
CREATE OR REPLACE FUNCTION pg_temp.slm_parameter(org uuid, parameter_key text, fallback integer) RETURNS integer
LANGUAGE sql STABLE AS $$
    SELECT COALESCE((
        SELECT (p."value" #>> '{}')::integer FROM "parameter_values" p
         WHERE p."organization_id" = org AND p."key" = parameter_key AND p."valid_to" IS NULL
         ORDER BY p."valid_from" DESC LIMIT 1
    ), fallback)
$$;

DO $$
DECLARE
  scope integer;
  without_review integer;
  with_open_review integer;
  with_finished_review integer;
  given integer;
  reviews_ended integer;
  reviews_elsewhere integer;
  still_without integer;
BEGIN
  -- A release that still runs cannot write a transfer or a review between the count and the update: writers wait, readers do not.
  LOCK TABLE "department_transfers" IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE "transfer_reviews" IN SHARE ROW EXCLUSIVE MODE;

  -- What is given a grace now: not closed and without one. The kind of each is read once, before anything changes.
  CREATE TEMPORARY TABLE slm_grace_scope ON COMMIT DROP AS
  SELECT t."id", t."organization_id", t."effective_on",
         EXISTS (SELECT 1 FROM "transfer_reviews" r WHERE r."transfer_id" = t."id" AND r."status" = 'OPEN') AS has_open_review,
         EXISTS (SELECT 1 FROM "transfer_reviews" r WHERE r."transfer_id" = t."id") AS has_review
    FROM "department_transfers" t
   WHERE t."status" = 'EFFECTIVE' AND t."closed_at" IS NULL AND t."grace_ends_on" IS NULL;

  SELECT count(*), count(*) FILTER (WHERE NOT has_review), count(*) FILTER (WHERE has_open_review),
         count(*) FILTER (WHERE has_review AND NOT has_open_review)
    INTO scope, without_review, with_open_review, with_finished_review
    FROM slm_grace_scope;

  -- The guard of the table lets these columns be written once, on a transfer that took effect and is not closed.
  UPDATE "department_transfers" t
     SET "grace_ends_on" = g."ends_on",
         "grace_reminder_on" = GREATEST(
           pg_temp.slm_nth_working_day_from(g."starts_on", 1, s."organization_id"),
           pg_temp.slm_working_days_before(
             g."ends_on", pg_temp.slm_parameter(s."organization_id", 'TRANSFER_GRACE_REMINDER_WORKING_DAYS', 2), s."organization_id")
         )
    FROM slm_grace_scope s
    CROSS JOIN LATERAL (
      SELECT GREATEST(s."effective_on", (now() AT TIME ZONE o."time_zone")::date) AS "starts_on"
        FROM "organizations" o WHERE o."id" = s."organization_id"
    ) b
    CROSS JOIN LATERAL (
      SELECT b."starts_on",
             pg_temp.slm_nth_working_day_from(
               b."starts_on", pg_temp.slm_parameter(s."organization_id", 'TRANSFER_GRACE_WORKING_DAYS', 5), s."organization_id") AS "ends_on"
    ) g
   WHERE t."id" = s."id";
  GET DIAGNOSTICS given = ROW_COUNT;

  -- Said in the Audit Trail by the system, once for each transfer (the key of the event is the transfer).
  INSERT INTO "audit_events" (
      "id", "organization_id", "actor_kind", "actor_app_user_id", "actor_roles", "action", "resource_type", "resource_id",
      "before", "after", "correlation_id"
  )
  SELECT gen_random_uuid(), t."organization_id", 'SYSTEM', NULL, '{}', 'DEPARTMENT_TRANSFER.GRACE_OPENED', 'DepartmentTransfer',
         t."id"::text, jsonb_build_object('graceEndsOn', NULL),
         jsonb_build_object('graceEndsOn', to_char(t."grace_ends_on", 'YYYY-MM-DD'),
                            'graceReminderOn', to_char(t."grace_reminder_on", 'YYYY-MM-DD'),
                            'rule', 'the transfer took effect before the release; the grace begins on the day of the release (m-17)'),
         '20261113001900_personnel_transfer_grace_backfill'
    FROM "department_transfers" t
    JOIN slm_grace_scope s ON s."id" = t."id";

  -- The open reviews of those transfers end: nobody can decide them any more, and the transfer is settled by the grace.
  UPDATE "transfer_reviews" r SET "status" = 'SUPERSEDED'
   WHERE r."status" = 'OPEN' AND r."transfer_id" IN (SELECT "id" FROM slm_grace_scope);
  GET DIAGNOSTICS reviews_ended = ROW_COUNT;

  SELECT count(*) INTO reviews_elsewhere FROM "transfer_reviews" WHERE "status" = 'OPEN';
  SELECT count(*) INTO still_without FROM "department_transfers"
   WHERE "status" = 'EFFECTIVE' AND "closed_at" IS NULL AND "grace_ends_on" IS NULL;

  RAISE NOTICE 'transfers that took effect and are not closed: %, without a review: %, with an open review: %, with a decided or superseded review: %, given a grace: %, open reviews ended: %, open reviews of other transfers left: %, still without a grace: %',
    scope, without_review, with_open_review, with_finished_review, given, reviews_ended, reviews_elsewhere, still_without;
  IF still_without <> 0 THEN
    RAISE EXCEPTION 'Transfers that took effect are still without a grace (not closed %, given %, without %)', scope, given, still_without;
  END IF;
END $$;
