-- The end of a request whose beneficiary left (g6-leaver-request-closure, US-03-04 AC-25). A value added to an enum cannot be used in the
-- transaction that adds it, so the columns, constraints and rules that use these values come in the next migration.

-- The IT Admin closed the request because the person it was for left: not refused, not failed, not withdrawn (FR-2.5).
ALTER TYPE "AccessRequestState" ADD VALUE 'CANCELLED';

-- A request left the batch it was sent in, and a question of the spending approver to Finance was closed, because the request was cancelled.
ALTER TYPE "SpendBatchLeftReason" ADD VALUE 'REQUEST_CANCELLED';
ALTER TYPE "BudgetInformationCloseReason" ADD VALUE 'REQUEST_CANCELLED';
