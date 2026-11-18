-- B-L: the reason of a reserve that is not the default share of the base is a text that says something, or nothing at all (never blank,
-- never longer than a reason may be). The service trims it and turns a blank one into nothing; the database keeps the same rule.
UPDATE "budget_versions" SET "reserve_reason" = NULL WHERE "reserve_reason" IS NOT NULL AND btrim("reserve_reason") = '';

ALTER TABLE "budget_versions"
    ADD CONSTRAINT "budget_versions_reserve_reason_check" CHECK (
        "reserve_reason" IS NULL OR (btrim("reserve_reason") <> '' AND char_length("reserve_reason") <= 1000)
    );
