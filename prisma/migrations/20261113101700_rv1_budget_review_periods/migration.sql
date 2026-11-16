-- RV-1 (QĐ-111ae, QĐ-111af, QĐ-111ai; R-2, R-37): the close of a month. Finance closes a month that has ended: the system writes, for each Cost Center that has an effective
-- budget of the year, a picture of the figures of that moment (budget, spent, held, waiting for the spend decision, remaining, the difference k of the invoices, the price
-- increase already known, the forecast of the end of the year, the pace and the light) and of the company (what the company spent with the shared pool in it, the line of the
-- pool against its reserve). The picture is never changed: a late invoice is a change after the picture, the next one shows it (R-2). Signing the period closes the month (a
-- quarterly review of March, June or September waits for the explanations of RV-3 before it is signed, and its state moves only forward). The figure columns of a line, and
-- the figures of a period, are refused to every UPDATE by a trigger; the columns RV-3 adds for the explanation are not among them. Expand only: two new tables and the
-- functions of their triggers; nothing is dropped or rewritten. The ids of the other contexts are values, not foreign keys. Safe to run twice. It depends on no table of the
-- budget-cycle migrations (2026111310xxxx).

CREATE TABLE IF NOT EXISTS "budget_review_periods" (
    "id" uuid NOT NULL,
    "organization_id" uuid NOT NULL,
    "year" integer NOT NULL,
    "month" integer NOT NULL,
    "kind" text NOT NULL,
    "state" text NOT NULL DEFAULT 'SNAPSHOT',
    "currency" char(3) NOT NULL,
    "snapshot_by_employee_id" uuid NOT NULL,
    "snapshot_at" timestamptz(3) NOT NULL,
    "signed_by_employee_id" uuid,
    "signed_at" timestamptz(3),
    "note" text,
    -- What the company spent in the year up to the close, the shared pool in it (MG-03), and the line of the pool (what was paid for and no seat-month took) against the reserve of the cycle.
    "company_spent_minor" bigint NOT NULL,
    "shared_pool_unallocated_minor" bigint NOT NULL,
    "shared_pool_reserve_minor" bigint,
    "annual_ceiling_minor" bigint,
    CONSTRAINT "budget_review_periods_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "budget_review_periods_year_check" CHECK ("year" BETWEEN 2000 AND 9999),
    CONSTRAINT "budget_review_periods_month_check" CHECK ("month" BETWEEN 1 AND 12),
    CONSTRAINT "budget_review_periods_kind_check" CHECK ("kind" IN ('MONTH', 'QUARTER') AND (("kind" = 'QUARTER') = ("month" IN (3, 6, 9)))),
    CONSTRAINT "budget_review_periods_state_check" CHECK ("state" IN ('SNAPSHOT', 'AWAITING_EXPLANATIONS', 'SIGNED')),
    CONSTRAINT "budget_review_periods_signed_check" CHECK (("state" = 'SIGNED') = ("signed_at" IS NOT NULL AND "signed_by_employee_id" IS NOT NULL)),
    CONSTRAINT "budget_review_periods_awaiting_check" CHECK ("state" <> 'AWAITING_EXPLANATIONS' OR "kind" = 'QUARTER'),
    CONSTRAINT "budget_review_periods_amounts_check" CHECK ("company_spent_minor" >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS "budget_review_periods_organization_id_year_month_key" ON "budget_review_periods" ("organization_id", "year", "month");
CREATE INDEX IF NOT EXISTS "budget_review_periods_year_month_idx" ON "budget_review_periods" ("year", "month");

CREATE TABLE IF NOT EXISTS "budget_review_lines" (
    "id" uuid NOT NULL,
    "period_id" uuid NOT NULL,
    "cost_center_id" uuid NOT NULL,
    "base_minor" bigint NOT NULL,
    "reserve_minor" bigint NOT NULL,
    "spent_minor" bigint NOT NULL,
    "committed_minor" bigint NOT NULL,
    "pending_spend_minor" bigint NOT NULL,
    "remaining_minor" bigint NOT NULL,
    -- The invoices of the Cost Center since 01/01: their price before tax and what they cost; k is the second over the first less one, in millionths (0 with no invoice).
    "invoice_net_minor" bigint NOT NULL,
    "invoice_actual_minor" bigint NOT NULL,
    "variance_ppm" bigint NOT NULL,
    "price_increase_minor" bigint NOT NULL,
    "forecast_minor" bigint NOT NULL,
    -- The spent over the base of the months gone, in hundredths of a percent, rounded up; null when the Cost Center has no base.
    "pace_basis_points" bigint,
    "light" text NOT NULL,
    CONSTRAINT "budget_review_lines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "budget_review_lines_light_check" CHECK ("light" IN ('GREEN', 'YELLOW', 'RED', 'UNDER')),
    CONSTRAINT "budget_review_lines_amounts_check" CHECK (
        "base_minor" >= 0 AND "reserve_minor" >= 0 AND "spent_minor" >= 0 AND "committed_minor" >= 0 AND "pending_spend_minor" >= 0
        AND "invoice_net_minor" >= 0 AND "invoice_actual_minor" >= "invoice_net_minor" AND "variance_ppm" >= 0
        AND "price_increase_minor" >= 0 AND "forecast_minor" >= 0
    )
);

ALTER TABLE "budget_review_lines" DROP CONSTRAINT IF EXISTS "budget_review_lines_period_id_fkey";
ALTER TABLE "budget_review_lines" ADD CONSTRAINT "budget_review_lines_period_id_fkey"
    FOREIGN KEY ("period_id") REFERENCES "budget_review_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS "budget_review_lines_period_id_cost_center_id_key" ON "budget_review_lines" ("period_id", "cost_center_id");
CREATE INDEX IF NOT EXISTS "budget_review_lines_cost_center_id_idx" ON "budget_review_lines" ("cost_center_id");

-- The figures of the picture are never changed, and the picture is never removed: a month closed on wrong figures is answered by the next one, not by editing this one (R-2).
CREATE OR REPLACE FUNCTION budget_review_lines_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.period_id IS DISTINCT FROM OLD.period_id OR NEW.cost_center_id IS DISTINCT FROM OLD.cost_center_id
       OR NEW.base_minor IS DISTINCT FROM OLD.base_minor OR NEW.reserve_minor IS DISTINCT FROM OLD.reserve_minor
       OR NEW.spent_minor IS DISTINCT FROM OLD.spent_minor OR NEW.committed_minor IS DISTINCT FROM OLD.committed_minor
       OR NEW.pending_spend_minor IS DISTINCT FROM OLD.pending_spend_minor OR NEW.remaining_minor IS DISTINCT FROM OLD.remaining_minor
       OR NEW.invoice_net_minor IS DISTINCT FROM OLD.invoice_net_minor OR NEW.invoice_actual_minor IS DISTINCT FROM OLD.invoice_actual_minor
       OR NEW.variance_ppm IS DISTINCT FROM OLD.variance_ppm OR NEW.price_increase_minor IS DISTINCT FROM OLD.price_increase_minor
       OR NEW.forecast_minor IS DISTINCT FROM OLD.forecast_minor OR NEW.pace_basis_points IS DISTINCT FROM OLD.pace_basis_points
       OR NEW.light IS DISTINCT FROM OLD.light THEN
      RAISE EXCEPTION 'the figures of a line of a review period are a picture and never change (UPDATE rejected)' USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'budget_review_lines keeps its picture (% rejected)', TG_OP USING ERRCODE = 'restrict_violation';
END;
$$;
DROP TRIGGER IF EXISTS budget_review_lines_no_change ON "budget_review_lines";
CREATE TRIGGER budget_review_lines_no_change BEFORE UPDATE OR DELETE ON "budget_review_lines"
    FOR EACH ROW EXECUTE FUNCTION budget_review_lines_guard();
DROP TRIGGER IF EXISTS budget_review_lines_no_truncate ON "budget_review_lines";
CREATE TRIGGER budget_review_lines_no_truncate BEFORE TRUNCATE ON "budget_review_lines"
    FOR EACH STATEMENT EXECUTE FUNCTION budget_review_lines_guard();

-- The period keeps what it was closed on; only its state moves, forward, and the signature is written once. A signed period does not change again.
CREATE OR REPLACE FUNCTION budget_review_periods_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  rank_old integer;
  rank_new integer;
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RAISE EXCEPTION 'budget_review_periods keeps its picture (% rejected)', TG_OP USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.state = 'SIGNED' THEN
    RAISE EXCEPTION 'a signed review period does not change again (UPDATE rejected)' USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.organization_id IS DISTINCT FROM OLD.organization_id OR NEW.year IS DISTINCT FROM OLD.year
     OR NEW.month IS DISTINCT FROM OLD.month OR NEW.kind IS DISTINCT FROM OLD.kind OR NEW.currency IS DISTINCT FROM OLD.currency
     OR NEW.snapshot_by_employee_id IS DISTINCT FROM OLD.snapshot_by_employee_id OR NEW.snapshot_at IS DISTINCT FROM OLD.snapshot_at
     OR NEW.company_spent_minor IS DISTINCT FROM OLD.company_spent_minor
     OR NEW.shared_pool_unallocated_minor IS DISTINCT FROM OLD.shared_pool_unallocated_minor
     OR NEW.shared_pool_reserve_minor IS DISTINCT FROM OLD.shared_pool_reserve_minor
     OR NEW.annual_ceiling_minor IS DISTINCT FROM OLD.annual_ceiling_minor THEN
    RAISE EXCEPTION 'the figures of a review period are a picture and never change (UPDATE rejected)' USING ERRCODE = 'restrict_violation';
  END IF;
  rank_old := CASE OLD.state WHEN 'SNAPSHOT' THEN 1 WHEN 'AWAITING_EXPLANATIONS' THEN 2 ELSE 3 END;
  rank_new := CASE NEW.state WHEN 'SNAPSHOT' THEN 1 WHEN 'AWAITING_EXPLANATIONS' THEN 2 ELSE 3 END;
  IF rank_new < rank_old THEN
    RAISE EXCEPTION 'a review period moves forward only (UPDATE rejected)' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS budget_review_periods_guard ON "budget_review_periods";
CREATE TRIGGER budget_review_periods_guard BEFORE UPDATE OR DELETE ON "budget_review_periods"
    FOR EACH ROW EXECUTE FUNCTION budget_review_periods_guard();
DROP TRIGGER IF EXISTS budget_review_periods_no_truncate ON "budget_review_periods";
CREATE TRIGGER budget_review_periods_no_truncate BEFORE TRUNCATE ON "budget_review_periods"
    FOR EACH STATEMENT EXECUTE FUNCTION budget_review_periods_guard();
