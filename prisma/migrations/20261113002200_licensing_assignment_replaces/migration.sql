-- MF-3 (R-49, QĐ-110q, SPEC MF3-C.4): a person in the grace of a transfer asked again, on the same subscription, for software they hold, and the grant of the new
-- right ends the old one the day it is given. The new right names the one it replaced, so the old right is read as given again (P7 `regranted`, the picture
-- of the closing) and is not taken back when the grace ends. Expand only: one nullable column on the new right, one foreign key, one index; no row changes,
-- nothing is dropped, and the old right is ended through its own `valid_until` (the one column the guard of the table lets change). Safe to run twice.

ALTER TABLE "license_assignments" ADD COLUMN IF NOT EXISTS "replaces_assignment_id" UUID;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'license_assignments_replaces_assignment_id_fkey') THEN
    ALTER TABLE "license_assignments" ADD CONSTRAINT "license_assignments_replaces_assignment_id_fkey"
      FOREIGN KEY ("replaces_assignment_id") REFERENCES "license_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END
$$;

-- A right never replaces itself, and only a request writes one (each column asked on its own: a CHECK passes on NULL).
ALTER TABLE "license_assignments" DROP CONSTRAINT IF EXISTS "license_assignments_replaces_check";
ALTER TABLE "license_assignments" ADD CONSTRAINT "license_assignments_replaces_check" CHECK (
  "replaces_assignment_id" IS NULL
  OR ("replaces_assignment_id" <> "id" AND "source" = 'REQUEST')
);

CREATE INDEX IF NOT EXISTS "license_assignments_replaces_assignment_id_idx" ON "license_assignments" ("replaces_assignment_id");
