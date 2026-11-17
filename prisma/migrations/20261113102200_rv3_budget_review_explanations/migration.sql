-- RV-3 (QĐ-111ah, R-10, R-17, B-7; R-47): the explanations of the quarterly review. A quarter (March, June, September) now opens in AWAITING_EXPLANATIONS: each of its Cost Centers that is yellow,
-- red or under what it should have used is asked (explanation_status PENDING) to say the cause, whether it is one-off or ongoing, the action, and what it already knows it needs to the end of the
-- year, until the fifth working day from the close (`explanations_due_on`, worked out when the quarter is closed). Finance may sign at any time: a line still PENDING then becomes UNEXPLAINED, or
-- NO_HEAD when the department has no head to ask (R-17). The columns of the picture of RV-1 and the triggers that keep them (budget_review_lines_guard, budget_review_periods_guard, the guard of
-- the insert of FIX-RV1) are untouched: nothing here changes a figure, and a trigger below lets the explanation columns move only while the period is waiting for them.
-- Expand only: columns with defaults, checks and one trigger; nothing is dropped or rewritten. A period closed before this migration keeps its state and its lines are NOT_REQUIRED. Safe to run twice.

ALTER TABLE "budget_review_periods" ADD COLUMN IF NOT EXISTS "explanations_due_on" date;

ALTER TABLE "budget_review_lines"
    ADD COLUMN IF NOT EXISTS "explanation_status" text NOT NULL DEFAULT 'NOT_REQUIRED',
    ADD COLUMN IF NOT EXISTS "explanation_cause" text,
    ADD COLUMN IF NOT EXISTS "explanation_persistence" text,
    ADD COLUMN IF NOT EXISTS "explanation_action" text,
    ADD COLUMN IF NOT EXISTS "explanation_needs_amount_minor" bigint,
    ADD COLUMN IF NOT EXISTS "explanation_needs_note" text,
    ADD COLUMN IF NOT EXISTS "explained_by_employee_id" uuid,
    ADD COLUMN IF NOT EXISTS "explained_at" timestamptz(3);

ALTER TABLE "budget_review_lines" DROP CONSTRAINT IF EXISTS "budget_review_lines_explanation_status_check";
ALTER TABLE "budget_review_lines" ADD CONSTRAINT "budget_review_lines_explanation_status_check"
    CHECK ("explanation_status" IN ('NOT_REQUIRED', 'PENDING', 'EXPLAINED', 'UNEXPLAINED', 'NO_HEAD'));

ALTER TABLE "budget_review_lines" DROP CONSTRAINT IF EXISTS "budget_review_lines_explanation_check";
ALTER TABLE "budget_review_lines" ADD CONSTRAINT "budget_review_lines_explanation_check" CHECK (
    ("explanation_status" = 'EXPLAINED') = (
        "explanation_cause" IS NOT NULL AND "explanation_persistence" IS NOT NULL AND "explanation_action" IS NOT NULL
        AND "explanation_needs_note" IS NOT NULL AND "explained_by_employee_id" IS NOT NULL AND "explained_at" IS NOT NULL
    )
    AND ("explanation_persistence" IS NULL OR "explanation_persistence" IN ('ONE_OFF', 'ONGOING'))
    AND ("explanation_needs_amount_minor" IS NULL OR "explanation_needs_amount_minor" >= 0)
    AND ("explanation_status" <> 'NOT_REQUIRED' OR "explained_at" IS NULL)
);

-- The explanation of a line moves only while its period waits for explanations, and only a line that was asked can be explained or marked: a signed period, a month and a green line keep what they are.
-- Finance signs by marking the lines still PENDING in the transaction that moves the period to SIGNED, so the period is still waiting when they are marked.
CREATE OR REPLACE FUNCTION budget_review_lines_explanation_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  period_state text;
BEGIN
  IF NEW.explanation_status IS DISTINCT FROM OLD.explanation_status
     OR NEW.explanation_cause IS DISTINCT FROM OLD.explanation_cause
     OR NEW.explanation_persistence IS DISTINCT FROM OLD.explanation_persistence
     OR NEW.explanation_action IS DISTINCT FROM OLD.explanation_action
     OR NEW.explanation_needs_amount_minor IS DISTINCT FROM OLD.explanation_needs_amount_minor
     OR NEW.explanation_needs_note IS DISTINCT FROM OLD.explanation_needs_note
     OR NEW.explained_by_employee_id IS DISTINCT FROM OLD.explained_by_employee_id
     OR NEW.explained_at IS DISTINCT FROM OLD.explained_at THEN
    SELECT state INTO period_state FROM budget_review_periods WHERE id = NEW.period_id;
    IF period_state IS DISTINCT FROM 'AWAITING_EXPLANATIONS' THEN
      RAISE EXCEPTION 'the explanation of a line moves only while its period waits for explanations (UPDATE rejected)' USING ERRCODE = 'restrict_violation';
    END IF;
    IF OLD.explanation_status NOT IN ('PENDING', 'EXPLAINED') THEN
      RAISE EXCEPTION 'a line that was not asked, or was closed unexplained, takes no explanation (UPDATE rejected)' USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS budget_review_lines_explanation_guard ON "budget_review_lines";
CREATE TRIGGER budget_review_lines_explanation_guard BEFORE UPDATE ON "budget_review_lines"
    FOR EACH ROW EXECUTE FUNCTION budget_review_lines_explanation_guard();
