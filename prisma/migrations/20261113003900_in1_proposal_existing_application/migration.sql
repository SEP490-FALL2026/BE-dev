-- IN-1.1 (QĐ-111a, SPEC FE IN-1): case B, short. A proposal of software the catalog already has, but not the plan asked for, names the application of the
-- catalog; the IT Admin then assesses the plan alone. Expand only: one nullable column, its foreign key and an index on it; every row stands as it was (none
-- names an application) and nothing is dropped. Safe to run twice.

ALTER TABLE "access_request_proposals" ADD COLUMN IF NOT EXISTS "existing_application_id" UUID;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'access_request_proposals_existing_application_id_fkey') THEN
    ALTER TABLE "access_request_proposals" ADD CONSTRAINT "access_request_proposals_existing_application_id_fkey"
      FOREIGN KEY ("existing_application_id") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "access_request_proposals_existing_application_id_idx"
  ON "access_request_proposals"("existing_application_id");
