-- PL-2.1 (QĐ-111ap, QĐ-111aq, QĐ-111be, R-6): the checklist a person answered when they decided, kept with the version of the policy that
-- asked it. One row is the answers given for one thing decided: a request, a person of a group (the line), a version of a budget, a
-- recommendation of a ghost seat. A batch or a group answers once and is kept once for each request or line. Added to and never changed:
-- what a decision was made on stays knowable. `employee`/`subject` ids are values of other contexts, not foreign keys; the version of the
-- policy is one of this one. Expand only; safe to run twice.

CREATE TABLE IF NOT EXISTS "decision_checklists" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "policy_version_id" UUID NOT NULL,
    "step_code" TEXT NOT NULL,
    "subject_kind" TEXT NOT NULL,
    "subject_id" UUID NOT NULL,
    "line_employee_id" UUID,
    "decided_by_employee_id" UUID NOT NULL,
    "decision" TEXT NOT NULL,
    "answers" JSONB NOT NULL,
    "has_no" BOOLEAN NOT NULL,
    "decided_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "decision_checklists_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "decision_checklists_step_check" CHECK ("step_code" IN ('1.2', '1.3', '1.6', '1.7', '4.7', '5.3', '5.4')),
    CONSTRAINT "decision_checklists_subject_check" CHECK ("subject_kind" IN ('ACCESS_REQUEST', 'BUDGET_VERSION', 'GHOST_SEAT_RECOMMENDATION')),
    CONSTRAINT "decision_checklists_line_check" CHECK ("line_employee_id" IS NULL OR "subject_kind" = 'ACCESS_REQUEST'),
    CONSTRAINT "decision_checklists_decision_check" CHECK (
        "decision" IN ('APPROVE', 'REJECT', 'RETURN', 'CONFIRM', 'COMPLETE', 'KEEP', 'EXEMPT', 'RECLAIM', 'ESCALATE')
    ),
    -- With a No the decision is one that does not go on: a refusal, a return, or the reclaim of a seat.
    CONSTRAINT "decision_checklists_no_check" CHECK (NOT "has_no" OR "decision" IN ('REJECT', 'RETURN', 'RECLAIM')),
    CONSTRAINT "decision_checklists_answers_check" CHECK (jsonb_typeof("answers") = 'array' AND jsonb_array_length("answers") BETWEEN 1 AND 30)
);

CREATE INDEX IF NOT EXISTS "decision_checklists_subject_kind_subject_id_idx" ON "decision_checklists"("subject_kind", "subject_id");
CREATE INDEX IF NOT EXISTS "decision_checklists_organization_id_step_code_decided_at_idx"
    ON "decision_checklists"("organization_id", "step_code", "decided_at");
CREATE INDEX IF NOT EXISTS "decision_checklists_policy_version_id_idx" ON "decision_checklists"("policy_version_id");

DO $$ BEGIN
  ALTER TABLE "decision_checklists" ADD CONSTRAINT "decision_checklists_policy_version_id_fkey"
    FOREIGN KEY ("policy_version_id") REFERENCES "policy_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- The answers are evidence: added to and never changed or deleted (the function is the one of the acknowledgements).
DROP TRIGGER IF EXISTS decision_checklists_append_only ON "decision_checklists";
CREATE TRIGGER decision_checklists_append_only BEFORE UPDATE OR DELETE ON "decision_checklists"
  FOR EACH ROW EXECUTE FUNCTION policies_append_only();
DROP TRIGGER IF EXISTS decision_checklists_no_truncate ON "decision_checklists";
CREATE TRIGGER decision_checklists_no_truncate BEFORE TRUNCATE ON "decision_checklists"
  FOR EACH STATEMENT EXECUTE FUNCTION policies_append_only();

-- The new value of ApprovalDecision (the migration before this one) is for the record of a step sent back: it carries its reason, and a line of
-- a group is never "returned" (the return of a group is the record of its step and the checklist of each line).
DO $$ BEGIN
  ALTER TABLE "approval_records" ADD CONSTRAINT "approval_records_return_reason_check" CHECK ("decision" <> 'RETURNED' OR "reason" IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "access_request_line_decisions" ADD CONSTRAINT "access_request_line_decisions_not_returned_check" CHECK ("decision" <> 'RETURNED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
