-- The values the decision of the spending approver needs (US-06-01, US-06-08). A value added to an enum cannot be used in the
-- transaction that adds it, so the table and constraints that use them come in the next migration.
ALTER TYPE "BudgetCheckTrigger" ADD VALUE 'SPEND_DECISION';
ALTER TYPE "ApprovalDeciderRole" ADD VALUE 'CONFLICT_SUBSTITUTE';
