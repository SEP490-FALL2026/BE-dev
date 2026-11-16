-- CT-1.7 (QĐ-111d, MAJ-7): every application stands in a functional group. This is the migration after the code that sets one on every road that makes
-- an application (the one command, the registration of internal software for a request, the demo seed, the installation). Expand only: a function
-- that finds or makes the fixed group Khác, an update of the rows that have no group, a trigger that applies the function to a row written with none,
-- and then NOT NULL; nothing is dropped. Safe to run twice.
--
-- The group Khác of an organization is the one with the system key OTHER. When the organization has none (made by hand, before the groups), an older
-- group the organization called Khác is adopted (and switched on, as the fixed group must be), else one is made. The function is the one place that
-- says how: the code that declares an application asks it, and the trigger asks it for a row that comes with no group.
CREATE OR REPLACE FUNCTION "ensure_other_functional_group"(organization UUID) RETURNS UUID AS $$
DECLARE
    group_id UUID;
BEGIN
    SELECT g."id" INTO group_id FROM "functional_groups" g
     WHERE g."organization_id" = organization AND g."system_key" = 'OTHER';
    IF group_id IS NOT NULL THEN
        RETURN group_id;
    END IF;

    UPDATE "functional_groups" SET "system_key" = 'OTHER', "status" = 'ACTIVE', "updated_at" = now()
     WHERE "organization_id" = organization AND "normalized_name" = 'khac' AND "system_key" IS NULL
    RETURNING "id" INTO group_id;
    IF group_id IS NOT NULL THEN
        RETURN group_id;
    END IF;

    INSERT INTO "functional_groups" ("id", "organization_id", "name", "normalized_name", "status", "system_key", "updated_at")
    VALUES (gen_random_uuid(), organization, 'Khác', 'khac', 'ACTIVE', 'OTHER', now())
    ON CONFLICT DO NOTHING
    RETURNING "id" INTO group_id;
    IF group_id IS NULL THEN
        -- A simultaneous writer made it first.
        SELECT g."id" INTO group_id FROM "functional_groups" g
         WHERE g."organization_id" = organization AND g."system_key" = 'OTHER';
    END IF;

    RETURN group_id;
END;
$$ LANGUAGE plpgsql;

-- The applications that have no group stand in Khác (CT-1.1 moved them; this catches the ones made since and the organizations it did not reach).
UPDATE "applications" a SET "functional_group_id" = "ensure_other_functional_group"(a."organization_id"), "updated_at" = now()
 WHERE a."functional_group_id" IS NULL;

-- A row written with no group is put in Khác before the NOT NULL is asked: every road that names no group gets the same answer, in the code or not.
CREATE OR REPLACE FUNCTION "applications_default_group"() RETURNS trigger AS $$
BEGIN
    IF NEW."functional_group_id" IS NULL THEN
        NEW."functional_group_id" := "ensure_other_functional_group"(NEW."organization_id");
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "applications_default_group" ON "applications";
CREATE TRIGGER "applications_default_group"
    BEFORE INSERT ON "applications"
    FOR EACH ROW EXECUTE FUNCTION "applications_default_group"();

ALTER TABLE "applications" ALTER COLUMN "functional_group_id" SET NOT NULL;
