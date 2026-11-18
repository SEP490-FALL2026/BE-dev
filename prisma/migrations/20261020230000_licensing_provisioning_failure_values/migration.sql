-- The values the handling of a failed task needs (g4-provisioning-failure-handling, US-07-04). They are added alone, in
-- their own migration, because a value added to an enum cannot be used in the transaction that adds it: the constraints
-- that name them are in the next migration.

-- AlterEnum
ALTER TYPE "ProvisioningTaskKind" ADD VALUE 'REVOKE';
ALTER TYPE "ProvisioningTaskStatus" ADD VALUE 'RETRY_SCHEDULED';
ALTER TYPE "ProvisioningTaskStatus" ADD VALUE 'CLOSED_FAILED';

-- CreateEnum
CREATE TYPE "ProvisioningFailureKind" AS ENUM ('TRANSIENT', 'PERMANENT', 'AUTHENTICATION', 'QUOTA_EXCEEDED', 'NOT_DONE');
