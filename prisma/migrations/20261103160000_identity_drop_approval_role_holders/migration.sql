-- QĐ-93 Phase B (`qd93-remove-fallback-substitute-approvers`, Task 13): drops the table of the approval roles, the trigger and the
-- function that guarded it, and the `ApprovalRole` type, and removes the half of the Super Admin exclusion trigger that read it.
--
-- Never fixes anything of its own accord: when the data still needs what is being dropped, it stops and lists every such row (the
-- three kinds of the spec, (i) to (iii)); the Super Admin puts them right in the application and deploys again. The rows of
-- `approval_role_holders` themselves do not stop it: nothing in the application can write or close them any more, and the history
-- of who held a role stays in the Audit Trail (`APPROVAL_ROLE.CHANGED`, OD-5).
DO $$
DECLARE
  problems text;
BEGIN
  SELECT string_agg(v.line, E'\n' ORDER BY v.line) INTO problems FROM (
    -- (i) an open Request of which the spending approver is a party: the requester, a beneficiary, a live line, or the person
    --     responsible for the service account. The substitute that decided it is gone, so nobody could.
    SELECT 'SPENDING_APPROVER_IS_PARTY ' || e."employee_code" || ' request ' || r."id"::text AS line
      FROM "role_grants" g
      JOIN "app_users" u ON u."id" = g."app_user_id"
      JOIN "employees" e ON e."id" = u."employee_id"
      JOIN "access_requests" r ON r."organization_id" = g."organization_id"
     WHERE g."role" = 'SPENDING_APPROVER' AND g."revoked_at" IS NULL
       AND r."state" NOT IN ('REJECTED', 'IT_REJECTED', 'COMPLETED', 'FAILED', 'WITHDRAWN', 'CANCELLED', 'DRAFT')
       AND (r."requester_employee_id" = e."id"
            OR EXISTS (SELECT 1 FROM "access_request_beneficiaries" b
                        WHERE b."request_id" = r."id" AND b."employee_id" = e."id")
            OR EXISTS (SELECT 1 FROM "access_request_lines" l
                        WHERE l."request_id" = r."id" AND l."employee_id" = e."id"
                          AND l."state" NOT IN ('NEED_REJECTED', 'SPEND_REJECTED', 'COMPLETED', 'FAILED', 'WITHDRAWN',
                                                'DROPPED', 'CANCELLED'))
            OR EXISTS (SELECT 1 FROM "access_request_service_accounts" a
                        WHERE a."request_id" = r."id" AND a."responsible_employee_id" = e."id"))
    UNION ALL
    -- (ii) a step of the old routing: a need step pending on row 3 or 4 (the approver of last resort held it), or a step that
    --      waits for a reason that only the old rule gave. A waiting step on row 4 for NO_DEPARTMENT_HEAD is of today's rule and
    --      does not stop it; SPENDING_APPROVER_IS_PARTY is a reason of today's rule too (the spend routing still writes it).
    SELECT 'LEGACY_NEED_ROW_' || s."routing_row"::text || ' request ' || s."request_id"::text
      FROM "access_request_steps" s
     WHERE s."kind" = 'NEED' AND s."state" = 'PENDING' AND s."routing_row" IN (3, 4)
    UNION ALL
    SELECT 'LEGACY_WAITING_' || s."waiting_reason" || ' request ' || s."request_id"::text
      FROM "access_request_steps" s
     WHERE s."state" = 'WAITING'
       AND s."waiting_reason" IN ('NO_FALLBACK_APPROVER', 'FALLBACK_IS_REQUESTER', 'NO_CONFLICT_SUBSTITUTE')
    UNION ALL
    -- (iii) a pending spend step whose holder never had a SPENDING_APPROVER grant (revoked or not): the substitute of the old rule.
    SELECT 'SPEND_STEP_HELD_BY_NON_APPROVER ' || COALESCE(e."employee_code", '-') || ' request ' || s."request_id"::text
      FROM "access_request_steps" s
      LEFT JOIN "employees" e ON e."id" = s."assignee_employee_id"
     WHERE s."kind" = 'SPEND_APPROVAL' AND s."state" = 'PENDING'
       AND NOT EXISTS (SELECT 1 FROM "role_grants" g
                         JOIN "app_users" u ON u."id" = g."app_user_id"
                        WHERE g."role" = 'SPENDING_APPROVER' AND u."employee_id" = s."assignee_employee_id")
  ) v;

  IF problems IS NOT NULL THEN
    RAISE EXCEPTION 'QĐ-93 approval role drop blocked; deploy the previous release and settle the listed rows in the application first:%', E'\n' || problems
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

