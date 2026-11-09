-- The commitments made on 01/01 (`FR-5.8`(6), `BR-MF1-09e`, `QĐ-109a`): a request whose right goes on into the new year, or that was approved and
-- not yet granted, holds one commitment for the new year, made by a pass of the system and not by a decision. Only a request has one (`QĐ-109a`),
-- so `request_id` stays NOT NULL and nothing else changes in how a commitment is read. No grant to the runtime role here (RV-28).

-- 1. Where a commitment came from, and what one seat cost a month when it was made (what the release by day of a later slice takes from). A
-- commitment written before is of an approval; the price of a month was not kept for it.
CREATE TYPE "CommitmentOrigin" AS ENUM ('APPROVAL', 'YEAR_START');

ALTER TABLE "budget_commitments"
    ADD COLUMN "origin" "CommitmentOrigin" NOT NULL DEFAULT 'APPROVAL',
    ADD COLUMN "seat_monthly_minor" BIGINT;

ALTER TABLE "budget_commitments"
    ADD CONSTRAINT "budget_commitments_seat_monthly_check" CHECK ("seat_monthly_minor" IS NULL OR "seat_monthly_minor" > 0),
    -- No check backs a commitment of 01/01: nobody decided it (`snapshot_check_id` is the check of a decision).
    ADD CONSTRAINT "budget_commitments_year_start_no_check" CHECK ("origin" <> 'YEAR_START' OR "snapshot_check_id" IS NULL);

-- 2. The mark of the pass of an organization and a year: it makes the pass idempotent and says what it did.
CREATE TABLE "year_start_commitment_runs" (
    "organization_id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "started_at" TIMESTAMPTZ(3) NOT NULL,
    "completed_at" TIMESTAMPTZ(3),
    "run_count" INTEGER NOT NULL DEFAULT 1,
    "created_count" INTEGER NOT NULL DEFAULT 0,
    "skipped_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "year_start_commitment_runs_pkey" PRIMARY KEY ("organization_id", "year"),
    CONSTRAINT "year_start_commitment_runs_counts_check" CHECK ("run_count" >= 1 AND "created_count" >= 0 AND "skipped_count" >= 0)
);

ALTER TABLE "year_start_commitment_runs"
    ADD CONSTRAINT "year_start_commitment_runs_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 3. Nothing is made backwards: the year of the deployment is marked done for every organization that exists, so the first pass of the system
-- is the one of the next 01/01. (An organization made later has no mark of an earlier year, and its first pass only marks its own year.)
INSERT INTO "year_start_commitment_runs"
    ("organization_id", "year", "started_at", "completed_at", "run_count", "created_count", "skipped_count")
SELECT "id", EXTRACT(YEAR FROM (now() AT TIME ZONE "time_zone"))::int, now(), now(), 1, 0, 0
  FROM "organizations";
