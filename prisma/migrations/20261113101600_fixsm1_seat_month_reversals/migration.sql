-- FIX-SM1 SM1-06 (QĐ-111ae, QĐ-103r, US-06-06 AC-4): a month of the seats of a K2 pool may be charged again at any time, so what a seat-month applied to a commitment may have to
-- come back: the seat was taken back, its days moved, the department changed Cost Center. The guard of `budget_commitments` forbade `applied_minor` to ever go down, so the first
-- version kept what a row applied and could apply the commitment of another Cost Center twice. What comes back is now written to an append-only table of reversals (who, which
-- month, how much, why), and the guard accepts a decrease of `applied_minor` only when it equals what the reversals of the commitment add up to: `seat_month_reversed_minor` is the
-- running sum, checked against the table, and it moves with `applied_minor` in the same statement. A commitment that became an expense (`EXPENSED`) may be held again by such a
-- decrease and by nothing else. Expand only (one column, one table, the guard replaced); safe to run twice. It depends on `budget_commitments` only, not on a table of the
-- budget-cycle migrations (2026111310xxxx).

ALTER TABLE "budget_commitments" ADD COLUMN IF NOT EXISTS "seat_month_reversed_minor" bigint NOT NULL DEFAULT 0;
ALTER TABLE "budget_commitments" DROP CONSTRAINT IF EXISTS "budget_commitments_seat_month_reversed_check";
ALTER TABLE "budget_commitments" ADD CONSTRAINT "budget_commitments_seat_month_reversed_check" CHECK ("seat_month_reversed_minor" >= 0);

CREATE TABLE IF NOT EXISTS "budget_commitment_seat_month_reversals" (
    "id" uuid NOT NULL,
    "organization_id" uuid NOT NULL,
    "commitment_id" uuid NOT NULL,
    "subscription_id" uuid NOT NULL,
    "assignment_id" uuid NOT NULL,
    "department_id" uuid NOT NULL,
    "month" date NOT NULL,
    "amount_minor" bigint NOT NULL,
    "reason" text NOT NULL,
    "created_at" timestamptz(3) NOT NULL,
    CONSTRAINT "budget_commitment_seat_month_reversals_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "bcsmr_month_check" CHECK (EXTRACT(day FROM "month") = 1),
    CONSTRAINT "bcsmr_amount_check" CHECK ("amount_minor" > 0),
    CONSTRAINT "bcsmr_reason_check" CHECK ("reason" IN ('RECALCULATED', 'SEAT_NOT_ASKED'))
);

ALTER TABLE "budget_commitment_seat_month_reversals" DROP CONSTRAINT IF EXISTS "bcsmr_commitment_id_fkey";
ALTER TABLE "budget_commitment_seat_month_reversals" ADD CONSTRAINT "bcsmr_commitment_id_fkey"
    FOREIGN KEY ("commitment_id") REFERENCES "budget_commitments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX IF NOT EXISTS "bcsmr_commitment_idx" ON "budget_commitment_seat_month_reversals" ("commitment_id");
CREATE INDEX IF NOT EXISTS "bcsmr_subscription_month_idx" ON "budget_commitment_seat_month_reversals" ("subscription_id", "month");

-- A reversal is never changed or removed: it is the proof of why a commitment holds again what a seat-month had applied.
CREATE OR REPLACE FUNCTION budget_commitment_seat_month_reversals_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'budget_commitment_seat_month_reversals is append-only (% rejected)', TG_OP USING ERRCODE = 'restrict_violation';
END;
$$;
DROP TRIGGER IF EXISTS budget_commitment_seat_month_reversals_no_change ON "budget_commitment_seat_month_reversals";
CREATE TRIGGER budget_commitment_seat_month_reversals_no_change BEFORE UPDATE OR DELETE ON "budget_commitment_seat_month_reversals"
    FOR EACH ROW EXECUTE FUNCTION budget_commitment_seat_month_reversals_guard();
DROP TRIGGER IF EXISTS budget_commitment_seat_month_reversals_no_truncate ON "budget_commitment_seat_month_reversals";
CREATE TRIGGER budget_commitment_seat_month_reversals_no_truncate BEFORE TRUNCATE ON "budget_commitment_seat_month_reversals"
    FOR EACH STATEMENT EXECUTE FUNCTION budget_commitment_seat_month_reversals_guard();

-- The guard of the commitments, as it was (20261108400000) with one new way down for `applied_minor`: by exactly what the reversals recorded since, nothing else moving but the state back to HELD.
CREATE OR REPLACE FUNCTION budget_commitments_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  returned bigint := NEW.seat_month_reversed_minor - OLD.seat_month_reversed_minor;
BEGIN
  IF NEW.request_id <> OLD.request_id OR NEW.cost_center_id <> OLD.cost_center_id OR NEW.year <> OLD.year
     OR NEW.currency <> OLD.currency OR NEW.amount_minor <> OLD.amount_minor THEN
    RAISE EXCEPTION 'budget_commitments keeps the request, the Cost Center, the year and the amount it was made for (UPDATE rejected)'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF returned < 0 THEN
    RAISE EXCEPTION 'what a reversal gave back is never taken back (UPDATE rejected)' USING ERRCODE = 'restrict_violation';
  END IF;
  IF returned > 0 THEN
    -- A seat-month gives back what it applied: applied goes down by exactly the new reversals, whose sum is the running total, and the commitment is held again.
    IF OLD.state NOT IN ('HELD', 'EXPENSED') OR NEW.state <> 'HELD' OR NEW.released_minor <> OLD.released_minor
       OR OLD.applied_minor - NEW.applied_minor <> returned
       OR NEW.seat_month_reversed_minor <> (SELECT COALESCE(SUM(r.amount_minor), 0) FROM budget_commitment_seat_month_reversals r WHERE r.commitment_id = OLD.id) THEN
      RAISE EXCEPTION 'a commitment gets back from the seat-months only what a reversal recorded (UPDATE rejected)'
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.state <> 'HELD' THEN
    RAISE EXCEPTION 'a commitment that is % does not change again (UPDATE rejected)', OLD.state
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.released_minor < OLD.released_minor THEN
    RAISE EXCEPTION 'what went back to the budget does not come back (UPDATE rejected)'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.applied_minor < OLD.applied_minor THEN
    RAISE EXCEPTION 'what became an expense does not come back to the commitment (UPDATE rejected)'
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN NEW;
END;
$$;
