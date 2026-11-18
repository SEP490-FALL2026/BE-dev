-- Cost Centers are Units only, and a service account belongs to the department of its owner (QĐ-86a, QĐ-86b, QĐ-86c; review
-- findings BBI-D04 → BBI-D08 and BBI-D10). The Company is the root of the organization, not a Cost Center, so no cost is
-- attributed to it: a service account is charged to the Cost Center of the department that owns it.
--
-- Data: a service account written before this migration is charged to a COMPANY Cost Center. Its owning department is the
-- department its responsible person was in on the day it started, and it is charged to the Unit of that department. A
-- service account whose responsible person had no department that day stops the migration with a list, as does any other
-- reference to a COMPANY Cost Center that this cannot move. COMPANY Cost Centers left without a reference are removed and
-- the enum is rebuilt with UNIT alone. Nothing here edits a shared environment: the operator runs the inventory first.

-- 1. The owning department of a service account.
ALTER TABLE "license_assignments" ADD COLUMN "owning_department_id" UUID;

-- 2. Backfill. The immutable-history trigger is set aside for the statements below and put back at once.
ALTER TABLE "license_assignments" DISABLE TRIGGER "license_assignments_immutable";

UPDATE "license_assignments" a
   SET "owning_department_id" = p."department_id"
  FROM "employee_placements" p
 WHERE a."kind" = 'SERVICE'
   AND p."employee_id" = a."employee_id"
   AND p."valid_from" <= a."valid_from"
   AND (p."valid_to" IS NULL OR a."valid_from" < p."valid_to");

UPDATE "license_assignments" a
   SET "cost_center_id" = d."cost_center_id"
  FROM "departments" d
 WHERE a."kind" = 'SERVICE' AND d."id" = a."owning_department_id";

ALTER TABLE "license_assignments" ENABLE TRIGGER "license_assignments_immutable";

DO $$
DECLARE
    unresolved TEXT;
    leftover TEXT;
BEGIN
    SELECT string_agg(a."id"::text, ', ')
      INTO unresolved
      FROM "license_assignments" a
     WHERE a."kind" = 'SERVICE' AND a."owning_department_id" IS NULL;
    IF unresolved IS NOT NULL THEN
        RAISE EXCEPTION 'Service accounts whose responsible person had no department on the day they started: %. Give each an owning department in the data, then run this migration again.', unresolved
            USING ERRCODE = '23503';
    END IF;

    SELECT string_agg(DISTINCT c."code", ', ')
      INTO leftover
      FROM "cost_centers" c
     WHERE c."kind" = 'COMPANY'
       AND (
           EXISTS (SELECT 1 FROM "departments" d WHERE d."cost_center_id" = c."id")
        OR EXISTS (SELECT 1 FROM "subscription_cost_allocation_lines" l WHERE l."cost_center_id" = c."id")
        OR EXISTS (SELECT 1 FROM "license_assignments" a WHERE a."cost_center_id" = c."id")
       );
    IF leftover IS NOT NULL THEN
        RAISE EXCEPTION 'Cost Centers of kind COMPANY are still referenced: %. A department, a cost allocation or an assignment that names one has to be moved to a Unit first, then run this migration again.', leftover
            USING ERRCODE = '23503';
    END IF;
END
$$;

-- 3. A service account is owned by a department, a personal seat by none, and the service account is charged to the Unit
-- of its owning department.
ALTER TABLE "license_assignments" ADD CONSTRAINT "license_assignments_owning_department_id_fkey"
    FOREIGN KEY ("owning_department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "license_assignments" ADD CONSTRAINT "license_assignments_service_has_owning_department" CHECK (
    ("kind" = 'SERVICE') = ("owning_department_id" IS NOT NULL)
);
CREATE INDEX "license_assignments_owning_department_id_idx" ON "license_assignments"("owning_department_id");

CREATE FUNCTION "license_assignments_service_cost_center_is_owning_unit"() RETURNS trigger AS $$
DECLARE
    unit UUID;
    department_status "DepartmentStatus";
BEGIN
    IF NEW."kind" <> 'SERVICE' THEN
        RETURN NEW;
    END IF;

    -- Held FOR SHARE: retiring the department (FOR UPDATE) and taking a new service account into it queue one behind the
    -- other, so a department is never retired with a service account that came in meanwhile.
    SELECT d."cost_center_id", d."status" INTO unit, department_status
      FROM "departments" d WHERE d."id" = NEW."owning_department_id" FOR SHARE;
    IF unit IS DISTINCT FROM NEW."cost_center_id" THEN
        RAISE EXCEPTION 'A service account is charged to the Cost Center of its owning department'
            USING ERRCODE = '23514', CONSTRAINT = 'license_assignments_service_cost_center_is_owning_unit';
    END IF;
    IF department_status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'A department that is no longer in use takes no new service account'
            USING ERRCODE = '23514', CONSTRAINT = 'license_assignments_owning_department_active';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "license_assignments_service_owning_unit"
    BEFORE INSERT ON "license_assignments"
    FOR EACH ROW EXECUTE FUNCTION "license_assignments_service_cost_center_is_owning_unit"();

-- The owning department is part of the history that never changes (the function of migration 20261020230100, which already
-- holds the rules of a failed assignment, with the owning department added to what is fixed).
CREATE OR REPLACE FUNCTION "license_assignment_reject_change"() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'A license assignment is never deleted'
            USING ERRCODE = '55000', CONSTRAINT = 'license_assignments_immutable';
    END IF;

    IF (NEW."id", NEW."organization_id", NEW."kind", NEW."source", NEW."plan_id", NEW."subscription_id",
        NEW."employee_id", NEW."account_identifier", NEW."normalized_account_identifier", NEW."reason",
        NEW."cost_center_id", NEW."owning_department_id", NEW."valid_from", NEW."valid_from_basis", NEW."predecessor_id",
        NEW."baseline_import_id", NEW."created_by_app_user_id", NEW."created_at")
       IS DISTINCT FROM
       (OLD."id", OLD."organization_id", OLD."kind", OLD."source", OLD."plan_id", OLD."subscription_id",
        OLD."employee_id", OLD."account_identifier", OLD."normalized_account_identifier", OLD."reason",
        OLD."cost_center_id", OLD."owning_department_id", OLD."valid_from", OLD."valid_from_basis", OLD."predecessor_id",
        OLD."baseline_import_id", OLD."created_by_app_user_id", OLD."created_at") THEN
        RAISE EXCEPTION 'Only when a license assignment ends and when it is expected to end may change'
            USING ERRCODE = '55000', CONSTRAINT = 'license_assignments_immutable';
    END IF;

    IF OLD."failed_at" IS NOT NULL
       AND (NEW."failed_at", NEW."valid_until", NEW."expected_end_date")
           IS DISTINCT FROM (OLD."failed_at", OLD."valid_until", OLD."expected_end_date") THEN
        RAISE EXCEPTION 'A license assignment that failed never changes again'
            USING ERRCODE = '55000', CONSTRAINT = 'license_assignments_failed_is_final';
    END IF;

    IF OLD."failed_at" IS NULL AND NEW."failed_at" IS NOT NULL AND OLD."valid_until" IS NOT NULL THEN
        RAISE EXCEPTION 'Only an assignment that is still open can fail'
            USING ERRCODE = '55000', CONSTRAINT = 'license_assignments_failed_needs_open';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. The Cost Center kinds: UNIT alone.
DELETE FROM "cost_centers" c WHERE c."kind" = 'COMPANY';

CREATE TYPE "CostCenterKind_next" AS ENUM ('UNIT');
ALTER TABLE "cost_centers" ALTER COLUMN "kind" TYPE "CostCenterKind_next" USING "kind"::text::"CostCenterKind_next";
DROP TYPE "CostCenterKind";
ALTER TYPE "CostCenterKind_next" RENAME TO "CostCenterKind";
