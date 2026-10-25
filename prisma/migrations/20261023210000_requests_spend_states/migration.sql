-- The steps and states of a request that is decided as spend: the review of Finance and the decision of the spending
-- approver (US-06-12, US-06-13, US-06-01). A value added to an enum cannot be used in the transaction that adds it, so the
-- columns, constraints and tables that use these values come in the next migration.
ALTER TYPE "AccessRequestStepKind" ADD VALUE 'FINANCE_REVIEW';
ALTER TYPE "AccessRequestStepKind" ADD VALUE 'SPEND_APPROVAL';
ALTER TYPE "AccessRequestStepState" ADD VALUE 'COMPLETED';
ALTER TYPE "AccessRequestStepState" ADD VALUE 'CLOSED';
ALTER TYPE "AccessRequestState" ADD VALUE 'AWAITING_FINANCE_REVIEW';
ALTER TYPE "AccessRequestState" ADD VALUE 'AWAITING_BUDGET';
ALTER TYPE "AccessRequestState" ADD VALUE 'AWAITING_SPEND_DECISION';
