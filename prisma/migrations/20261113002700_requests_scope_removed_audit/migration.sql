-- Audit B-2 (MF-2/MF-3 audit, 14/11/2026): `20261113000900_licensing_service_accounts_converted` closed the requests for a service account still
-- open (cause `SYSTEM_SCOPE_REMOVED`) and gave back what was held for them, but wrote no audit event for either. This writes, once, what the
-- application writes when the system cancels a request and releases a commitment: `ACCESS_REQUEST.CANCELLED` for each such request and
-- `BUDGET_COMMITMENT.RELEASED` for each commitment released for it, actor SYSTEM. Data only: no table, column or constraint changes. Safe to
-- run twice (a row that has its event is skipped). No notice is sent: the notices of the application come from its own writes, not from SQL.

INSERT INTO "audit_events" (
    "id", "organization_id", "actor_kind", "actor_app_user_id", "actor_roles", "action", "resource_type", "resource_id",
    "before", "after", "correlation_id"
)
SELECT gen_random_uuid(), r."organization_id", 'SYSTEM', NULL, '{}', 'ACCESS_REQUEST.CANCELLED', 'ACCESS_REQUEST', r."id"::text,
       NULL,
       jsonb_build_object(
           'requestId', r."id",
           'to', 'CANCELLED',
           'reasonKind', 'SYSTEM_SCOPE_REMOVED',
           'cancelledByEmployeeId', NULL,
           'commitmentsReleased', (SELECT count(*) FROM "budget_commitments" c WHERE c."request_id" = r."id" AND c."state" = 'RELEASED'),
           'rule', 'requests for a service account left the scope (QĐ-110m, R-9); written by 20261113000900, recorded by 20261113002700'
       ),
       '20261113002700_requests_scope_removed_audit'
  FROM "access_requests" r
 WHERE r."type" = 'SERVICE_ACCOUNT'
   AND r."state" = 'CANCELLED'
   AND r."cancel_cause" = 'SYSTEM_SCOPE_REMOVED'
   AND NOT EXISTS (
       SELECT 1 FROM "audit_events" e
        WHERE e."action" = 'ACCESS_REQUEST.CANCELLED' AND e."resource_type" = 'ACCESS_REQUEST' AND e."resource_id" = r."id"::text
   );

INSERT INTO "audit_events" (
    "id", "organization_id", "actor_kind", "actor_app_user_id", "actor_roles", "action", "resource_type", "resource_id",
    "before", "after", "correlation_id"
)
SELECT gen_random_uuid(), r."organization_id", 'SYSTEM', NULL, '{}', 'BUDGET_COMMITMENT.RELEASED', 'BUDGET_COMMITMENT', c."id"::text,
       NULL,
       jsonb_build_object(
           'requestId', r."id",
           'amountMinor', rel."amount_minor"::text,
           'reason', 'REQUEST_CANCELLED'
       ),
       '20261113002700_requests_scope_removed_audit'
  FROM "access_requests" r
  JOIN "budget_commitments" c ON c."request_id" = r."id"
  JOIN "budget_commitment_releases" rel ON rel."commitment_id" = c."id" AND rel."reason" = 'REQUEST_CANCELLED'
 WHERE r."type" = 'SERVICE_ACCOUNT'
   AND r."cancel_cause" = 'SYSTEM_SCOPE_REMOVED'
   AND NOT EXISTS (
       SELECT 1 FROM "audit_events" e
        WHERE e."action" = 'BUDGET_COMMITMENT.RELEASED' AND e."resource_type" = 'BUDGET_COMMITMENT' AND e."resource_id" = c."id"::text
   );
