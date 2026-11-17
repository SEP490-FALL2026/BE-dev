-- AD-1 (QĐ-111ag, QĐ-111bh; R-33, R-36, R-40, R-48, C-1): the adjustment of the budget in the year. One record, four kinds: SUPPLEMENT (from what is not allocated under
-- the annual ceiling to a Cost Center), TRANSFER (between two Cost Centers, with the reason COST_CENTER_CHANGE when a department changed its Cost Center), RETURN (a Cost
-- Center gives back to what is not allocated) and CEILING_REDUCTION (the annual ceiling goes down, from what is not allocated). Finance makes one, the spending approver
-- decides it; an adjustment is added to or taken from the base of a Cost Center, the reserve stays. A Cost Center with no version of the year that is given money gets one
-- when the adjustment is approved (BudgetVersionOrigin ADJUSTMENT, base = the amount, reserve 0, R-48): `created_version_id` says which, so that the amount is not counted
-- twice (once in the base of that version and once as an adjustment).
-- Expand only: one table, the function of its triggers, and the check of the source of a version widened to the new origin (every row it held before still holds). The
-- value ADJUSTMENT of BudgetVersionOrigin was added by 20261113100500_budgets_values. The ids of the Cost Centers are values of another context, not foreign keys. Safe to run twice.

CREATE TABLE IF NOT EXISTS "budget_adjustments" (
    "id" uuid NOT NULL,
    "organization_id" uuid NOT NULL,
    "year" integer NOT NULL,
    "kind" text NOT NULL,
    "from_cost_center_id" uuid,
    "to_cost_center_id" uuid,
    "amount_minor" bigint NOT NULL,
    "currency" char(3) NOT NULL,
    "reason" text NOT NULL,
    "transfer_reason" text,
    "state" text NOT NULL DEFAULT 'PENDING',
    "created_by_employee_id" uuid NOT NULL,
    "created_at" timestamptz(3) NOT NULL,
    "decided_by_employee_id" uuid,
    "decided_at" timestamptz(3),
    "decision_reason" text,
    -- The version made for the Cost Center that is given money when it had none (R-48); only an approved supplement or transfer has one.
    "created_version_id" uuid,
    CONSTRAINT "budget_adjustments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "budget_adjustments_year_check" CHECK ("year" BETWEEN 2000 AND 9999),
    CONSTRAINT "budget_adjustments_amount_check" CHECK ("amount_minor" > 0),
    CONSTRAINT "budget_adjustments_reason_check" CHECK (btrim("reason") <> '' AND char_length("reason") <= 1000),
    CONSTRAINT "budget_adjustments_kind_check" CHECK (
        ("kind" = 'SUPPLEMENT' AND "from_cost_center_id" IS NULL AND "to_cost_center_id" IS NOT NULL)
        OR ("kind" = 'TRANSFER' AND "from_cost_center_id" IS NOT NULL AND "to_cost_center_id" IS NOT NULL AND "from_cost_center_id" <> "to_cost_center_id")
        OR ("kind" = 'RETURN' AND "from_cost_center_id" IS NOT NULL AND "to_cost_center_id" IS NULL)
        OR ("kind" = 'CEILING_REDUCTION' AND "from_cost_center_id" IS NULL AND "to_cost_center_id" IS NULL)
    ),
    CONSTRAINT "budget_adjustments_transfer_reason_check" CHECK (
        "transfer_reason" IS NULL OR ("kind" = 'TRANSFER' AND "transfer_reason" = 'COST_CENTER_CHANGE')
    ),
    CONSTRAINT "budget_adjustments_state_check" CHECK ("state" IN ('PENDING', 'APPROVED', 'REJECTED')),
    CONSTRAINT "budget_adjustments_decision_check" CHECK (
        ("state" = 'PENDING' AND "decided_by_employee_id" IS NULL AND "decided_at" IS NULL AND "decision_reason" IS NULL)
        OR ("state" <> 'PENDING' AND "decided_by_employee_id" IS NOT NULL AND "decided_at" IS NOT NULL)
    ),
    CONSTRAINT "budget_adjustments_decision_reason_check" CHECK (
        ("decision_reason" IS NULL OR (btrim("decision_reason") <> '' AND char_length("decision_reason") <= 1000))
        AND ("state" <> 'REJECTED' OR "decision_reason" IS NOT NULL)
    ),
    CONSTRAINT "budget_adjustments_created_version_check" CHECK (
        "created_version_id" IS NULL OR ("state" = 'APPROVED' AND "to_cost_center_id" IS NOT NULL)
    )
);

ALTER TABLE "budget_adjustments" DROP CONSTRAINT IF EXISTS "budget_adjustments_created_version_id_fkey";
ALTER TABLE "budget_adjustments" ADD CONSTRAINT "budget_adjustments_created_version_id_fkey"
    FOREIGN KEY ("created_version_id") REFERENCES "budget_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX IF NOT EXISTS "budget_adjustments_organization_id_year_state_idx" ON "budget_adjustments" ("organization_id", "year", "state");
CREATE INDEX IF NOT EXISTS "budget_adjustments_to_cost_center_id_year_idx" ON "budget_adjustments" ("to_cost_center_id", "year");
CREATE INDEX IF NOT EXISTS "budget_adjustments_from_cost_center_id_year_idx" ON "budget_adjustments" ("from_cost_center_id", "year");

-- An adjustment says what it says for good: it is decided once (pending to approved or rejected, with the version it made), and it is never removed. What Finance asked for
-- is never edited; a mistake is answered by a new adjustment that goes the other way.
CREATE OR REPLACE FUNCTION budget_adjustments_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RAISE EXCEPTION 'budget_adjustments keeps what was asked (% rejected)', TG_OP USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.state <> 'PENDING' THEN
    RAISE EXCEPTION 'an adjustment that was decided does not change again (UPDATE rejected)' USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.organization_id IS DISTINCT FROM OLD.organization_id OR NEW.year IS DISTINCT FROM OLD.year
     OR NEW.kind IS DISTINCT FROM OLD.kind OR NEW.from_cost_center_id IS DISTINCT FROM OLD.from_cost_center_id
     OR NEW.to_cost_center_id IS DISTINCT FROM OLD.to_cost_center_id OR NEW.amount_minor IS DISTINCT FROM OLD.amount_minor
     OR NEW.currency IS DISTINCT FROM OLD.currency OR NEW.reason IS DISTINCT FROM OLD.reason
     OR NEW.transfer_reason IS DISTINCT FROM OLD.transfer_reason OR NEW.created_by_employee_id IS DISTINCT FROM OLD.created_by_employee_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'what an adjustment asks for never changes (UPDATE rejected)' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS budget_adjustments_guard ON "budget_adjustments";
CREATE TRIGGER budget_adjustments_guard BEFORE UPDATE OR DELETE ON "budget_adjustments"
    FOR EACH ROW EXECUTE FUNCTION budget_adjustments_guard();
DROP TRIGGER IF EXISTS budget_adjustments_no_truncate ON "budget_adjustments";
CREATE TRIGGER budget_adjustments_no_truncate BEFORE TRUNCATE ON "budget_adjustments"
    FOR EACH STATEMENT EXECUTE FUNCTION budget_adjustments_guard();

-- A version made by an adjustment has no proposal behind it, as the one made from the baseline has none (R-48).
ALTER TABLE "budget_versions" DROP CONSTRAINT "budget_versions_source_check";
ALTER TABLE "budget_versions"
  ADD CONSTRAINT "budget_versions_source_check" CHECK (
    ("kind" = 'INITIAL' AND "based_on_version_id" IS NULL
      AND ("proposal_id" IS NULL) = ("origin" IN ('BASELINE_NO_HEAD', 'BASELINE_NO_PROPOSAL', 'ADJUSTMENT')))
    OR ("kind" = 'REVISION' AND "based_on_version_id" IS NOT NULL AND "proposal_id" IS NULL AND "origin" = 'PROPOSAL')
  );
