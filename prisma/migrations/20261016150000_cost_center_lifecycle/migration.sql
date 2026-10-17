-- Slice G2 (US-04-09): Finance maintains the Cost Center catalogue. A Cost Center can be deactivated; one that is
-- deactivated can no longer be chosen for a department (AC-5). The history of a code is the audit trail; a code is
-- never deleted, and never renamed (the name can change, the code cannot).

-- CreateEnum
CREATE TYPE "CostCenterStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- AlterTable
ALTER TABLE "cost_centers"
  ADD COLUMN "status" "CostCenterStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "deactivated_at" TIMESTAMPTZ(3);

-- A Cost Center is inactive exactly when it has the moment it stopped being used.
ALTER TABLE "cost_centers"
  ADD CONSTRAINT "cost_centers_deactivation_consistent"
  CHECK (("status" = 'INACTIVE') = ("deactivated_at" IS NOT NULL));

-- I-3 and AC-5: a department is charged to a UNIT Cost Center that is still in use. The trigger only fires when a
-- department is inserted or its Cost Center changes, so a department whose Cost Center is deactivated later keeps
-- its history; what it can no longer do is be re-pointed at another inactive one.
CREATE OR REPLACE FUNCTION departments_require_unit_cost_center() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  center_kind "CostCenterKind";
  center_status "CostCenterStatus";
BEGIN
  SELECT kind, status INTO center_kind, center_status FROM cost_centers WHERE id = NEW.cost_center_id;
  IF center_kind IS DISTINCT FROM 'UNIT' THEN
    RAISE EXCEPTION 'a department must be charged to a UNIT cost center'
      USING ERRCODE = 'check_violation';
  END IF;
  IF center_status IS DISTINCT FROM 'ACTIVE' THEN
    RAISE EXCEPTION 'a department cannot be charged to a cost center that is no longer in use'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
