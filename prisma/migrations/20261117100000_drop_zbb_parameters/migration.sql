-- A budget line carries no zero-based-budget explanation any more (QĐ-111ab): the two thresholds that decided when one was
-- needed no longer exist and nothing reads them. Every open value is closed, not deleted: the history of what Finance once set
-- stays. Only data changes; no table or constraint. Not reversible, and done outside the application, so no Audit Trail record
-- is written. Running it again closes nothing more.
DO $$
DECLARE
    other_than_default INTEGER;
BEGIN
    SELECT count(*) INTO other_than_default
      FROM "parameter_values"
     WHERE "valid_to" IS NULL
       AND (("key" = 'BUDGET_ZBB_KPI3_BELOW_PERCENT' AND "value" <> '70'::jsonb)
         OR ("key" = 'BUDGET_ZBB_PRICE_INCREASE_PERCENT' AND "value" <> '10'::jsonb));
    IF other_than_default > 0 THEN
        RAISE NOTICE 'BUDGET_ZBB_*: % open value(s) other than the default are closed; nothing reads them any more.',
            other_than_default;
    END IF;
END $$;

UPDATE "parameter_values"
SET "valid_to" = GREATEST(CURRENT_TIMESTAMP, "valid_from")
WHERE "key" IN ('BUDGET_ZBB_KPI3_BELOW_PERCENT', 'BUDGET_ZBB_PRICE_INCREASE_PERCENT') AND "valid_to" IS NULL;
