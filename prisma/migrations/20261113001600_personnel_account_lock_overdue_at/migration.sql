-- MF-2 MF2-E review (b) (D-50, D-68): the system tells, once for a case, that the lock of the company account of a departure blocked now is late
-- (`ACCOUNT_LOCK_OVERDUE`, QĐ-94m(12), R-1). The pass kept "once" in the key of the notice, which is unique for a recipient and an event key, so
-- a new IT Admin in charge (or the Super Admin changing) between two passes was told a second time and a second audit event was written. This
-- column is what keeps it from telling twice, however the recipients change, as `block_announced_at` does for the block moment.
-- Expand only: nullable, nothing is dropped and nothing is backfilled (this release has not told any case yet). Safe to run twice.
ALTER TABLE "offboarding_cases" ADD COLUMN IF NOT EXISTS "account_lock_overdue_at" TIMESTAMPTZ(3);
