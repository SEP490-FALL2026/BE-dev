-- W3-04, W3-05, W3-07 (P3 M3): add enum values and expand `mismatches` CHECK for pool variance discrepancy cases.
-- Irreversible (DB-05): PostgreSQL `ALTER TYPE ... ADD VALUE` cannot be dropped without recreating the enum type.
-- Keep this migration minimal; do not reference newly added enum values in queries or defaults in the same transaction.

ALTER TYPE "CommitmentReleaseReason" ADD VALUE IF NOT EXISTS 'MONTH_END';
ALTER TYPE "CommitmentReleaseReason" ADD VALUE IF NOT EXISTS 'YEAR_END_SEAT_MONTHS';
ALTER TYPE "InvoiceDiscrepancyOutcome" ADD VALUE IF NOT EXISTS 'EXCHANGE_RATE_LINE_PRICE_UPDATED';

ALTER TABLE "invoice_discrepancy_cases" DROP CONSTRAINT "invoice_discrepancy_cases_mismatches_check";
ALTER TABLE "invoice_discrepancy_cases"
    ADD CONSTRAINT "invoice_discrepancy_cases_mismatches_check"
    CHECK ("mismatches" <@ ARRAY['QUANTITY', 'UNIT_PRICE', 'EXPECTED_AMOUNT']::text[]);
