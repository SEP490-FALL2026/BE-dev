-- QĐ-93a, QĐ-93b, QĐ-93k(4) (`qd93-direct-manager-spending-approver-roles`, Task 3): MANAGER and SPENDING_APPROVER are granted like
-- IT_ADMIN and FINANCE. This migration carries the data of the release before it over and adds the rules of the new roles to the
-- database; the values themselves were added by `…_identity_direct_roles_values` (a value cannot be used in the transaction that
-- adds it).
--
-- Never fixes anything of its own accord: when a row cannot be carried over, it stops and lists every such row (the guard at the
-- top; `pnpm ops:preflight` lists the same four kinds before the deploy). The Super Admin fixes them in the running release.
-- A day below is the day in the calendar of the organization, the expression of `role_grants_super_admin_exclusions`.

-- 0. Guard QĐ-93k(4): stop and list, change nothing.
DO $$
DECLARE
  problems text;
BEGIN
  SELECT string_agg(v.line, E'\n' ORDER BY v.line) INTO problems FROM (
    -- (a) a head today or later who has no account: no MANAGER can be granted to them.
    SELECT 'HEAD_WITHOUT_ACCOUNT ' || e."employee_code" || ' ' || d."code" AS line
      FROM "department_head_periods" p
      JOIN "employees" e ON e."id" = p."employee_id"
      JOIN "departments" d ON d."id" = p."department_id"
      JOIN "organizations" o ON o."id" = p."organization_id"
     WHERE (p."valid_to" IS NULL OR p."valid_to" > (now() AT TIME ZONE COALESCE(o."time_zone", 'UTC'))::date)
       AND NOT EXISTS (SELECT 1 FROM "app_users" u WHERE u."employee_id" = e."id")
    UNION ALL
    -- (b) the spending approver heads a department today or later.
    SELECT 'SPENDING_APPROVER_IS_HEAD ' || e."employee_code" || ' ' || d."code"
      FROM "approval_role_holders" h
      JOIN "employees" e ON e."id" = h."employee_id"
      JOIN "department_head_periods" p ON p."employee_id" = e."id"
      JOIN "departments" d ON d."id" = p."department_id"
      JOIN "organizations" o ON o."id" = p."organization_id"
     WHERE h."role" = 'SPENDING_APPROVER' AND h."held_until" IS NULL
       AND (p."valid_to" IS NULL OR p."valid_to" > (now() AT TIME ZONE COALESCE(o."time_zone", 'UTC'))::date)
    UNION ALL
    -- (c) the spending approver also holds a role that cannot go with it.
    SELECT 'SPENDING_APPROVER_HOLDS_' || g."role"::text || ' ' || e."employee_code"
      FROM "approval_role_holders" h
      JOIN "employees" e ON e."id" = h."employee_id"
      JOIN "app_users" u ON u."employee_id" = e."id"
      JOIN "role_grants" g ON g."app_user_id" = u."id"
     WHERE h."role" = 'SPENDING_APPROVER' AND h."held_until" IS NULL AND g."revoked_at" IS NULL
       AND g."role" IN ('SUPER_ADMIN', 'IT_ADMIN', 'FINANCE')
    UNION ALL
    -- (d) the spending approver has no account to carry the grant. A locked or not yet activated account, an employee who is
    --     handing over or who has left, do NOT stop it: the holder keeps the role until the Super Admin revokes it
    --     (US-01-03 AC-9, AC-10); rules 7 and 8 of the grant only apply to a new grant.
    SELECT 'SPENDING_APPROVER_WITHOUT_ACCOUNT ' || e."employee_code"
      FROM "approval_role_holders" h
      JOIN "employees" e ON e."id" = h."employee_id"
     WHERE h."role" = 'SPENDING_APPROVER' AND h."held_until" IS NULL
       AND NOT EXISTS (SELECT 1 FROM "app_users" u WHERE u."employee_id" = e."id")
  ) v;

  IF problems IS NOT NULL THEN
    RAISE EXCEPTION 'QĐ-93 role conversion blocked; run pnpm ops:preflight and fix in the application:%', E'\n' || problems
      USING ERRCODE = 'P0001';
  END IF;
END $$;

-- 1. MANAGER for every head today or later, with an Audit Trail record each (append-only, actor SYSTEM).
WITH "granted" AS (
  INSERT INTO "role_grants" ("id", "organization_id", "app_user_id", "role", "granted_at", "granted_by")
  SELECT gen_random_uuid(), u."organization_id", u."id", 'MANAGER', now(), NULL
    FROM "app_users" u
   WHERE EXISTS (
           SELECT 1 FROM "department_head_periods" p
             JOIN "organizations" o ON o."id" = p."organization_id"
            WHERE p."employee_id" = u."employee_id"
              AND (p."valid_to" IS NULL OR p."valid_to" > (now() AT TIME ZONE COALESCE(o."time_zone", 'UTC'))::date))
     AND NOT EXISTS (SELECT 1 FROM "role_grants" g
                      WHERE g."app_user_id" = u."id" AND g."role" = 'MANAGER' AND g."revoked_at" IS NULL)
  RETURNING "organization_id", "app_user_id", "role"
)
INSERT INTO "audit_events" ("id", "organization_id", "actor_kind", "actor_app_user_id", "actor_roles", "action",
                            "resource_type", "resource_id", "before", "after", "correlation_id")
SELECT gen_random_uuid(), "organization_id", 'SYSTEM', NULL, '{}', 'ROLE.GRANTED', 'AppUser', "app_user_id"::text,
       NULL,
       jsonb_build_object('role', "role", 'source', 'QĐ-93 migration', 'migration', '20261102082906_identity_direct_roles'),
       '20261102082906_identity_direct_roles'
  FROM "granted";

-- 2. SPENDING_APPROVER from the open row of `approval_role_holders` (kept whatever the state of the account or of the employee),
--    with an Audit Trail record each; then that row is closed (the table keeps the other two approval roles).
WITH "granted" AS (
  INSERT INTO "role_grants" ("id", "organization_id", "app_user_id", "role", "granted_at", "granted_by")
  SELECT gen_random_uuid(), u."organization_id", u."id", 'SPENDING_APPROVER', now(), NULL
    FROM "approval_role_holders" h
    JOIN "app_users" u ON u."employee_id" = h."employee_id"
   WHERE h."role" = 'SPENDING_APPROVER' AND h."held_until" IS NULL
  RETURNING "organization_id", "app_user_id", "role"
)
INSERT INTO "audit_events" ("id", "organization_id", "actor_kind", "actor_app_user_id", "actor_roles", "action",
                            "resource_type", "resource_id", "before", "after", "correlation_id")
SELECT gen_random_uuid(), "organization_id", 'SYSTEM', NULL, '{}', 'ROLE.GRANTED', 'AppUser', "app_user_id"::text,
       NULL,
       jsonb_build_object('role', "role", 'source', 'QĐ-93 migration', 'migration', '20261102082906_identity_direct_roles'),
       '20261102082906_identity_direct_roles'
  FROM "granted";

UPDATE "approval_role_holders"
   SET "held_until" = GREATEST(now(), "held_from")
 WHERE "role" = 'SPENDING_APPROVER' AND "held_until" IS NULL;

-- 3. At most one effective SPENDING_APPROVER per organization, whatever the state of the holder's account (QĐ-52d, QĐ-67e
--    pattern of `role_grants_one_finance`). Zero is allowed.
CREATE UNIQUE INDEX "role_grants_one_spending_approver"
  ON "role_grants" ("organization_id")
  WHERE "role" = 'SPENDING_APPROVER' AND "revoked_at" IS NULL;

-- 4. The forbidden combinations (FR-8.7, QĐ-93b), both ways, whoever writes the row: SUPER_ADMIN with IT_ADMIN, FINANCE or
--    MANAGER; SPENDING_APPROVER with SUPER_ADMIN, IT_ADMIN, FINANCE or MANAGER. The trigger of `…_account_invitation` stays.
CREATE OR REPLACE FUNCTION role_grants_forbid_combination() RETURNS trigger AS $$
BEGIN
  IF NEW.revoked_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM role_grants g
    WHERE g.app_user_id = NEW.app_user_id AND g.id <> NEW.id AND g.revoked_at IS NULL
      AND (
        (NEW.role = 'SUPER_ADMIN' AND g.role IN ('IT_ADMIN', 'FINANCE', 'MANAGER', 'SPENDING_APPROVER'))
        OR (NEW.role IN ('IT_ADMIN', 'FINANCE', 'MANAGER') AND g.role IN ('SUPER_ADMIN', 'SPENDING_APPROVER'))
        OR (NEW.role = 'SPENDING_APPROVER' AND g.role IN ('SUPER_ADMIN', 'IT_ADMIN', 'FINANCE', 'MANAGER'))
      )
  ) THEN
    RAISE EXCEPTION 'forbidden role combination' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. The spending approver is never a head today or later (QĐ-93b). The service of the grant checks it first with the periods in
--    the message; this is the last defence when something grants the role around it. The refusal names itself so that the
--    application tells it from the combination.
CREATE FUNCTION role_grants_forbid_spending_approver_for_heads() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  holder_employee_id UUID;
  org_zone TEXT;
  org_today DATE;
BEGIN
  IF NEW."role" <> 'SPENDING_APPROVER' OR NEW."revoked_at" IS NOT NULL THEN
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
    RAISE EXCEPTION 'role_grants_spending_approver_not_head: the spending approver cannot head or be named to head a department'
      USING ERRCODE = '23514', CONSTRAINT = 'role_grants_spending_approver_not_head';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "role_grants_spending_approver_not_head"
  BEFORE INSERT ON "role_grants"
  FOR EACH ROW EXECUTE FUNCTION role_grants_forbid_spending_approver_for_heads();

-- 6. The MANAGER role of someone who heads a department today or later cannot be revoked (QĐ-93a, US-01-01 AC-21), whoever writes
--    the row. No trigger on `department_head_periods`: the periods are written by the heads' services and by the handover of
--    the personnel module, which check the successor themselves.
CREATE FUNCTION role_grants_keep_manager_of_heads() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  holder_employee_id UUID;
  org_zone TEXT;
  org_today DATE;
BEGIN
  IF OLD."role" <> 'MANAGER' OR OLD."revoked_at" IS NOT NULL OR NEW."revoked_at" IS NULL THEN
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
    RAISE EXCEPTION 'role_grants_manager_revoke_guard: the MANAGER role of someone who heads or is named to head a department cannot be revoked'
      USING ERRCODE = '23514', CONSTRAINT = 'role_grants_manager_revoke_guard';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "role_grants_manager_revoke_guard"
  BEFORE UPDATE OF "revoked_at" ON "role_grants"
  FOR EACH ROW EXECUTE FUNCTION role_grants_keep_manager_of_heads();
