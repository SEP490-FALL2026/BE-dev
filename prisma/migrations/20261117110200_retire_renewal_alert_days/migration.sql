-- The alerts of a subscription count back from its point of adjustment, 7, 30 and 7 days (QĐ-103e, FR-8.2; S20-T9a), not from the list of days
-- the Super Admin once set: the parameter that held that list no longer exists.
-- Every open value is closed, not deleted: the history of what the Super Admin once set stays. Only data changes; no table or
-- constraint. Not reversible, and done outside the application, so no Audit Trail record is written. Running it twice changes nothing.
DO $$
DECLARE
    other_than_default INTEGER;
BEGIN
    SELECT count(*) INTO other_than_default
      FROM "parameter_values"
     WHERE "key" = 'RENEWAL_ALERT_DAYS_BEFORE_DEADLINE' AND "valid_to" IS NULL AND "value" <> '[15, 7]'::jsonb;
    IF other_than_default > 0 THEN
        RAISE NOTICE 'RENEWAL_ALERT_DAYS_BEFORE_DEADLINE: % open value(s) other than [15, 7] are closed; the alerts follow the point of adjustment from now on.',
            other_than_default;
    END IF;
END $$;

UPDATE "parameter_values"
SET "valid_to" = GREATEST(CURRENT_TIMESTAMP, "valid_from")
WHERE "key" = 'RENEWAL_ALERT_DAYS_BEFORE_DEADLINE' AND "valid_to" IS NULL;
