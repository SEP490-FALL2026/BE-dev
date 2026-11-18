-- Slice G2 (US-01-03): the three approval roles the Super Admin configures: the spending approver, the substitute
-- for when the approver has a conflict of interest, and the fallback approver for departments without a head. Each
-- has a history of who held it; at any moment there is at most one holder per role.

-- CreateEnum
CREATE TYPE "ApprovalRole" AS ENUM ('SPENDING_APPROVER', 'CONFLICT_SUBSTITUTE', 'FALLBACK_APPROVER');

-- CreateTable
CREATE TABLE "approval_role_holders" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "role" "ApprovalRole" NOT NULL,
    "employee_id" UUID NOT NULL,
    "held_from" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "held_until" TIMESTAMPTZ(3),
    "set_by" UUID,

    CONSTRAINT "approval_role_holders_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "approval_role_holders_employee_id_idx" ON "approval_role_holders"("employee_id");

ALTER TABLE "approval_role_holders"
  ADD CONSTRAINT "approval_role_holders_employee_id_fkey"
  FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "approval_role_holders"
  ADD CONSTRAINT "approval_role_holders_period_check"
  CHECK ("held_until" IS NULL OR "held_until" >= "held_from");

-- One current holder per role.
CREATE UNIQUE INDEX "approval_role_holders_one_current"
  ON "approval_role_holders"("organization_id", "role") WHERE "held_until" IS NULL;

-- US-01-03 AC-7 (OI-17, BR-13.12): the substitute is never the spending approver. The service serializes every
-- change to these roles behind one advisory lock, which is what makes this check safe against two writers at once;
-- the trigger is the last defence if something writes around the service.
CREATE FUNCTION approval_role_holders_distinct_approver_and_substitute() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."held_until" IS NULL AND NEW."role" IN ('SPENDING_APPROVER', 'CONFLICT_SUBSTITUTE') THEN
    IF EXISTS (
      SELECT 1 FROM "approval_role_holders" h
       WHERE h."organization_id" = NEW."organization_id"
         AND h."employee_id" = NEW."employee_id"
         AND h."held_until" IS NULL
         AND h."role" = CASE WHEN NEW."role" = 'SPENDING_APPROVER' THEN 'CONFLICT_SUBSTITUTE'::"ApprovalRole"
                             ELSE 'SPENDING_APPROVER'::"ApprovalRole" END
    ) THEN
      RAISE EXCEPTION 'the substitute for a conflict of interest cannot be the spending approver'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "approval_role_holders_distinct"
  BEFORE INSERT ON "approval_role_holders"
  FOR EACH ROW EXECUTE FUNCTION approval_role_holders_distinct_approver_and_substitute();
