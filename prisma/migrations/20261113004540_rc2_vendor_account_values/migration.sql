-- RC-2.1 (QĐ-111y, R-18, R-45, C-4): the enums of the review of the accounts at the vendor (`SBF-08`) and of the cases outside the process
-- (`SBF-07a`). They are created here, a migration of their own that comes before the ones that use them (D10), so no later migration ever has to
-- read a value in the transaction that adds it. Expand only; safe to run twice.

-- Where a difference between what the company has on record and what the vendor shows came from.
DO $$ BEGIN
    CREATE TYPE "VendorAccountDiscrepancySource" AS ENUM ('NO_ASSIGNMENT', 'UNMATCHED_IDENTITY', 'INVOICE_DIFFERENCE', 'COLLECTOR_UNLISTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    CREATE TYPE "VendorAccountDiscrepancyState" AS ENUM ('OPEN', 'DECIDED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    CREATE TYPE "VendorAccountDecision" AS ENUM ('LEGALIZE_VIA_REQUEST', 'REVOKE', 'FALSE_ALARM', 'OUT_OF_PROCESS');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    CREATE TYPE "OutOfProcessCaseState" AS ENUM ('OPEN', 'CLOSED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    CREATE TYPE "OutOfProcessOutcome" AS ENUM ('FALSE_ALARM', 'RECORD_SPENT', 'REPORT_ONLY');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
