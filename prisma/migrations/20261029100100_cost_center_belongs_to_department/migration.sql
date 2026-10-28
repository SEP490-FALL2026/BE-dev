-- Cost Center belongs to one department, contraction step (g0-g6-final-business-baseline-remediation, Task 1.1; F01;
-- review P03-RV-04; QĐ-87d(1); spec L.10 and L.11). A department may exist with no Cost Center; a Cost Center never exists
-- without exactly one department for its whole life. The compatibility release created the link (and kept the old
-- department-side column equal to it by two triggers while the release before it could still be recovered); this migration
-- makes the link required and removes the old column.
--
-- Nothing is copied, inferred or defaulted here: a Cost Center that still has no department is a data decision that only
-- `pnpm ops:cost-center-direction link` takes (a basis Finance approved), so the first block raises before anything is
-- written and names ids only. `ops:preflight` is `BLOCKED` for the same reasons, earlier.
--
-- The compatibility image stays valid on this schema: it creates a department with no Cost Center (activated) and a Cost
-- Center WITH its department (the insert names it), it never names `departments.cost_center_id`, and it reads the Cost
-- Center of a department through `cost_centers.department_id`.

-- 1. Nothing is written while a Cost Center lacks its department, the old column and the link disagree, or an
-- organization never ran the activation step.
DO $$
DECLARE
    unlinked TEXT;
    mismatched TEXT;
    not_activated TEXT;
BEGIN
    SELECT string_agg(c."id"::text, ', ' ORDER BY c."id")
      INTO unlinked
      FROM "cost_centers" c
     WHERE c."department_id" IS NULL OR c."linked_at" IS NULL;

    SELECT string_agg(d."id"::text, ', ' ORDER BY d."id")
      INTO mismatched
      FROM "departments" d
      JOIN "cost_centers" c ON c."id" = d."cost_center_id"
     WHERE c."department_id" IS DISTINCT FROM d."id";

    SELECT string_agg(o."id"::text, ', ' ORDER BY o."id")
      INTO not_activated
      FROM "organizations" o
     WHERE NOT EXISTS (SELECT 1 FROM "cost_center_direction_activations" a WHERE a."organization_id" = o."id");

    IF unlinked IS NOT NULL OR mismatched IS NOT NULL OR not_activated IS NOT NULL THEN
        RAISE EXCEPTION 'Cost Centers without a department: %. Departments whose old Cost Center column disagrees with the link: %. Organizations that did not run the activation step: %. Nothing was changed. Run `pnpm ops:preflight`; link each Cost Center with `pnpm ops:cost-center-direction link` and activate with `pnpm ops:cost-center-direction activate` on the compatibility release first.',
                        COALESCE(unlinked, 'none'), COALESCE(mismatched, 'none'), COALESCE(not_activated, 'none')
            USING ERRCODE = '23503';
    END IF;
END
$$;

-- 2. The link is required. `cost_centers_link_together` (whole or absent) has nothing left to say; the unique index of the
-- ACTIVE Cost Center of a department and the link-once trigger stay.
ALTER TABLE "cost_centers" ALTER COLUMN "department_id" SET NOT NULL;
ALTER TABLE "cost_centers" ALTER COLUMN "linked_at" SET NOT NULL;
ALTER TABLE "cost_centers" DROP CONSTRAINT "cost_centers_link_together";

-- 3. The two triggers that kept the old column equal to the link, and the guard of the old column, go with it.
DROP TRIGGER "departments_cost_center_link_forward" ON "departments";
DROP FUNCTION departments_cost_center_link_forward();
DROP TRIGGER "cost_centers_department_link_backward" ON "cost_centers";
DROP FUNCTION cost_centers_department_link_backward();
DROP TRIGGER "departments_unit_cost_center" ON "departments";
DROP FUNCTION departments_require_unit_cost_center();

-- 4. A service account is charged to the Unit of its owning department: the ACTIVE Cost Center linked to that department
-- (the rule and its lock are those of `20261022120000_cost_centers_unit_only`; only where the Cost Center is read changed).
CREATE OR REPLACE FUNCTION "license_assignments_service_cost_center_is_owning_unit"() RETURNS trigger AS $$
DECLARE
    unit UUID;
    department_status "DepartmentStatus";
BEGIN
    IF NEW."kind" <> 'SERVICE' THEN
        RETURN NEW;
    END IF;

    -- Held FOR SHARE: retiring the department (FOR UPDATE) and taking a new service account into it queue one behind the
    -- other, so a department is never retired with a service account that came in meanwhile.
    SELECT d."status" INTO department_status
      FROM "departments" d WHERE d."id" = NEW."owning_department_id" FOR SHARE;
    SELECT c."id" INTO unit
      FROM "cost_centers" c WHERE c."department_id" = NEW."owning_department_id" AND c."status" = 'ACTIVE';
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

-- 5. The old department-side column, its foreign key and its unique index.
ALTER TABLE "departments" DROP COLUMN "cost_center_id";
