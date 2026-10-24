-- P28-01 under P29-MIGRATION=B-FORWARD (Prompt 29, 23/10/2026). Migration 20261022120000_cost_centers_unit_only stays
-- byte for byte (a deployed database already holds its checksum). It owned a service account by the department its
-- responsible person was in on the day the seat STARTED; the application owns it by the department on the day it was
-- RECORDED (the seat baseline import, seat-baseline-import.service.ts; QĐ-86c). Every history runs this migration after
-- that one, so every database ends on the rule of the application:
--   * a fresh database, and one created after 20261022120000: nothing differs, nothing changes;
--   * a database migrated before this one (the test VPS) and a legacy one that `pnpm ops:preflight` judged ready: each
--     service account whose stored owner differs from its recorded-day department is moved to it and charged to that
--     department's Unit, with one Audit Trail record each (actor SYSTEM, before and after).
-- The recorded day is the expression `ops:preflight` reads: valid_from when the file gave no grant day (RECORDED), else
-- the day the row was written in the organization's own calendar.
--
-- 1. Stop before writing anything when a service account's responsible person is in no department on its recorded day:
--    QĐ-86c then gives it no owning department, and that is an Owner/data decision, not one for a migration.
DO $$
DECLARE
    unresolved TEXT;
BEGIN
    SELECT string_agg(a."id"::text, ', ' ORDER BY a."id")
      INTO unresolved
      FROM "license_assignments" a
      JOIN "organizations" o ON o."id" = a."organization_id"
      CROSS JOIN LATERAL (
          SELECT CASE WHEN a."valid_from_basis" = 'RECORDED' THEN a."valid_from"
                      ELSE (a."created_at" AT TIME ZONE o."time_zone")::date END AS day
      ) r
     WHERE a."kind" = 'SERVICE'
       AND NOT EXISTS (
           SELECT 1 FROM "employee_placements" p
            WHERE p."employee_id" = a."employee_id" AND p."valid_from" <= r.day
              AND (p."valid_to" IS NULL OR r.day < p."valid_to")
       );
    IF unresolved IS NOT NULL THEN
        RAISE EXCEPTION 'Service accounts whose responsible person was in no department on the day they were recorded: %. Nothing was changed. Run `pnpm ops:preflight` before deploying; these rows need an Owner/data decision.', unresolved
            USING ERRCODE = '23503';
    END IF;
END
$$;

-- 2. The service accounts to move: from the owner stored to the recorded-day department and its Unit.
CREATE TEMPORARY TABLE "p29_service_owner_moves" ON COMMIT DROP AS
SELECT a."id", a."organization_id", r.day AS "recorded_on",
       od."code" AS "from_department", oc."code" AS "from_cost_center",
       p."department_id" AS "to_department_id", d."code" AS "to_department",
       d."cost_center_id" AS "to_cost_center_id", c."code" AS "to_cost_center"
  FROM "license_assignments" a
  JOIN "organizations" o ON o."id" = a."organization_id"
  CROSS JOIN LATERAL (
      SELECT CASE WHEN a."valid_from_basis" = 'RECORDED' THEN a."valid_from"
                  ELSE (a."created_at" AT TIME ZONE o."time_zone")::date END AS day
  ) r
  JOIN "employee_placements" p ON p."employee_id" = a."employee_id" AND p."valid_from" <= r.day
       AND (p."valid_to" IS NULL OR r.day < p."valid_to")
  JOIN "departments" d ON d."id" = p."department_id"
  JOIN "cost_centers" c ON c."id" = d."cost_center_id"
  LEFT JOIN "departments" od ON od."id" = a."owning_department_id"
  LEFT JOIN "cost_centers" oc ON oc."id" = a."cost_center_id"
 WHERE a."kind" = 'SERVICE'
   AND (a."owning_department_id" IS DISTINCT FROM p."department_id" OR a."cost_center_id" IS DISTINCT FROM d."cost_center_id");

-- 3. The history of each move, written before the row changes (append-only Audit Trail).
INSERT INTO "audit_events" ("id", "organization_id", "actor_kind", "actor_app_user_id", "actor_roles", "action",
                            "resource_type", "resource_id", "before", "after", "correlation_id")
SELECT gen_random_uuid(), m."organization_id", 'SYSTEM', NULL, '{}', 'LICENSE_ASSIGNMENT.OWNER_CORRECTED',
       'LicenseAssignment', m."id"::text,
       jsonb_build_object('owningDepartment', m."from_department", 'costCenter', m."from_cost_center"),
       jsonb_build_object('owningDepartment', m."to_department", 'costCenter', m."to_cost_center",
                          'recordedOn', to_char(m."recorded_on", 'YYYY-MM-DD'),
                          'rule', 'department of the responsible person on the recorded day (QĐ-86c)',
                          'migration', '20261023100000_service_account_owner_on_recorded_day'),
       '20261023100000_service_account_owner_on_recorded_day'
  FROM "p29_service_owner_moves" m
 ORDER BY m."id";

-- 4. The move itself. The owning department and the Cost Center are history that never changes for a writer
-- (license_assignments_immutable); the trigger is set aside for this one statement, as migration 20261022120000 did for
-- its backfill, and put back at once. Nothing else of the row changes.
ALTER TABLE "license_assignments" DISABLE TRIGGER "license_assignments_immutable";

UPDATE "license_assignments" a
   SET "owning_department_id" = m."to_department_id", "cost_center_id" = m."to_cost_center_id"
  FROM "p29_service_owner_moves" m
 WHERE a."id" = m."id";

ALTER TABLE "license_assignments" ENABLE TRIGGER "license_assignments_immutable";
