-- The department the installation created with the organization is marked: no IT Admin takes over its work for being without one
-- (it has only the Super Admin by design), so it stays out of the common queue and out of an IT Admin's list unless named for it.
ALTER TABLE "departments" ADD COLUMN "is_starting" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: the installation writes the organization and its first department in one transaction, so the first department of each
-- organization (earliest created, then lowest id) is the one it made.
UPDATE "departments" d SET "is_starting" = true
 WHERE d."id" = (SELECT f."id" FROM "departments" f WHERE f."organization_id" = d."organization_id" ORDER BY f."created_at", f."id" LIMIT 1);

CREATE UNIQUE INDEX "departments_one_starting" ON "departments" ("organization_id") WHERE "is_starting";
