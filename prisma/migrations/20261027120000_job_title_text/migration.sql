-- Compatibility step of the free-text job title (`g0-g6-final-business-baseline-remediation`, Task 1.3a, F03, F41; `QĐ-87e`,
-- spec L.4 and L.10). The job title is a free text on the person; the catalogue `job_titles` and the four `job_title_id`
-- columns are removed by the release after this one. This migration only adds and relaxes, so the release that ran before it
-- (which names a catalogue entry on every placement, transfer and review) keeps working on the new schema, and so does the
-- release it recovers to after a failed deploy:
--
--   * `employees.job_title` holds the title of the person (copied below);
--   * the four `job_title_id` columns accept NULL (the compatibility release no longer names a catalogue entry);
--   * `employees_job_title_forward` copies the title of a placement the previous release writes onto a person that has none;
--   * `job_title_id_backfill` gives the row of the compatibility release the catalogue entry its title names, so the
--     previous release reads it through its own join.
--
-- No trigger, CHECK or NOT NULL here refuses a write the previous release makes.

-- The name rules of `src/core/display-name.ts` and `…/job-title-name.ts` in SQL, the whitespace set written out as the
-- `20261016130000_job_title_lifecycle` migration does (PostgreSQL's own `\s` does not cover the no-break and ideographic spaces).
CREATE FUNCTION job_title_display_name(raw text) RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT regexp_replace(regexp_replace(normalize(raw, NFC),
    '^[\t\n\v\f\r    -     　﻿]+|[\t\n\v\f\r    -     　﻿]+$', '', 'g'),
    '[\t\n\v\f\r    -     　﻿]+', ' ', 'g')
$$;

-- AlterTable
ALTER TABLE "employees" ADD COLUMN "job_title" TEXT;
ALTER TABLE "employees"
  ADD CONSTRAINT "employees_job_title_shape" CHECK ("job_title" IS NULL OR char_length("job_title") BETWEEN 1 AND 255);

-- The title of the current period of each person: the placement with the latest `valid_from` on or before the day the
-- migration runs (in the organization's own calendar), else the earliest one. It is the name the catalogue entry has now
-- (`job_titles` keeps no history of names).
UPDATE "employees" e
   SET "job_title" = left(NULLIF(job_title_display_name(t."name"), ''), 255)
  FROM (
    SELECT DISTINCT ON (p."employee_id") p."employee_id", p."job_title_id"
      FROM "employee_placements" p
      JOIN "employees" x ON x."id" = p."employee_id"
      JOIN "organizations" o ON o."id" = x."organization_id"
     ORDER BY p."employee_id",
              (p."valid_from" <= (now() AT TIME ZONE o."time_zone")::date) DESC,
              CASE WHEN p."valid_from" <= (now() AT TIME ZONE o."time_zone")::date THEN p."valid_from" END DESC NULLS LAST,
              p."valid_from" ASC
  ) current_period
  JOIN "job_titles" t ON t."id" = current_period."job_title_id"
 WHERE e."id" = current_period."employee_id";

-- AlterTable: the compatibility release names no catalogue entry (a trigger below fills it for the release before it).
ALTER TABLE "employee_placements" ALTER COLUMN "job_title_id" DROP NOT NULL;
ALTER TABLE "department_transfers" ALTER COLUMN "from_job_title_id" DROP NOT NULL;
ALTER TABLE "department_transfers" ALTER COLUMN "to_job_title_id" DROP NOT NULL;
ALTER TABLE "transfer_reviews" ALTER COLUMN "job_title_id" DROP NOT NULL;

-- A placement the previous release writes names its catalogue entry; the person has no free-text title yet: copy the name
-- once. A title the person already has is never overwritten (the compatibility release typed it).
CREATE FUNCTION employees_job_title_forward() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."job_title_id" IS NOT NULL THEN
    UPDATE "employees" e
       SET "job_title" = left(NULLIF(job_title_display_name(t."name"), ''), 255)
      FROM "job_titles" t
     WHERE e."id" = NEW."employee_id" AND e."job_title" IS NULL AND t."id" = NEW."job_title_id";
  END IF;

  RETURN NULL;
END;
$$;

CREATE TRIGGER "employees_job_title_forward"
  AFTER INSERT ON "employee_placements"
  FOR EACH ROW EXECUTE FUNCTION employees_job_title_forward();

-- The catalogue entry the free-text title of a person names: the one whose normalized name matches (whatever its status),
-- else a new ACTIVE one. Two writes of the same new title meet on the unique key and read the entry the first made.
-- NULL when the person has no title.
CREATE FUNCTION job_title_id_of_employee(employee uuid) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
  org uuid;
  title text;
  normalized text;
  entry_id uuid;
BEGIN
  SELECT e."organization_id", job_title_display_name(e."job_title") INTO org, title FROM "employees" e WHERE e."id" = employee;
  IF title IS NULL OR title = '' THEN
    RETURN NULL;
  END IF;
  normalized := lower(title);
  SELECT t."id" INTO entry_id FROM "job_titles" t WHERE t."organization_id" = org AND t."normalized_name" = normalized;
  IF entry_id IS NULL THEN
    INSERT INTO "job_titles" ("id", "organization_id", "name", "normalized_name", "status", "version", "created_at", "updated_at")
    VALUES (gen_random_uuid(), org, title, normalized, 'ACTIVE', 1, now(), now())
    ON CONFLICT ("organization_id", "normalized_name") DO NOTHING;
    SELECT t."id" INTO entry_id FROM "job_titles" t WHERE t."organization_id" = org AND t."normalized_name" = normalized;
  END IF;

  RETURN entry_id;
END;
$$;

-- A row the compatibility release writes has no catalogue entry: a placement and a transfer take the one of the person,
-- and a review the one of its placement (the compatibility release changes department only, so a transfer keeps the title).
-- A row that names its entry, as the previous release writes it, is left as it is.
CREATE FUNCTION job_title_id_backfill() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  entry uuid;
BEGIN
  IF TG_TABLE_NAME = 'employee_placements' THEN
    IF NEW."job_title_id" IS NULL THEN
      NEW."job_title_id" := job_title_id_of_employee(NEW."employee_id");
    END IF;
  ELSIF TG_TABLE_NAME = 'department_transfers' THEN
    IF NEW."from_job_title_id" IS NULL OR NEW."to_job_title_id" IS NULL THEN
      entry := job_title_id_of_employee(NEW."employee_id");
      NEW."from_job_title_id" := COALESCE(NEW."from_job_title_id", entry);
      NEW."to_job_title_id" := COALESCE(NEW."to_job_title_id", entry);
    END IF;
  ELSIF TG_TABLE_NAME = 'transfer_reviews' THEN
    IF NEW."job_title_id" IS NULL THEN
      SELECT p."job_title_id" INTO entry FROM "employee_placements" p WHERE p."id" = NEW."placement_id";
      NEW."job_title_id" := COALESCE(entry, job_title_id_of_employee(NEW."employee_id"));
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "job_title_id_backfill"
  BEFORE INSERT ON "employee_placements"
  FOR EACH ROW EXECUTE FUNCTION job_title_id_backfill();
CREATE TRIGGER "job_title_id_backfill"
  BEFORE INSERT ON "department_transfers"
  FOR EACH ROW EXECUTE FUNCTION job_title_id_backfill();
CREATE TRIGGER "job_title_id_backfill"
  BEFORE INSERT ON "transfer_reviews"
  FOR EACH ROW EXECUTE FUNCTION job_title_id_backfill();
