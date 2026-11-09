-- MF4-B, RV-15: the budget model no longer has revisions, high-value thresholds, purchase windows or moved windows. The columns and
-- the table stay (old rows are still read) but nothing writes them again: a new value is refused by the database, an old row keeps
-- what it holds and can still be changed in its other columns. A line names its kind on every write (no default).

-- 1. Lines of a version built from the baseline before the lines had a kind: they are what the department runs on (QĐ-100h,
--    C4-14), Renew lines, not purchases. Only the lines the backfill of 20261109104000 marked NEW are touched: a line written after
--    it names its own kind.
UPDATE "budget_version_lines" vl
   SET "line_type" = 'RENEW'
  FROM "budget_versions" v
  JOIN "_prisma_migrations" m ON m."migration_name" = '20261109104000_budget_lines_bm10_cleanup'
                             AND m."finished_at" IS NOT NULL AND m."rolled_back_at" IS NULL
 WHERE v."id" = vl."version_id"
   AND v."origin" = 'BASELINE_NO_HEAD'
   AND v."created_at" < m."finished_at"
   AND vl."proposal_id" IS NULL
   AND vl."line_type" = 'NEW'
   AND vl."zbb" IS NULL;

-- 2. A writer that forgets the kind of a line is refused instead of writing NEW.
ALTER TABLE "budget_proposal_lines" ALTER COLUMN "line_type" DROP DEFAULT;
ALTER TABLE "budget_version_lines" ALTER COLUMN "line_type" DROP DEFAULT;

-- 3. Every version is a first one: no revision, nothing it is based on. 20261109104000 refused to run over a revision, so no row
--    breaks it; it is checked on new and changed rows only all the same.
ALTER TABLE "budget_versions"
  ADD CONSTRAINT "budget_versions_initial_only" CHECK ("kind" = 'INITIAL' AND "based_on_version_id" IS NULL) NOT VALID;

-- 4. The retired columns of a version (the reason of a revision, the high-value thresholds) and of a line (the purchase window, the
--    service period, the repeat cycle, the validity of a quote): an insert leaves them empty, an update leaves them as they are, so an
--    old row keeps its value and stays editable in its other columns.
CREATE FUNCTION "budget_versions_retired_columns_guard"() RETURNS trigger AS $$
BEGIN
    IF (TG_OP = 'INSERT'
        AND (NEW."reason" IS NOT NULL OR NEW."high_value_percent" IS NOT NULL OR NEW."high_value_amount_minor" IS NOT NULL))
       OR (TG_OP = 'UPDATE'
        AND (NEW."reason", NEW."high_value_percent", NEW."high_value_amount_minor")
            IS DISTINCT FROM (OLD."reason", OLD."high_value_percent", OLD."high_value_amount_minor")) THEN
        RAISE EXCEPTION 'The reason of a revision and the high-value thresholds of a version are no longer written'
            USING ERRCODE = '23514', CONSTRAINT = 'budget_versions_retired_columns';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "budget_versions_retired_columns"
    BEFORE INSERT OR UPDATE ON "budget_versions"
    FOR EACH ROW EXECUTE FUNCTION "budget_versions_retired_columns_guard"();

CREATE FUNCTION "budget_lines_retired_columns_guard"() RETURNS trigger AS $$
BEGIN
    IF (TG_OP = 'INSERT'
        AND (NEW."window_from" IS NOT NULL OR NEW."window_to" IS NOT NULL OR NEW."service_period_months" IS NOT NULL
             OR NEW."repeat_cycle" IS NOT NULL OR NEW."quote_valid_until" IS NOT NULL))
       OR (TG_OP = 'UPDATE'
        AND (NEW."window_from", NEW."window_to", NEW."service_period_months", NEW."repeat_cycle", NEW."quote_valid_until")
            IS DISTINCT FROM (OLD."window_from", OLD."window_to", OLD."service_period_months", OLD."repeat_cycle", OLD."quote_valid_until")) THEN
        RAISE EXCEPTION 'The purchase window, service period, repeat cycle and quote validity of a budget line are no longer written'
            USING ERRCODE = '23514', CONSTRAINT = 'budget_lines_retired_columns';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "budget_proposal_lines_retired_columns"
    BEFORE INSERT OR UPDATE ON "budget_proposal_lines"
    FOR EACH ROW EXECUTE FUNCTION "budget_lines_retired_columns_guard"();

CREATE TRIGGER "budget_version_lines_retired_columns"
    BEFORE INSERT OR UPDATE ON "budget_version_lines"
    FOR EACH ROW EXECUTE FUNCTION "budget_lines_retired_columns_guard"();

-- 5. A window is never moved again (QĐ-97b): the record of the moves keeps what it holds and takes no new row.
CREATE FUNCTION "budget_version_line_changes_retired"() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'The purchase window of a budget line is no longer moved'
        USING ERRCODE = '23514', CONSTRAINT = 'budget_version_line_changes_retired';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "budget_version_line_changes_retired"
    BEFORE INSERT ON "budget_version_line_changes"
    FOR EACH ROW EXECUTE FUNCTION "budget_version_line_changes_retired"();
