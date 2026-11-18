-- The K4 key pool (qd103-k4-key-pool, BR-MF1-09, QĐ-103d, QĐ-106d): a K4 revocation is completed by deactivating the key, and the
-- commitment of a K4 request granted from a free key of the pool goes back to the budget in full. New enum values only: a value added
-- here cannot be used in the same transaction, so whatever uses them comes in the next migration or in code.
ALTER TYPE "RevocationCompletion" ADD VALUE IF NOT EXISTS 'KEY_DEACTIVATED';
ALTER TYPE "CommitmentReleaseReason" ADD VALUE IF NOT EXISTS 'GRANTED_FROM_POOL';
