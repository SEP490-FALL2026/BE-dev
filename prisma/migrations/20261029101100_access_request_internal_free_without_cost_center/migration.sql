-- A free internal request does not need a Cost Center (g0-g6-final-business-baseline-remediation, F91; QĐ-87g(2)). A department
-- without a Cost Center in use still sends a request for internal software that costs nothing (branch a): nothing is charged, so
-- nothing is attributed. `20261029100500_access_request_draft` allowed a missing Cost Center only for a draft; this widens the
-- same CHECK to "a draft, a free internal request, or a request charged to a Cost Center". Every request that costs money (paid
-- or proposed software) still carries the Cost Center it is charged to, and so does the request of a service account: the seat it
-- ends in is charged to the Unit of its department (`license_assignments_service_has_reason_and_cost_center`, QĐ-86a).
--
-- Only a relaxation: every row that satisfied the old CHECK satisfies this one, and the migration stops if the CHECK is not in the
-- shape it extends. The compatibility image never writes a request without a Cost Center, so it stays valid when writing. What it
-- does NOT do is read one: it types `access_requests.cost_center_id` as required, so a request this release writes without a
-- Cost Center is unreadable by that image (P04-CPE-04, a real-release rollback condition recorded in the impact matrix, §3.11).

DO $$
DECLARE
    old_definition TEXT;
BEGIN
    SELECT pg_get_constraintdef(c."oid") INTO old_definition
      FROM pg_constraint c
     WHERE c."conrelid" = 'access_requests'::regclass AND c."conname" = 'access_requests_cost_center_unless_draft';
    IF old_definition IS NULL
       OR position('DRAFT' IN old_definition) = 0
       OR position('cost_center_id IS NOT NULL' IN old_definition) = 0
       OR position('branch' IN old_definition) > 0 THEN
        RAISE EXCEPTION 'access_requests_cost_center_unless_draft is not in the shape this migration extends: %', old_definition;
    END IF;
END
$$;

ALTER TABLE "access_requests" DROP CONSTRAINT "access_requests_cost_center_unless_draft";
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_cost_center_unless_draft" CHECK (
    "state" = 'DRAFT'
    OR "cost_center_id" IS NOT NULL
    OR ("branch" = 'INTERNAL_FREE' AND "type" <> 'SERVICE_ACCOUNT')
);
