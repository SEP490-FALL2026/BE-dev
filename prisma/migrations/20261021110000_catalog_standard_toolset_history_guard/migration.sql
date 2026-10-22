-- The history of a standard toolset can only grow in order (g3-standard-toolset, US-04-10 AC-1, AC-3): a version is the
-- next one of its pair, its items are added only while it is being written (before the head moves to it), and the head
-- moves up by one, to a version that exists. The writer does it in that order inside one transaction under the lock of the
-- head, so no writer can add to a recorded version, skip a number or send the head back, whatever it is.

CREATE FUNCTION "standard_toolset_version_guard"() RETURNS trigger AS $$
DECLARE
    "current" INTEGER;
BEGIN
    -- Version 0 and below are the CHECK's to refuse.
    IF NEW."version" >= 1 THEN
        SELECT "current_version" INTO "current" FROM "standard_toolsets"
         WHERE "department_id" = NEW."department_id" AND "job_title_id" = NEW."job_title_id";
        IF NEW."version" <> COALESCE("current", 0) + 1 THEN
            RAISE EXCEPTION 'A standard toolset version is the next one of its pair'
                USING ERRCODE = '55000', CONSTRAINT = 'standard_toolset_version_next';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "standard_toolset_versions_next"
    BEFORE INSERT ON "standard_toolset_versions"
    FOR EACH ROW EXECUTE FUNCTION "standard_toolset_version_guard"();

CREATE FUNCTION "standard_toolset_item_guard"() RETURNS trigger AS $$
DECLARE
    "written" INTEGER;
    "current" INTEGER;
BEGIN
    SELECT v."version", t."current_version" INTO "written", "current"
      FROM "standard_toolset_versions" v
      JOIN "standard_toolsets" t ON t."department_id" = v."department_id" AND t."job_title_id" = v."job_title_id"
     WHERE v."id" = NEW."version_id";
    -- A version that does not exist is the foreign key's to refuse.
    IF FOUND AND "written" <> "current" + 1 THEN
        RAISE EXCEPTION 'The items of a recorded standard toolset version are never added to'
            USING ERRCODE = '55000', CONSTRAINT = 'standard_toolset_items_open';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "standard_toolset_items_open"
    BEFORE INSERT ON "standard_toolset_items"
    FOR EACH ROW EXECUTE FUNCTION "standard_toolset_item_guard"();

CREATE FUNCTION "standard_toolset_head_guard"() RETURNS trigger AS $$
BEGIN
    IF NEW."current_version" <> OLD."current_version" THEN
        IF NEW."current_version" <> OLD."current_version" + 1
           OR NOT EXISTS (
               SELECT 1 FROM "standard_toolset_versions" v
                WHERE v."department_id" = NEW."department_id" AND v."job_title_id" = NEW."job_title_id"
                  AND v."version" = NEW."current_version"
           ) THEN
            RAISE EXCEPTION 'The head of a standard toolset moves up by one, to a version that exists'
                USING ERRCODE = '55000', CONSTRAINT = 'standard_toolset_head_forward';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "standard_toolsets_forward"
    BEFORE UPDATE ON "standard_toolsets"
    FOR EACH ROW EXECUTE FUNCTION "standard_toolset_head_guard"();
