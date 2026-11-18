-- The states a request and its need step reach once the need step is decided (US-05-04). PostgreSQL does not let a new
-- enum value be used in the transaction that adds it, so the constraints that use them are in the next migration.
ALTER TYPE "AccessRequestState" ADD VALUE 'AWAITING_EXECUTION';
ALTER TYPE "AccessRequestState" ADD VALUE 'AWAITING_SPEND_SUBMISSION';
ALTER TYPE "AccessRequestState" ADD VALUE 'REJECTED';
ALTER TYPE "AccessRequestStepState" ADD VALUE 'APPROVED';
ALTER TYPE "AccessRequestStepState" ADD VALUE 'REJECTED';
