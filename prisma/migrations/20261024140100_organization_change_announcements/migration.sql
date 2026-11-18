-- The changes of the organization that have been told to the modules that act on them (FR-3.16, US-03-01 AC-7): a person who
-- starts a new placement, a head period that starts or ends, a person who has left. One row for each change, whoever tells
-- it (the transaction of the change itself, or the hourly sweep for a change dated for a day to come), so a change is told
-- exactly once. The id of the row is the identity of the change the listeners see.

-- CreateEnum
CREATE TYPE "OrganizationChangeKind" AS ENUM ('PLACEMENT_START', 'HEAD_PERIOD_START', 'HEAD_PERIOD_END', 'EMPLOYEE_LEFT');

-- CreateTable
CREATE TABLE "organization_change_announcements" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "kind" "OrganizationChangeKind" NOT NULL,
    "subject_id" UUID NOT NULL,
    "effective_on" DATE NOT NULL,
    "announced_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_change_announcements_pkey" PRIMARY KEY ("id")
);

-- The placement, the head period or the employee the change is about is told once for each kind.
-- CreateIndex
CREATE UNIQUE INDEX "organization_change_announcements_kind_subject_id_key" ON "organization_change_announcements"("kind", "subject_id");

-- AddForeignKey
ALTER TABLE "organization_change_announcements"
  ADD CONSTRAINT "organization_change_announcements_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- What the organization already had counts as told: nobody is told of the history that exists at the migration. Only what has
-- taken effect is marked; a head period dated for a day to come is told when its day comes.
INSERT INTO "organization_change_announcements" ("id", "organization_id", "kind", "subject_id", "effective_on")
SELECT gen_random_uuid(), p."organization_id", 'PLACEMENT_START', p."id", p."valid_from"
  FROM "employee_placements" p
 WHERE p."valid_from" <= CURRENT_DATE
   AND EXISTS (SELECT 1 FROM "employee_placements" q WHERE q."employee_id" = p."employee_id" AND q."valid_to" = p."valid_from");

INSERT INTO "organization_change_announcements" ("id", "organization_id", "kind", "subject_id", "effective_on")
SELECT gen_random_uuid(), h."organization_id", 'HEAD_PERIOD_START', h."id", h."valid_from"
  FROM "department_head_periods" h WHERE h."valid_from" <= CURRENT_DATE;

INSERT INTO "organization_change_announcements" ("id", "organization_id", "kind", "subject_id", "effective_on")
SELECT gen_random_uuid(), h."organization_id", 'HEAD_PERIOD_END', h."id", h."valid_to"
  FROM "department_head_periods" h WHERE h."valid_to" IS NOT NULL AND h."valid_to" <= CURRENT_DATE;

-- A told change is a fact, and so is the history it was about: the department and the title of a placement, and whose it is,
-- never change; a placement that was told is neither deleted nor moved to another day. The only thing a placement ever gets
-- afterwards is its end. A placement dated for a day to come that was never told may still be removed or moved (that is how a
-- transfer that has not taken effect is moved or cancelled).
CREATE FUNCTION employee_placements_keep_history() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (
      SELECT 1 FROM "organization_change_announcements" a
       WHERE a."kind" = 'PLACEMENT_START' AND a."subject_id" = OLD."id"
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

CREATE TRIGGER "employee_placements_history_guard"
  BEFORE UPDATE OR DELETE ON "employee_placements"
  FOR EACH ROW EXECUTE FUNCTION employee_placements_keep_history();
