-- X-IT.4b (QĐ-110k, QĐ-110u, R-53, SPEC P19): the workspace profile of a plan that the company administers at the vendor also keeps the email of the
-- company account that owns the plan there (no password, ever) and a free note, and a K4 plan the IT Admin said has an admin console may have a
-- profile like a K2 plan. Expand only: two nullable columns, two functions replaced by ones that allow one kind more; nothing is dropped and no
-- row changes. Safe to run twice.
--
-- Each column is asked on its own: a CHECK passes on NULL.

ALTER TABLE "plan_workspace_profiles"
  ADD COLUMN IF NOT EXISTS "owner_account_email" TEXT,
  ADD COLUMN IF NOT EXISTS "admin_note" TEXT;

ALTER TABLE "plan_workspace_profiles" DROP CONSTRAINT IF EXISTS "plan_workspace_profiles_owner_account_email_check";
ALTER TABLE "plan_workspace_profiles" ADD CONSTRAINT "plan_workspace_profiles_owner_account_email_check" CHECK (
  "owner_account_email" IS NULL OR (btrim("owner_account_email") <> '' AND char_length("owner_account_email") <= 320)
);

ALTER TABLE "plan_workspace_profiles" DROP CONSTRAINT IF EXISTS "plan_workspace_profiles_admin_note_check";
ALTER TABLE "plan_workspace_profiles" ADD CONSTRAINT "plan_workspace_profiles_admin_note_check" CHECK (
  "admin_note" IS NULL OR (btrim("admin_note") <> '' AND char_length("admin_note") <= 2000)
);

-- A workspace profile belongs to a K2 or K3 plan, and now also to a K4 plan (one with an admin console: the application judges that, the row only
-- keeps the kind). The triggers themselves (migration 20261020130000) stay; only their functions change.
CREATE OR REPLACE FUNCTION "plan_workspace_profiles_for_workspace_kinds"() RETURNS trigger AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "plans" p WHERE p."id" = NEW."plan_id" AND p."provisioning_type" IN ('K2', 'K3', 'K4')
    ) THEN
        RAISE EXCEPTION 'A workspace profile belongs to a K2, K3 or K4 plan'
            USING ERRCODE = '23514', CONSTRAINT = 'plan_workspace_profiles_for_workspace_kinds';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- A plan that has a workspace profile stays of a kind that has one.
CREATE OR REPLACE FUNCTION "plans_keep_workspace_kind"() RETURNS trigger AS $$
BEGIN
    IF NEW."provisioning_type" NOT IN ('K2', 'K3', 'K4') AND EXISTS (
        SELECT 1 FROM "plan_workspace_profiles" w WHERE w."plan_id" = NEW."id"
    ) THEN
        RAISE EXCEPTION 'The plan still has a workspace profile'
            USING ERRCODE = '23514', CONSTRAINT = 'plans_keep_workspace_kind';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
