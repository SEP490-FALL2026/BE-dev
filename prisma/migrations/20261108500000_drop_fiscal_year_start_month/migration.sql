-- The fiscal year is the calendar year (QĐ-104e(1), FR-5.1): the parameter that moved where it begins no longer exists.
-- Every open value is closed, not deleted: the history of what the Super Admin once set stays. Only data changes; no table or
-- constraint. Not reversible, and done outside the application, so no Audit Trail record is written.
DO $$
DECLARE
    other_than_january INTEGER;
BEGIN
    SELECT count(*) INTO other_than_january
      FROM "parameter_values"
     WHERE "key" = 'FISCAL_YEAR_START_MONTH' AND "valid_to" IS NULL AND "value" <> '1'::jsonb;
    IF other_than_january > 0 THEN
        RAISE NOTICE 'FISCAL_YEAR_START_MONTH: % open value(s) other than 1 are closed; budget years already stored keep their meaning.',
            other_than_january;
    END IF;
END $$;

UPDATE "parameter_values"
SET "valid_to" = GREATEST(CURRENT_TIMESTAMP, "valid_from")
WHERE "key" = 'FISCAL_YEAR_START_MONTH' AND "valid_to" IS NULL;
