-- Guard: halt if blocking data remains
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "approval_role_holders") THEN
    RAISE EXCEPTION 'Cannot drop approval_role_holders: rows remain in approval_role_holders'
      USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "access_request_steps"
    WHERE "waiting_reason" IN (
      'NO_FALLBACK_APPROVER',
      'FALLBACK_IS_REQUESTER',
      'NO_CONFLICT_SUBSTITUTE',
      'SPENDING_APPROVER_IS_PARTY'
    )
  ) THEN
    RAISE EXCEPTION 'Cannot drop approval_role_holders: steps with legacy waiting_reasons remain'
      USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "access_request_steps"
    WHERE "kind" = 'NEED' AND "state" = 'PENDING' AND "routing_row" IN (3, 4)
  ) THEN
    RAISE EXCEPTION 'Cannot drop approval_role_holders: steps on legacy routing rows remain'
      USING ERRCODE = 'P0001';
  END IF;
END $$;

-- Rewrite role_grants_forbid_super_admin_for_heads_and_approvers to only check department head
CREATE OR REPLACE FUNCTION role_grants_forbid_super_admin_for_heads_and_approvers() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  holder_employee_id UUID;
  org_zone TEXT;
  org_today DATE;
BEGIN
  IF NEW."role" <> 'SUPER_ADMIN' OR NEW."revoked_at" IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT u."employee_id" INTO holder_employee_id FROM "app_users" u WHERE u."id" = NEW."app_user_id";
  SELECT o."time_zone" INTO org_zone FROM "organizations" o WHERE o."id" = NEW."organization_id";
  org_today := (now() AT TIME ZONE COALESCE(org_zone, 'UTC'))::date;

  IF EXISTS (
    SELECT 1 FROM "department_head_periods" h
     WHERE h."employee_id" = holder_employee_id
       AND (h."valid_to" IS NULL OR h."valid_to" > org_today)
  ) THEN
    RAISE EXCEPTION 'the Super Admin role cannot be held by someone who heads or will head a department'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "approval_role_holders_distinct" ON "approval_role_holders";
DROP FUNCTION IF EXISTS approval_role_holders_distinct_approver_and_substitute();
DROP TABLE "approval_role_holders";
DROP TYPE "ApprovalRole";

