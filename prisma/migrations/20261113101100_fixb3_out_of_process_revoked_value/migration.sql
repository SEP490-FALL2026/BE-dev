-- FIX-B3 B3C-01 (QĐ-104j, US-13-05 AC-20, AC-25): a case outside the process on a company asset can end as revoked. The value stands alone in its migration, before
-- the one that uses it (D10). Expand only; safe to run twice.
ALTER TYPE "OutOfProcessOutcome" ADD VALUE IF NOT EXISTS 'REVOKED';
