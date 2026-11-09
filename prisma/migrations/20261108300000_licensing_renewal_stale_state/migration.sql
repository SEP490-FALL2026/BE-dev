-- A renewal proposal that went out of date is closed by the confirmation that found it so (A-H2): the IT Admin proposes again.
-- The new value is used by the next migration (a new enum value cannot be used in the transaction that adds it).
ALTER TYPE "RenewalState" ADD VALUE 'STALE';
