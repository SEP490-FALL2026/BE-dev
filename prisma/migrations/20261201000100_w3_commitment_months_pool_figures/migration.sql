-- W3-04, W3-05, W3-07, W3-09 (P3 M2):
--   1. Create `budget_commitment_months` for K2 monthly pooled-quota seat-month slices, with immutability trigger on key/share columns.
--   2. Add `pool_*` columns and `invoices_pool_figures` CHECK to `invoices`, plus append-only `invoice_pool_variance_resolutions` to close `in_review` without mutating `invoices`.
--   3. Add `shared_pool_*` snapshot columns to `budget_review_periods` and `prior_year_released_minor` to `budget_review_lines`, extending their immutability guards.
--   4. Add `realised_savings_recorded_at` and `realised_savings_invoice_id` to `subscription_renewals`, allowing one-time savings capture after `OUTCOME_RECORDED` (including 0 minor).
--
-- Rollback (down migration):
--   DROP TRIGGER IF EXISTS "budget_commitment_months_no_truncate" ON "budget_commitment_months";
--   DROP TRIGGER IF EXISTS "budget_commitment_months_immutable" ON "budget_commitment_months";
--   DROP FUNCTION IF EXISTS "budget_commitment_months_guard"();
--   DROP TABLE IF EXISTS "budget_commitment_months";
--   DROP TRIGGER IF EXISTS "invoice_pool_variance_resolutions_no_truncate" ON "invoice_pool_variance_resolutions";
--   DROP TRIGGER IF EXISTS "invoice_pool_variance_resolutions_immutable" ON "invoice_pool_variance_resolutions";
--   DROP FUNCTION IF EXISTS "invoice_pool_variance_resolutions_guard"();
--   DROP TABLE IF EXISTS "invoice_pool_variance_resolutions";
--   DROP INDEX IF EXISTS "invoices_pool_variance_month_idx";
--   ALTER TABLE "invoices" DROP CONSTRAINT IF EXISTS "invoices_pool_figures";
--   ALTER TABLE "invoices"
--     DROP COLUMN IF EXISTS "pool_variance_in_review",
--     DROP COLUMN IF EXISTS "pool_variance_month",
--     DROP COLUMN IF EXISTS "pool_variance_minor",
--     DROP COLUMN IF EXISTS "pool_expected_minor";
--   -- Restore previous `budget_review_periods_guard()`, `budget_review_lines_guard()`, and `subscription_renewals_guard()`.
--   ALTER TABLE "budget_review_periods" DROP CONSTRAINT IF EXISTS "budget_review_periods_shared_pool_non_negative";
--   ALTER TABLE "budget_review_periods"
--     DROP COLUMN IF EXISTS "shared_pool_variance_in_review_minor",
--     DROP COLUMN IF EXISTS "shared_pool_variance_minor",
--     DROP COLUMN IF EXISTS "shared_pool_replacement_minor",
--     DROP COLUMN IF EXISTS "shared_pool_device_lot_minor",
--     DROP COLUMN IF EXISTS "shared_pool_idle_minor";
--   ALTER TABLE "budget_review_lines" DROP CONSTRAINT IF EXISTS "budget_review_lines_prior_year_released_check";
--   ALTER TABLE "budget_review_lines" DROP COLUMN IF EXISTS "prior_year_released_minor";
--   -- Restore `subscription_renewals_savings_from_outcome` (> 0) and drop `realised_savings_invoice_id`, `realised_savings_recorded_at`.

-- 1. budget_commitment_months
CREATE TABLE "budget_commitment_months" (
    "commitment_id" UUID NOT NULL,
    "month" DATE NOT NULL,
    "seat_count" INTEGER NOT NULL,
    "share_minor" BIGINT NOT NULL,
    "applied_minor" BIGINT NOT NULL DEFAULT 0,
    "released_minor" BIGINT NOT NULL DEFAULT 0,
    "settled_at" TIMESTAMPTZ(3),

    CONSTRAINT "budget_commitment_months_pkey" PRIMARY KEY ("commitment_id", "month"),
    CONSTRAINT "budget_commitment_months_month_first" CHECK (EXTRACT(day FROM "month") = 1),
    CONSTRAINT "budget_commitment_months_seat_count_positive" CHECK ("seat_count" >= 1),
    CONSTRAINT "budget_commitment_months_amounts_non_negative" CHECK (
        "share_minor" >= 0 AND "applied_minor" >= 0 AND "released_minor" >= 0
    ),
    CONSTRAINT "budget_commitment_months_within_share" CHECK (
        "applied_minor" + "released_minor" <= "share_minor"
    )
);

CREATE INDEX "budget_commitment_months_month_settled_at_idx"
    ON "budget_commitment_months"("month", "settled_at");

ALTER TABLE "budget_commitment_months"
    ADD CONSTRAINT "budget_commitment_months_commitment_id_fkey"
    FOREIGN KEY ("commitment_id") REFERENCES "budget_commitments"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "budget_commitment_months_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW."commitment_id" IS DISTINCT FROM OLD."commitment_id"
       OR NEW."month" IS DISTINCT FROM OLD."month"
       OR NEW."seat_count" IS DISTINCT FROM OLD."seat_count"
       OR NEW."share_minor" IS DISTINCT FROM OLD."share_minor" THEN
      RAISE EXCEPTION 'budget_commitment_months keeps its commitment, month, seat count and share (UPDATE rejected)'
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'budget_commitment_months keeps its history (% rejected)', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER "budget_commitment_months_immutable"
    BEFORE UPDATE OR DELETE ON "budget_commitment_months"
    FOR EACH ROW EXECUTE FUNCTION "budget_commitment_months_guard"();

CREATE TRIGGER "budget_commitment_months_no_truncate"
    BEFORE TRUNCATE ON "budget_commitment_months"
    FOR EACH STATEMENT EXECUTE FUNCTION "budget_commitment_months_guard"();

-- 2. invoices pool figures & append-only review resolution
ALTER TABLE "invoices"
    ADD COLUMN "pool_expected_minor" BIGINT,
    ADD COLUMN "pool_variance_minor" BIGINT,
    ADD COLUMN "pool_variance_month" DATE,
    ADD COLUMN "pool_variance_in_review" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "invoices"
    ADD CONSTRAINT "invoices_pool_figures" CHECK (
        ("pool_variance_minor" IS NULL) = ("pool_variance_month" IS NULL)
        AND ("pool_expected_minor" IS NULL OR "pool_expected_minor" >= 0)
        AND ("pool_expected_minor" IS NOT NULL OR "pool_variance_in_review" = false)
        AND ("pool_variance_minor" IS NOT NULL OR ("pool_expected_minor" IS NULL AND "pool_variance_in_review" = false))
        AND ("pool_variance_month" IS NULL OR EXTRACT(day FROM "pool_variance_month") = 1)
    );

CREATE INDEX "invoices_pool_variance_month_idx" ON "invoices"("pool_variance_month");

CREATE TABLE "invoice_pool_variance_resolutions" (
    "invoice_id" UUID NOT NULL,
    "resolved_at" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),

    CONSTRAINT "invoice_pool_variance_resolutions_pkey" PRIMARY KEY ("invoice_id")
);

ALTER TABLE "invoice_pool_variance_resolutions"
    ADD CONSTRAINT "invoice_pool_variance_resolutions_invoice_id_fkey"
    FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "invoice_pool_variance_resolutions_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'invoice_pool_variance_resolutions is append-only (% rejected)', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER "invoice_pool_variance_resolutions_immutable"
    BEFORE UPDATE OR DELETE ON "invoice_pool_variance_resolutions"
    FOR EACH ROW EXECUTE FUNCTION "invoice_pool_variance_resolutions_guard"();

CREATE TRIGGER "invoice_pool_variance_resolutions_no_truncate"
    BEFORE TRUNCATE ON "invoice_pool_variance_resolutions"
    FOR EACH STATEMENT EXECUTE FUNCTION "invoice_pool_variance_resolutions_guard"();

-- 3. budget_review_periods & budget_review_lines extensions + guards
ALTER TABLE "budget_review_periods"
    ADD COLUMN "shared_pool_idle_minor" BIGINT,
    ADD COLUMN "shared_pool_device_lot_minor" BIGINT,
    ADD COLUMN "shared_pool_replacement_minor" BIGINT,
    ADD COLUMN "shared_pool_variance_minor" BIGINT,
    ADD COLUMN "shared_pool_variance_in_review_minor" BIGINT;

ALTER TABLE "budget_review_periods"
    ADD CONSTRAINT "budget_review_periods_shared_pool_non_negative" CHECK (
        ("shared_pool_idle_minor" IS NULL OR "shared_pool_idle_minor" >= 0)
        AND ("shared_pool_device_lot_minor" IS NULL OR "shared_pool_device_lot_minor" >= 0)
        AND ("shared_pool_replacement_minor" IS NULL OR "shared_pool_replacement_minor" >= 0)
    );

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
     OR NEW.annual_ceiling_minor IS DISTINCT FROM OLD.annual_ceiling_minor
     OR NEW.shared_pool_idle_minor IS DISTINCT FROM OLD.shared_pool_idle_minor
     OR NEW.shared_pool_device_lot_minor IS DISTINCT FROM OLD.shared_pool_device_lot_minor
     OR NEW.shared_pool_replacement_minor IS DISTINCT FROM OLD.shared_pool_replacement_minor
     OR NEW.shared_pool_variance_minor IS DISTINCT FROM OLD.shared_pool_variance_minor
     OR NEW.shared_pool_variance_in_review_minor IS DISTINCT FROM OLD.shared_pool_variance_in_review_minor THEN
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

ALTER TABLE "budget_review_lines"
    ADD COLUMN "prior_year_released_minor" BIGINT NOT NULL DEFAULT 0;

ALTER TABLE "budget_review_lines"
    ADD CONSTRAINT "budget_review_lines_prior_year_released_check" CHECK ("prior_year_released_minor" >= 0);

CREATE OR REPLACE FUNCTION budget_review_lines_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.period_id IS DISTINCT FROM OLD.period_id OR NEW.cost_center_id IS DISTINCT FROM OLD.cost_center_id
       OR NEW.base_minor IS DISTINCT FROM OLD.base_minor OR NEW.reserve_minor IS DISTINCT FROM OLD.reserve_minor
       OR NEW.spent_minor IS DISTINCT FROM OLD.spent_minor OR NEW.spent_after_month_minor IS DISTINCT FROM OLD.spent_after_month_minor
       OR NEW.prior_year_released_minor IS DISTINCT FROM OLD.prior_year_released_minor
       OR NEW.committed_minor IS DISTINCT FROM OLD.committed_minor
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

-- 4. subscription_renewals one-time realised savings on first new-period invoice
ALTER TABLE "subscription_renewals"
    ADD COLUMN "realised_savings_recorded_at" TIMESTAMPTZ(3),
    ADD COLUMN "realised_savings_invoice_id" UUID;

ALTER TABLE "subscription_renewals" DROP CONSTRAINT "subscription_renewals_savings_from_outcome";
ALTER TABLE "subscription_renewals"
    ADD CONSTRAINT "subscription_renewals_savings_from_outcome" CHECK (
        ("realised_savings_minor" IS NULL) = ("realised_savings_currency" IS NULL)
        AND ("realised_savings_recorded_at" IS NULL) = ("realised_savings_invoice_id" IS NULL)
        AND ("realised_savings_recorded_at" IS NULL OR "realised_savings_minor" IS NOT NULL)
        AND ("realised_savings_minor" IS NULL
             OR ("realised_savings_minor" >= 0 AND "outcome" = 'AS_DECIDED' AND "next_subscription_id" IS NOT NULL))
    );

CREATE OR REPLACE FUNCTION "subscription_renewals_guard"() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'A subscription renewal is never deleted'
            USING ERRCODE = '55000', CONSTRAINT = 'subscription_renewals_immutable';
    END IF;

    IF (NEW."id", NEW."organization_id", NEW."subscription_id", NEW."notice_basis", NEW."notice_base_date",
        NEW."proposed_choice", NEW."proposed_quantity", NEW."proposal_note", NEW."business_owner_opinion",
        NEW."proposed_by_employee_id", NEW."proposed_by_app_user_id", NEW."proposed_at", NEW."created_at")
       IS DISTINCT FROM
       (OLD."id", OLD."organization_id", OLD."subscription_id", OLD."notice_basis", OLD."notice_base_date",
        OLD."proposed_choice", OLD."proposed_quantity", OLD."proposal_note", OLD."business_owner_opinion",
        OLD."proposed_by_employee_id", OLD."proposed_by_app_user_id", OLD."proposed_at", OLD."created_at") THEN
        RAISE EXCEPTION 'The proposal of a renewal never changes'
            USING ERRCODE = '55000', CONSTRAINT = 'subscription_renewals_proposal_is_final';
    END IF;

    IF (OLD."state" = 'PROPOSED' AND NEW."state" NOT IN ('PROPOSED', 'DECIDED', 'STALE'))
       OR (OLD."state" = 'DECIDED' AND NEW."state" NOT IN ('DECIDED', 'OUTCOME_RECORDED'))
       OR (OLD."state" = 'OUTCOME_RECORDED' AND NEW."state" <> 'OUTCOME_RECORDED')
       OR (OLD."state" = 'STALE' AND NEW."state" <> 'STALE') THEN
        RAISE EXCEPTION 'A renewal moves one way: proposed, decided, outcome recorded (or closed as out of date from proposed)'
            USING ERRCODE = '55000', CONSTRAINT = 'subscription_renewals_one_way';
    END IF;

    IF OLD."state" <> 'PROPOSED'
       AND (NEW."decided_choice", NEW."decided_quantity", NEW."decision_reason", NEW."decided_by_employee_id",
            NEW."decided_by_app_user_id", NEW."decider_role", NEW."decided_at", NEW."decided_on",
            NEW."decided_after_deadline", NEW."execution_point", NEW."active_seats_at_decision", NEW."decision_snapshot")
           IS DISTINCT FROM
           (OLD."decided_choice", OLD."decided_quantity", OLD."decision_reason", OLD."decided_by_employee_id",
            OLD."decided_by_app_user_id", OLD."decider_role", OLD."decided_at", OLD."decided_on",
            OLD."decided_after_deadline", OLD."execution_point", OLD."active_seats_at_decision", OLD."decision_snapshot") THEN
        RAISE EXCEPTION 'A recorded decision of a renewal never changes'
            USING ERRCODE = '55000', CONSTRAINT = 'subscription_renewals_decision_is_final';
    END IF;

    IF OLD."state" = 'OUTCOME_RECORDED'
       AND (NEW."outcome", NEW."outcome_note", NEW."outcome_recorded_by_employee_id", NEW."outcome_recorded_by_app_user_id",
            NEW."outcome_recorded_at", NEW."vendor_follow_up_open", NEW."next_subscription_id")
           IS DISTINCT FROM
           (OLD."outcome", OLD."outcome_note", OLD."outcome_recorded_by_employee_id", OLD."outcome_recorded_by_app_user_id",
            OLD."outcome_recorded_at", OLD."vendor_follow_up_open", OLD."next_subscription_id") THEN
        RAISE EXCEPTION 'A recorded outcome of a renewal never changes'
            USING ERRCODE = '55000', CONSTRAINT = 'subscription_renewals_outcome_is_final';
    END IF;

    IF (OLD."realised_savings_minor" IS NOT NULL OR OLD."realised_savings_recorded_at" IS NOT NULL)
       AND (NEW."realised_savings_minor", NEW."realised_savings_currency",
            NEW."realised_savings_recorded_at", NEW."realised_savings_invoice_id")
           IS DISTINCT FROM
           (OLD."realised_savings_minor", OLD."realised_savings_currency",
            OLD."realised_savings_recorded_at", OLD."realised_savings_invoice_id") THEN
        RAISE EXCEPTION 'A recorded saving of a renewal never changes'
            USING ERRCODE = '55000', CONSTRAINT = 'subscription_renewals_savings_is_final';
    END IF;

    IF OLD."late_flagged_at" IS NOT NULL AND NEW."late_flagged_at" IS DISTINCT FROM OLD."late_flagged_at" THEN
        RAISE EXCEPTION 'The late flag of a renewal is set once and kept'
            USING ERRCODE = '55000', CONSTRAINT = 'subscription_renewals_late_is_final';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
