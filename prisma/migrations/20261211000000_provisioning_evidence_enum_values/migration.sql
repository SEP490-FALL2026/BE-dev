-- Enum values are committed before the CHECK constraints that use them.
ALTER TYPE "DocumentPurpose" ADD VALUE IF NOT EXISTS 'PROVISIONING_EVIDENCE';
ALTER TYPE "DocumentPurpose" ADD VALUE IF NOT EXISTS 'ACCESS_CUT_EVIDENCE';
