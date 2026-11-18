-- QĐ-104e(3), R-I10: a department takes effect on a day (the first of the next year for one made in the budgeting period).
-- Departments that exist take effect on the earliest day their own history shows, so no dated row predates the department.
ALTER TABLE "departments" ADD COLUMN "effective_from" DATE;

UPDATE "departments" d
SET "effective_from" = LEAST(
  (d."created_at" AT TIME ZONE COALESCE((SELECT o."time_zone" FROM "organizations" o WHERE o."id" = d."organization_id"), 'UTC'))::date,
  COALESCE((SELECT MIN(p."valid_from") FROM "employee_placements" p WHERE p."department_id" = d."id"), 'infinity'::date),
  COALESCE((SELECT MIN(h."valid_from") FROM "department_head_periods" h WHERE h."department_id" = d."id"), 'infinity'::date)
);

-- A department written without a day takes effect today (the installation path); the application always names the day.
ALTER TABLE "departments" ALTER COLUMN "effective_from" SET DEFAULT CURRENT_DATE;
ALTER TABLE "departments" ALTER COLUMN "effective_from" SET NOT NULL;
