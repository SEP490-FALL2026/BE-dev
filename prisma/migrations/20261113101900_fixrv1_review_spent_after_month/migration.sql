-- FIX-RV1 RV1-03 (QĐ-111ai, US-12-21): the pace of spending is the spent through the end of the month closed, by the month each invoice pays for, not the spent of the day
-- Finance presses the button. What was already recorded for the months after (an invoice of July when June is closed on 07/07) took the commitments down, so the forecast
-- still counts it; it is kept apart, in a column of its own, so that the figures of the picture add up: spent + spent after + held + waiting + left = the budget.
-- `spent_minor` of a line now means "through the end of the month" (the lines closed before this keep what they had: no month after was told apart, so the new column is 0).
-- Expand only: one column with a default and the function of the trigger that keeps the figures of a line; nothing is dropped or rewritten. Safe to run twice.

ALTER TABLE "budget_review_lines" ADD COLUMN IF NOT EXISTS "spent_after_month_minor" bigint NOT NULL DEFAULT 0;
ALTER TABLE "budget_review_lines" DROP CONSTRAINT IF EXISTS "budget_review_lines_spent_after_check";
ALTER TABLE "budget_review_lines" ADD CONSTRAINT "budget_review_lines_spent_after_check" CHECK ("spent_after_month_minor" >= 0);

-- The picture keeps the new figure too: no UPDATE changes it (the function of RV-1, with the one column more).
CREATE OR REPLACE FUNCTION budget_review_lines_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.period_id IS DISTINCT FROM OLD.period_id OR NEW.cost_center_id IS DISTINCT FROM OLD.cost_center_id
       OR NEW.base_minor IS DISTINCT FROM OLD.base_minor OR NEW.reserve_minor IS DISTINCT FROM OLD.reserve_minor
       OR NEW.spent_minor IS DISTINCT FROM OLD.spent_minor OR NEW.spent_after_month_minor IS DISTINCT FROM OLD.spent_after_month_minor
       OR NEW.committed_minor IS DISTINCT FROM OLD.committed_minor
       OR NEW.pending_spend_minor IS DISTINCT FROM OLD.pending_spend_minor OR NEW.remaining_minor IS DISTINCT FROM OLD.remaining_minor
       OR NEW.invoice_net_minor IS DISTINCT FROM OLD.invoice_net_minor OR NEW.invoice_actual_minor IS DISTINCT FROM OLD.invoice_actual_minor
       OR NEW.variance_ppm IS DISTINCT FROM OLD.variance_ppm OR NEW.price_increase_minor IS DISTINCT FROM OLD.price_increase_minor
       OR NEW.forecast_minor IS DISTINCT FROM OLD.forecast_minor OR NEW.pace_basis_points IS DISTINCT FROM OLD.pace_basis_points
       OR NEW.light IS DISTINCT FROM OLD.light THEN
      RAISE EXCEPTION 'the figures of a line of a review period are a picture and never change (UPDATE rejected)' USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'budget_review_lines keeps its picture (% rejected)', TG_OP USING ERRCODE = 'restrict_violation';
END;
$$;
