-- FIX-RV23 RV3-03 (US-12-21 AC-5): an explanation that is given has all four things the head says: the cause, whether it is one-off or ongoing, the action, and what the department already knows it will
-- need to the end of the year, as an amount (0 when it knows of no need) and a note. The application now asks for the amount; this is the same rule in the database: a line that is EXPLAINED has an amount.
-- The constraint is added NOT VALID, so it is checked for every row written or changed from now on and an explanation written before the amount was asked for (null) is left as it is, never invented.
-- Expand only; safe to run twice.

ALTER TABLE "budget_review_lines" DROP CONSTRAINT IF EXISTS "budget_review_lines_explanation_amount_check";
ALTER TABLE "budget_review_lines" ADD CONSTRAINT "budget_review_lines_explanation_amount_check"
    CHECK ("explanation_status" <> 'EXPLAINED' OR "explanation_needs_amount_minor" IS NOT NULL) NOT VALID;
