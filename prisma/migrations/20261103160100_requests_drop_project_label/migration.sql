-- QĐ-93 phase 2 (`qd93-remove-department-projects`): drops the free-text project label of a request. A label that a sent request
-- carries is data of that request and is lost with the column, so the migration stops and lists every such request instead
-- (it never clears anything of its own accord). The label a draft keeps in its JSON is not carried by the Request and is cleaned.
DO $$
DECLARE
  problems text;
BEGIN
  SELECT string_agg('PROJECT_LABEL request ' || r."id"::text, E'\n' ORDER BY r."id") INTO problems
    FROM "access_requests" r
   WHERE r."project_label" IS NOT NULL AND r."state" <> 'DRAFT';

  IF problems IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot drop access_requests.project_label: requests that were sent still carry a label:%', E'\n' || problems
      USING ERRCODE = 'P0001';
  END IF;
END $$;

UPDATE "access_requests"
   SET "policy" = jsonb_set("policy", '{draft}', ("policy"->'draft') - 'projectLabel')
 WHERE "state" = 'DRAFT' AND ("policy"->'draft') ? 'projectLabel';

ALTER TABLE "access_requests" DROP COLUMN "project_label";

