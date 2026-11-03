-- QĐ-93 phase 2 (`qd93-remove-department-projects`): drops the projects of a department. Nothing reads them any more, but a row is
-- still data: the migration stops while any remains and never deletes it of its own accord.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "project_departments") OR EXISTS (SELECT 1 FROM "projects") THEN
    RAISE EXCEPTION 'Cannot drop projects: rows remain in projects or project_departments; this drop is for an installation that never used projects'
      USING ERRCODE = 'P0001';
  END IF;
END $$;

DROP TABLE "project_departments";
DROP TABLE "projects";
DROP TYPE "ProjectStatus";

