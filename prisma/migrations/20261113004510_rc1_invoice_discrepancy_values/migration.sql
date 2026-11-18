-- RC-1.1 (QĐ-111y, R-29, R-44): the two enums of the case of an invoice that differs. They are created here, a migration of their own that comes
-- before the one that uses them (D10), so no later migration ever has to read a value in the transaction that adds it.
-- Expand only; safe to run twice.

DO $$ BEGIN
    CREATE TYPE "InvoiceDiscrepancyState" AS ENUM ('OPEN', 'CLOSED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    CREATE TYPE "InvoiceDiscrepancyOutcome" AS ENUM ('EXPLAINED', 'OUT_OF_PROCESS_SUSPECTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
