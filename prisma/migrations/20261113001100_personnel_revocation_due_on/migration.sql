-- MF-2 (QĐ-110c, M-09): the deadline of the revocations of a departure is kept on the case, not on each task. `revocation_due_on` is the
-- `DEPARTURE_REVOCATION_WORKING_DAYS`th working day counting the day after the last working day as day 1 (the code of the policy
-- `revocationDueOn` does the same). Expand only: the column is nullable (a case that was closed or cancelled before the rule has no deadline
-- and is never told as late), nothing is dropped, and no seat, task or notice is changed. Safe to run twice: the column and the check are
-- added if absent and only a case without a deadline is filled.

ALTER TABLE "offboarding_cases" ADD COLUMN IF NOT EXISTS "revocation_due_on" DATE;

-- The deadline is after the last working day. Each column is asked on its own: a CHECK passes on NULL.
ALTER TABLE "offboarding_cases" DROP CONSTRAINT IF EXISTS "offboarding_cases_revocation_due_check";
ALTER TABLE "offboarding_cases" ADD CONSTRAINT "offboarding_cases_revocation_due_check" CHECK (
  "revocation_due_on" IS NULL
  OR ("last_working_day" IS NOT NULL AND "revocation_due_on" > "last_working_day")
);

-- The working day number `working_days` from the day after `last_day`: Saturday, Sunday and the days off of the organization do not count.
-- The window of 120 days holds the largest number the parameter allows (10) with the days off in between.
CREATE OR REPLACE FUNCTION pg_temp.slm_revocation_due_on(last_day date, working_days integer, org uuid) RETURNS date
LANGUAGE sql STABLE AS $$
    SELECT days."day"
      FROM (SELECT last_day + 1 + k AS "day" FROM generate_series(0, 120) AS k) days
     WHERE extract(isodow FROM days."day") < 6
       AND NOT EXISTS (
           SELECT 1 FROM "non_working_dates" n WHERE n."organization_id" = org AND n."date" = days."day"
       )
     ORDER BY days."day"
    OFFSET working_days - 1 LIMIT 1
$$;

DO $$
DECLARE
  open_cases integer;
  filled integer;
  still_without integer;
BEGIN
  -- A release that still runs cannot write a case between the count and the update: writers wait, readers do not.
  LOCK TABLE "offboarding_cases" IN SHARE ROW EXCLUSIVE MODE;
  SELECT count(*) INTO open_cases FROM "offboarding_cases"
   WHERE "state" IN ('HANDING_OVER', 'LEFT') AND "closed_at" IS NULL;

  -- Only the cases that are still open get a deadline; the trigger of the table lets this column change on a case that has left.
  UPDATE "offboarding_cases" c
     SET "revocation_due_on" = pg_temp.slm_revocation_due_on(
           c."last_working_day",
           COALESCE((
             SELECT (p."value" #>> '{}')::integer FROM "parameter_values" p
              WHERE p."organization_id" = c."organization_id"
                AND p."key" = 'DEPARTURE_REVOCATION_WORKING_DAYS' AND p."valid_to" IS NULL
              ORDER BY p."valid_from" DESC LIMIT 1
           ), 1),
           c."organization_id")
   WHERE c."state" IN ('HANDING_OVER', 'LEFT') AND c."closed_at" IS NULL AND c."revocation_due_on" IS NULL;
  GET DIAGNOSTICS filled = ROW_COUNT;

  SELECT count(*) INTO still_without FROM "offboarding_cases"
   WHERE "state" IN ('HANDING_OVER', 'LEFT') AND "closed_at" IS NULL AND "revocation_due_on" IS NULL;
  RAISE NOTICE 'open departures: %, given a revocation deadline: %, still without: %', open_cases, filled, still_without;
  IF still_without <> 0 THEN
    RAISE EXCEPTION 'Open departures are still without a revocation deadline (open %, filled %, without %)', open_cases, filled, still_without;
  END IF;
END $$;
