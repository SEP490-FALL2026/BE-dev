-- The refusal of the IT Admin at the gate of the assessment (US-05-18): a request that ends there, and an assessment that
-- records the refusal. A value added to an enum cannot be used in the transaction that adds it, so the columns and the
-- constraint that use these values come in the next migration.
ALTER TYPE "AccessRequestState" ADD VALUE 'IT_REJECTED';
ALTER TYPE "AssessmentStatus" ADD VALUE 'REJECTED';
