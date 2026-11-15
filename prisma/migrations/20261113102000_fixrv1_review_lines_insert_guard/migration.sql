-- FIX-RV1 RV1-07 (QĐ-111ae): the picture of a closed month is not edited, and a line is not added to it either. The trigger of RV-1 refused UPDATE, DELETE and TRUNCATE of a line; an
-- INSERT of a new line into a period made before (signed or not) was still accepted and changed the table of lights of a period that Finance had signed. A line may be
-- inserted only in the transaction that made its period (the application writes a period with its lines in one transaction, `budget-review.repo.ts`): the period row was
-- written by this transaction when its `xmin` is the id of this transaction.
-- Expand only: one function and one trigger; nothing is dropped or rewritten. Safe to run twice.

CREATE OR REPLACE FUNCTION budget_review_lines_insert_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  made_here boolean;
BEGIN
  SELECT p.xmin::text::bigint = (txid_current() % 4294967296) INTO made_here FROM budget_review_periods p WHERE p.id = NEW.period_id;
  IF made_here IS NOT TRUE THEN
    RAISE EXCEPTION 'budget_review_lines keeps its picture (a line is added only in the transaction that made its period; INSERT rejected)' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS budget_review_lines_no_late_insert ON "budget_review_lines";
CREATE TRIGGER budget_review_lines_no_late_insert BEFORE INSERT ON "budget_review_lines"
    FOR EACH ROW EXECUTE FUNCTION budget_review_lines_insert_guard();
