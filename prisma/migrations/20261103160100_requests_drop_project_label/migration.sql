UPDATE "access_requests"
   SET "policy" = jsonb_set("policy", '{draft}', ("policy"->'draft') - 'projectLabel')
 WHERE "state" = 'DRAFT' AND ("policy"->'draft') ? 'projectLabel';

ALTER TABLE "access_requests" DROP COLUMN "project_label";

