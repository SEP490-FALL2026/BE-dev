-- G9-02 (SPEC mf1-mf4 §4b RV-07, M-06, M-10): the two reasons of the release by day. Only enum values, so it runs on a database
-- with data and needs no backfill; the values are not used in this migration (a value added is not usable in the same transaction).
ALTER TYPE "CommitmentReleaseReason" ADD VALUE IF NOT EXISTS 'REVOKED';
ALTER TYPE "CommitmentReleaseReason" ADD VALUE IF NOT EXISTS 'LATE_GRANT';
