-- Subscription owner department, contraction step (g0-g6-final-business-baseline-remediation, Task 1.2c; F02, F20;
-- P03-D03 = A; spec L.3 "Mốc thu hẹp" and L.10). This is migration (B), the first migration of the final release, and the
-- only one that installs the database rules of the owner department: it applies at the first ordinary `migrate deploy`
-- after every existing subscription has a recorded assignment (`pnpm ops:assign-subscription-owner`).
--
-- `ops:preflight` is `BLOCKED` while an assignment is missing or in conflict; the first block below is the safety net
-- behind it: it raises before anything is written and names ids only. The compatibility image stays valid on this schema:
-- it always creates a subscription WITH an owner department (a request without one is refused 422 before the insert), it
-- never changes the owner, a personal seat carries no owning department (NULL passes the guard) and a seat of a service
-- account belongs to the department of the subscription (a seat of another department is refused 422 by its own service
-- before the insert; the trigger below is the defence in depth, and its message begins with the constraint name because the
-- Prisma driver adapter hands the application the `code` and the `message` of a trigger error and not its CONSTRAINT).

-- 1. Nothing is written while a subscription has no valid assignment or an assignment contradicts it.
DO $$
DECLARE
    unassigned TEXT;
    conflicting TEXT;
BEGIN
    SELECT string_agg(s."id"::text, ', ' ORDER BY s."id")
      INTO unassigned
      FROM "subscriptions" s
     WHERE s."owner_department_id" IS NULL
       AND NOT EXISTS (
           SELECT 1
             FROM "subscription_owner_assignments" a
             JOIN "departments" d ON d."id" = a."department_id"
            WHERE a."subscription_id" = s."id"
              AND a."organization_id" = s."organization_id"
              AND d."organization_id" = s."organization_id"
       );

    SELECT string_agg(s."id"::text, ', ' ORDER BY s."id")
      INTO conflicting
      FROM "subscriptions" s
      JOIN "subscription_owner_assignments" a ON a."subscription_id" = s."id"
      JOIN "departments" d ON d."id" = a."department_id"
     WHERE (s."owner_department_id" IS NOT NULL AND s."owner_department_id" <> a."department_id")
        OR a."organization_id" <> s."organization_id"
        OR d."organization_id" <> s."organization_id";

    IF unassigned IS NOT NULL OR conflicting IS NOT NULL THEN
        RAISE EXCEPTION 'Subscriptions without a valid owner department assignment: %. Subscriptions whose assignment conflicts: %. Nothing was changed. Run `pnpm ops:preflight`, deploy the compatibility release and assign them first.',
                        COALESCE(unassigned, 'none'), COALESCE(conflicting, 'none')
            USING ERRCODE = '23503';
    END IF;
END
$$;

-- 2. The history of each copy, written before the row changes (append-only Audit Trail, actor SYSTEM).
INSERT INTO "audit_events" ("id", "organization_id", "actor_kind", "actor_app_user_id", "actor_roles", "action",
                            "resource_type", "resource_id", "before", "after", "correlation_id")
SELECT gen_random_uuid(), s."organization_id", 'SYSTEM', NULL, '{}', 'SUBSCRIPTION.OWNER_SET_FROM_ASSIGNMENT',
       'Subscription', s."id"::text,
       jsonb_build_object('ownerDepartmentId', NULL),
       jsonb_build_object('ownerDepartmentId', a."department_id", 'assignmentId', a."id",
                          'migration', '20261029100000_subscription_owner_required'),
       '20261029100000_subscription_owner_required'
  FROM "subscriptions" s
  JOIN "subscription_owner_assignments" a ON a."subscription_id" = s."id"
 WHERE s."owner_department_id" IS NULL
 ORDER BY s."id";

-- 3. The copy: the department the operator recorded, on the approved purchase or contract basis. Nothing is inferred.
UPDATE "subscriptions" s
   SET "owner_department_id" = a."department_id"
  FROM "subscription_owner_assignments" a
 WHERE a."subscription_id" = s."id" AND s."owner_department_id" IS NULL;

-- 4. The department is required from now on.
ALTER TABLE "subscriptions" ALTER COLUMN "owner_department_id" SET NOT NULL;

-- 5. It never changes once set (a change of owner has no business source: record the Owner decision first).
CREATE FUNCTION subscriptions_owner_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW."owner_department_id" IS DISTINCT FROM OLD."owner_department_id" THEN
        RAISE EXCEPTION 'subscriptions_owner_immutable: a subscription keeps its owner department for its whole life'
            USING ERRCODE = '23514', CONSTRAINT = 'subscriptions_owner_immutable';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER subscriptions_owner_immutable
    BEFORE UPDATE OF "owner_department_id" ON "subscriptions"
    FOR EACH ROW EXECUTE FUNCTION subscriptions_owner_immutable();

-- 6. A paid seat belongs to the department that owns its subscription (QĐ-89a). A personal seat carries no owning
-- department (NULL) and is not checked. The owner never changes, so the subscription row needs no lock here.
CREATE FUNCTION license_assignments_owner_department_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    subscription_owner UUID;
BEGIN
    IF NEW."subscription_id" IS NULL OR NEW."owning_department_id" IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT s."owner_department_id" INTO subscription_owner FROM "subscriptions" s WHERE s."id" = NEW."subscription_id";
    IF subscription_owner IS DISTINCT FROM NEW."owning_department_id" THEN
        RAISE EXCEPTION 'license_assignments_owner_department_guard: a seat belongs to the department that owns its subscription'
            USING ERRCODE = '23514', CONSTRAINT = 'license_assignments_owner_department_guard';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER license_assignments_owner_department_guard
    BEFORE INSERT ON "license_assignments"
    FOR EACH ROW EXECUTE FUNCTION license_assignments_owner_department_guard();

-- 7. A personal seat may carry the owning department now; a service account still must (the rest of the old rule).
ALTER TABLE "license_assignments" DROP CONSTRAINT "license_assignments_service_has_owning_department";
ALTER TABLE "license_assignments" ADD CONSTRAINT "license_assignments_service_has_owning_department" CHECK (
    "kind" <> 'SERVICE' OR "owning_department_id" IS NOT NULL
);
