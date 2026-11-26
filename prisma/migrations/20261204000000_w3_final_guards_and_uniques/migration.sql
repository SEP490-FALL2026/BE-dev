-- W3-FINAL (F-21 DB: D-16, D-15, T-9):
-- 1) D-16: track transfer returns on `budget_commitments` (`transfer_returned_minor`) and extend `budget_commitments_guard()`
--    so an `EXPENSED` commitment can shift `d = transfer_d > 0` from `applied_minor` to `released_minor` while remaining
--    `EXPENSED`, strictly matching `-SUM(invoice_year_applications.applied_minor)` (`source = 'TRANSFER'`, `applied_minor < 0`).
-- 2) D-15: widen `seat_changes_grant_item_key` to `(subscription_line_id, request_id, beneficiary_employee_id)`.
-- 3) T-9: allow `STOCK` license lots on `ACCOUNT` K4 plans in `license_lots_guard()`.
--
-- Reversal (before any transfer return or STOCK/ACCOUNT lot is written):
--   CREATE OR REPLACE FUNCTION budget_commitments_guard() RETURNS trigger
--   LANGUAGE plpgsql AS $$
--   DECLARE
--     returned bigint := NEW.seat_month_reversed_minor - OLD.seat_month_reversed_minor;
--   BEGIN
--     IF NEW.request_id <> OLD.request_id OR NEW.cost_center_id <> OLD.cost_center_id OR NEW.year <> OLD.year
--        OR NEW.currency <> OLD.currency OR NEW.amount_minor <> OLD.amount_minor THEN
--       RAISE EXCEPTION 'budget_commitments keeps the request, the Cost Center, the year and the amount it was made for (UPDATE rejected)'
--         USING ERRCODE = 'restrict_violation';
--     END IF;
--     IF returned < 0 THEN
--       RAISE EXCEPTION 'what a reversal gave back is never taken back (UPDATE rejected)' USING ERRCODE = 'restrict_violation';
--     END IF;
--     IF returned > 0 THEN
--       IF OLD.state NOT IN ('HELD', 'EXPENSED') OR NEW.state <> 'HELD' OR NEW.released_minor <> OLD.released_minor
--          OR OLD.applied_minor - NEW.applied_minor <> returned
--          OR NEW.seat_month_reversed_minor <> (SELECT COALESCE(SUM(r.amount_minor), 0) FROM budget_commitment_seat_month_reversals r WHERE r.commitment_id = OLD.id) THEN
--         RAISE EXCEPTION 'a commitment gets back from the seat-months only what a reversal recorded (UPDATE rejected)'
--           USING ERRCODE = 'restrict_violation';
--       END IF;
--       RETURN NEW;
--     END IF;
--     IF OLD.state <> 'HELD' THEN
--       RAISE EXCEPTION 'a commitment that is % does not change again (UPDATE rejected)', OLD.state
--         USING ERRCODE = 'restrict_violation';
--     END IF;
--     IF NEW.released_minor < OLD.released_minor THEN
--       RAISE EXCEPTION 'what went back to the budget does not come back (UPDATE rejected)'
--         USING ERRCODE = 'restrict_violation';
--     END IF;
--     IF NEW.applied_minor < OLD.applied_minor THEN
--       RAISE EXCEPTION 'what became an expense does not come back to the commitment (UPDATE rejected)'
--         USING ERRCODE = 'restrict_violation';
--     END IF;
--     RETURN NEW;
--   END;
--   $$;
--   ALTER TABLE "budget_commitments" DROP CONSTRAINT IF EXISTS "budget_commitments_transfer_returned_check";
--   ALTER TABLE "budget_commitments" DROP COLUMN IF EXISTS "transfer_returned_minor";
--   DROP INDEX IF EXISTS "seat_changes_grant_item_key";
--   CREATE UNIQUE INDEX "seat_changes_grant_item_key" ON "seat_changes"("request_id", "beneficiary_employee_id")
--     WHERE "reason" = 'TOP_UP' AND "source" = 'GRANT';
--   CREATE OR REPLACE FUNCTION "license_lots_guard"() RETURNS trigger AS $$
--   DECLARE
--       plan_type "ProvisioningType";
--       plan_binding "PlanKeyBinding";
--       plan_console BOOLEAN;
--       plan_vendor UUID;
--       workspace_vendor UUID;
--       contract_vendor UUID;
--   BEGIN
--       SELECT p."provisioning_type", p."key_binding", p."has_admin_console", a."vendor_id"
--         INTO plan_type, plan_binding, plan_console, plan_vendor
--         FROM "plans" p JOIN "applications" a ON a."id" = p."application_id" WHERE p."id" = NEW."plan_id";
--       IF plan_type IS DISTINCT FROM 'K4' OR plan_binding IS NOT DISTINCT FROM 'DEVICE_BUNDLED' THEN
--           RAISE EXCEPTION 'A lot is of a K4 plan whose license is not bundled with the machine'
--               USING ERRCODE = '23514', CONSTRAINT = 'license_lots_plan_k4';
--       END IF;
--       IF NEW."workspace_id" IS NULL THEN
--           IF plan_console THEN
--               RAISE EXCEPTION 'A lot of a plan with an admin console is in a workspace'
--                   USING ERRCODE = '23514', CONSTRAINT = 'license_lots_workspace_required';
--           END IF;
--       ELSE
--           SELECT w."vendor_id" INTO workspace_vendor FROM "workspaces" w WHERE w."id" = NEW."workspace_id";
--           IF workspace_vendor IS DISTINCT FROM plan_vendor THEN
--               RAISE EXCEPTION 'The workspace of a lot is of the vendor of its plan'
--                   USING ERRCODE = '23514', CONSTRAINT = 'license_lots_workspace_vendor';
--           END IF;
--       END IF;
--       IF (NEW."purpose" = 'REQUEST' AND plan_binding IS DISTINCT FROM 'ACCOUNT')
--          OR (NEW."purpose" = 'STOCK' AND plan_binding IS DISTINCT FROM 'DEVICE_KEY') THEN
--           RAISE EXCEPTION 'The purpose of a lot fits the binding of its plan'
--               USING ERRCODE = '23514', CONSTRAINT = 'license_lots_purpose_binding';
--       END IF;
--       IF NEW."contract_id" IS NOT NULL THEN
--           SELECT c."vendor_id" INTO contract_vendor FROM "contracts" c WHERE c."id" = NEW."contract_id";
--           IF contract_vendor IS DISTINCT FROM plan_vendor THEN
--               RAISE EXCEPTION 'The contract of a lot is of the vendor of its plan'
--                   USING ERRCODE = '23514', CONSTRAINT = 'license_lots_contract_vendor';
--           END IF;
--       END IF;
--       RETURN NEW;
--   END;
--   $$ LANGUAGE plpgsql;

-- Pre-check: ensure no duplicate TOP_UP/GRANT rows under the new unique key and no invalid TRANSFER year applications.
DO $$
DECLARE
  dup_count bigint;
  bad_transfer_count bigint;
BEGIN
  SELECT COUNT(*) INTO dup_count
  FROM (
    SELECT "subscription_line_id", "request_id", "beneficiary_employee_id"
    FROM "seat_changes"
    WHERE "reason" = 'TOP_UP' AND "source" = 'GRANT'
    GROUP BY "subscription_line_id", "request_id", "beneficiary_employee_id"
    HAVING COUNT(*) > 1
  ) d;
  IF dup_count > 0 THEN
    RAISE EXCEPTION 'Pre-check failed: % duplicate (subscription_line_id, request_id, beneficiary_employee_id) TOP_UP rows in seat_changes', dup_count;
  END IF;

  SELECT COUNT(*) INTO bad_transfer_count
  FROM "budget_commitments" c
  LEFT JOIN (
    SELECT "commitment_id", COALESCE(-SUM("applied_minor"), 0)::bigint AS transfer_total
    FROM "invoice_year_applications"
    WHERE "source" = 'TRANSFER' AND "applied_minor" < 0
    GROUP BY "commitment_id"
  ) t ON t."commitment_id" = c."id"
  WHERE COALESCE(t.transfer_total, 0) < 0
     OR COALESCE(t.transfer_total, 0) > c."applied_minor";
  IF bad_transfer_count > 0 THEN
    RAISE EXCEPTION 'Pre-check failed: % budget_commitments rows have negative or excessive TRANSFER invoice_year_applications', bad_transfer_count;
  END IF;
END
$$;

-- D-16: transfer_returned_minor column, CHECK constraint, and updated budget_commitments_guard().
ALTER TABLE "budget_commitments" ADD COLUMN IF NOT EXISTS "transfer_returned_minor" bigint NOT NULL DEFAULT 0;
ALTER TABLE "budget_commitments" DROP CONSTRAINT IF EXISTS "budget_commitments_transfer_returned_check";
ALTER TABLE "budget_commitments" ADD CONSTRAINT "budget_commitments_transfer_returned_check" CHECK ("transfer_returned_minor" >= 0);

CREATE OR REPLACE FUNCTION budget_commitments_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  returned bigint := NEW.seat_month_reversed_minor - OLD.seat_month_reversed_minor;
  transfer_d bigint := NEW.transfer_returned_minor - OLD.transfer_returned_minor;
BEGIN
  IF NEW.request_id <> OLD.request_id OR NEW.cost_center_id <> OLD.cost_center_id OR NEW.year <> OLD.year
     OR NEW.currency <> OLD.currency OR NEW.amount_minor <> OLD.amount_minor THEN
    RAISE EXCEPTION 'budget_commitments keeps the request, the Cost Center, the year and the amount it was made for (UPDATE rejected)'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF returned < 0 THEN
    RAISE EXCEPTION 'what a reversal gave back is never taken back (UPDATE rejected)' USING ERRCODE = 'restrict_violation';
  END IF;
  IF transfer_d < 0 THEN
    RAISE EXCEPTION 'what a transfer returned is never taken back (UPDATE rejected)' USING ERRCODE = 'restrict_violation';
  END IF;
  IF returned > 0 THEN
    -- A seat-month gives back what it applied: applied goes down by exactly the new reversals, whose sum is the running total, and the commitment is held again.
    IF transfer_d <> 0 OR OLD.state NOT IN ('HELD', 'EXPENSED') OR NEW.state <> 'HELD' OR NEW.released_minor <> OLD.released_minor
       OR OLD.applied_minor - NEW.applied_minor <> returned
       OR NEW.seat_month_reversed_minor <> (SELECT COALESCE(SUM(r.amount_minor), 0) FROM budget_commitment_seat_month_reversals r WHERE r.commitment_id = OLD.id) THEN
      RAISE EXCEPTION 'a commitment gets back from the seat-months only what a reversal recorded (UPDATE rejected)'
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF transfer_d > 0 THEN
    -- D-16: a confirmed invoice transferred to another Cost Center returns the unreflected transfer share from applied_minor to released_minor while keeping EXPENSED.
    IF returned <> 0 OR OLD.state <> 'EXPENSED' OR NEW.state <> 'EXPENSED'
       OR OLD.applied_minor - NEW.applied_minor <> transfer_d
       OR NEW.released_minor - OLD.released_minor <> transfer_d
       OR NEW.transfer_returned_minor <> (
         SELECT COALESCE(-SUM(a.applied_minor), 0)::bigint
         FROM invoice_year_applications a
         WHERE a.commitment_id = OLD.id AND a.source = 'TRANSFER' AND a.applied_minor < 0
       ) THEN
      RAISE EXCEPTION 'a commitment transfers out only what negative TRANSFER year applications recorded (UPDATE rejected)'
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

-- D-15: widen seat_changes_grant_item_key to include subscription_line_id.
DROP INDEX IF EXISTS "seat_changes_grant_item_key";
CREATE UNIQUE INDEX "seat_changes_grant_item_key" ON "seat_changes"("subscription_line_id", "request_id", "beneficiary_employee_id")
    WHERE "reason" = 'TOP_UP' AND "source" = 'GRANT';

-- T-9: allow STOCK license lots for ACCOUNT as well as DEVICE_KEY K4 plans.
CREATE OR REPLACE FUNCTION "license_lots_guard"() RETURNS trigger AS $$
DECLARE
    plan_type "ProvisioningType";
    plan_binding "PlanKeyBinding";
    plan_console BOOLEAN;
    plan_vendor UUID;
    workspace_vendor UUID;
    contract_vendor UUID;
BEGIN
    SELECT p."provisioning_type", p."key_binding", p."has_admin_console", a."vendor_id"
      INTO plan_type, plan_binding, plan_console, plan_vendor
      FROM "plans" p JOIN "applications" a ON a."id" = p."application_id" WHERE p."id" = NEW."plan_id";
    IF plan_type IS DISTINCT FROM 'K4' OR plan_binding IS NOT DISTINCT FROM 'DEVICE_BUNDLED' THEN
        RAISE EXCEPTION 'A lot is of a K4 plan whose license is not bundled with the machine'
            USING ERRCODE = '23514', CONSTRAINT = 'license_lots_plan_k4';
    END IF;
    IF NEW."workspace_id" IS NULL THEN
        IF plan_console THEN
            RAISE EXCEPTION 'A lot of a plan with an admin console is in a workspace'
                USING ERRCODE = '23514', CONSTRAINT = 'license_lots_workspace_required';
        END IF;
    ELSE
        SELECT w."vendor_id" INTO workspace_vendor FROM "workspaces" w WHERE w."id" = NEW."workspace_id";
        IF workspace_vendor IS DISTINCT FROM plan_vendor THEN
            RAISE EXCEPTION 'The workspace of a lot is of the vendor of its plan'
                USING ERRCODE = '23514', CONSTRAINT = 'license_lots_workspace_vendor';
        END IF;
    END IF;
    IF (NEW."purpose" = 'REQUEST' AND plan_binding IS DISTINCT FROM 'ACCOUNT')
       OR (NEW."purpose" = 'STOCK' AND (plan_binding IS NULL OR plan_binding NOT IN ('ACCOUNT', 'DEVICE_KEY'))) THEN
        RAISE EXCEPTION 'The purpose of a lot fits the binding of its plan'
            USING ERRCODE = '23514', CONSTRAINT = 'license_lots_purpose_binding';
    END IF;
    IF NEW."contract_id" IS NOT NULL THEN
        SELECT c."vendor_id" INTO contract_vendor FROM "contracts" c WHERE c."id" = NEW."contract_id";
        IF contract_vendor IS DISTINCT FROM plan_vendor THEN
            RAISE EXCEPTION 'The contract of a lot is of the vendor of its plan'
                USING ERRCODE = '23514', CONSTRAINT = 'license_lots_contract_vendor';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
