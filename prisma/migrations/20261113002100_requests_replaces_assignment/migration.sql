-- MF-3 (QĐ-110q, R-49, SPEC P10, MF3-C.3): a person in the grace of a transfer who asks again for software they hold is left out of GH-1/GH-2
-- (`limit_exemption = 'TRANSFER_GRACE'`), and the request names the old right it replaces, so the grant can end that right the day it
-- is given on the same subscription (MF3-C.4). Expand only: one nullable column, one check widened; nothing is dropped and no row
-- changes. Safe to run twice.
--
-- `replaces_assignment_id` is internal (not in the body of the request): the old right of the person the request is for, held from before the
-- transfer. It exists only beside the exemption of the grace.

ALTER TABLE "access_requests" ADD COLUMN IF NOT EXISTS "replaces_assignment_id" UUID;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'access_requests_replaces_assignment_id_fkey') THEN
    ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_replaces_assignment_id_fkey"
      FOREIGN KEY ("replaces_assignment_id") REFERENCES "license_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END
$$;

-- The exemption known to the table gains the grace of a transfer (the overlap of a transfer of the old rule is kept: nothing wrote it, and a
-- constraint is never narrowed under rows). The request and the line of a group share the list.
ALTER TABLE "access_requests" DROP CONSTRAINT IF EXISTS "access_requests_limit_exemption_known";
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_limit_exemption_known" CHECK (
  "limit_exemption" IS NULL OR "limit_exemption" IN ('TRANSFER_OVERLAP', 'TRANSFER_GRACE', 'ROLE_ENDED')
);
ALTER TABLE "access_request_lines" DROP CONSTRAINT IF EXISTS "access_request_lines_limit_exemption_known";
ALTER TABLE "access_request_lines" ADD CONSTRAINT "access_request_lines_limit_exemption_known" CHECK (
  "limit_exemption" IS NULL OR "limit_exemption" IN ('TRANSFER_OVERLAP', 'TRANSFER_GRACE', 'ROLE_ENDED')
);

-- The old right is named only by a request left out of the limits for the grace of a transfer (each column asked on its own: a CHECK passes on NULL).
ALTER TABLE "access_requests" DROP CONSTRAINT IF EXISTS "access_requests_replaces_assignment_check";
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_replaces_assignment_check" CHECK (
  "replaces_assignment_id" IS NULL
  OR ("limit_exemption" IS NOT NULL AND "limit_exemption" = 'TRANSFER_GRACE')
);
