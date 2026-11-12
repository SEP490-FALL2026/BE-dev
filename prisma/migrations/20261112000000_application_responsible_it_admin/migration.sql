-- QĐ-111g: an application has at most one IT Admin who answers for it, the one who declared it (no field to choose), changed by a transfer
-- of responsibility. The Business Owner columns and tables stay (they are read by nothing from now on and dropped in a later clean-up).
ALTER TABLE "applications" ADD COLUMN "responsible_it_admin_employee_id" UUID;

ALTER TABLE "applications"
  ADD CONSTRAINT "applications_responsible_it_admin_employee_id_fkey"
  FOREIGN KEY ("responsible_it_admin_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "applications_responsible_it_admin_employee_id_idx" ON "applications"("responsible_it_admin_employee_id");

-- Backfill: the person who declared the application (the actor of its APPLICATION.CREATED audit event, an account, so joined to
-- app_users for the employee), only while they are a usable IT Admin: the same test as IdentityAccessApi.findUsableItAdminEmployeeIds
-- (account ACTIVE and ACTIVATED, an IT_ADMIN grant not revoked). The others stay NULL: they are read as needing a responsible IT Admin.
UPDATE "applications" a
SET "responsible_it_admin_employee_id" = u."employee_id"
FROM "audit_events" e
JOIN "app_users" u ON u."id" = e."actor_app_user_id"
WHERE e."action" = 'APPLICATION.CREATED'
  AND e."resource_type" = 'Application'
  AND e."resource_id" = a."id"::text
  AND u."status" = 'ACTIVE'
  AND u."activation_state" = 'ACTIVATED'
  AND EXISTS (
    SELECT 1 FROM "role_grants" g
    WHERE g."app_user_id" = u."id" AND g."role" = 'IT_ADMIN' AND g."revoked_at" IS NULL
  );

DO $$
DECLARE
  with_responsible integer;
  without_responsible integer;
BEGIN
  SELECT count(*) FILTER (WHERE "responsible_it_admin_employee_id" IS NOT NULL),
         count(*) FILTER (WHERE "responsible_it_admin_employee_id" IS NULL)
    INTO with_responsible, without_responsible FROM "applications";
  RAISE NOTICE 'applications with a responsible IT Admin: %, without (needs one): %', with_responsible, without_responsible;
END $$;
