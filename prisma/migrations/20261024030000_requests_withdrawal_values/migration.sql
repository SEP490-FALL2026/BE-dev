-- The ends of a request that its requester withdraws (US-05-08) and of the work it had led to. A value added to an enum cannot
-- be used in the transaction that adds it, so the columns, constraints and rules that use these values come in the next migration.

-- The requester withdrew while the grant failed: the request waits for the IT Admin to close the task as cancelled.
ALTER TYPE "AccessRequestState" ADD VALUE 'AWAITING_IT_CLOSE';
-- The request ended because its requester withdrew it: not refused, not failed.
ALTER TYPE "AccessRequestState" ADD VALUE 'WITHDRAWN';

-- A grant that was cancelled, which is not a grant that failed (FR-2.5).
ALTER TYPE "ProvisioningTaskStatus" ADD VALUE 'CANCELLED';

-- A request left the batch it was sent in because it was withdrawn.
ALTER TYPE "SpendBatchLeftReason" ADD VALUE 'REQUEST_WITHDRAWN';
