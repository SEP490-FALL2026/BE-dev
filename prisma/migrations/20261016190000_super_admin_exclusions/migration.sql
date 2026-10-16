-- Slice G1 (US-01-09 AC-3, US-01-03 AC-2, FR-8.7): the Super Admin role is never held by someone who heads a
-- department or holds an approval role. The transfer service checks this first; this trigger is the last defence
-- if anything ever grants the role around it.
--
-- The other direction (naming a Super Admin as a department head or as an approval role holder) is refused by the
-- services that write those, and by the application again when it derives the roles.

CREATE FUNCTION role_grants_forbid_super_admin_for_heads_and_approvers() RETURNS trigger
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

  IF EXISTS (
    SELECT 1 FROM "approval_role_holders" a
     WHERE a."employee_id" = holder_employee_id AND a."held_until" IS NULL
  ) THEN
    RAISE EXCEPTION 'the Super Admin role cannot be held by someone who holds an approval role'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "role_grants_super_admin_exclusions"
  BEFORE INSERT ON "role_grants"
  FOR EACH ROW EXECUTE FUNCTION role_grants_forbid_super_admin_for_heads_and_approvers();
