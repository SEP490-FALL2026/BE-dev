-- The kinds of a version's history for its documents (US-06-09 AC-26). Not reversible (DB-05): a value added to an enum is never
-- removed. PostgreSQL does not let a new enum value be used in the transaction that adds it, so the shape check that names
-- them is rebuilt in the next migration.
ALTER TYPE "BudgetVersionHistoryKind" ADD VALUE 'ATTACHMENT_ADDED';
ALTER TYPE "BudgetVersionHistoryKind" ADD VALUE 'ATTACHMENT_REMOVED';

