-- FIX-LB1 (LB1-03, LB1-08, LB1-15): three small corrections to the policy library of PL-1, expand only (no row is changed).
--
-- LB1-03: the Super Admin publishes the policies and never acknowledges one (US-01-14 AC-5), so no version may name SUPER_ADMIN among the roles it applies to.
-- LB1-15: a published version names at least one role, and a NULL list is not one (cardinality(NULL) is NULL, which a CHECK lets through): the check says so.
-- LB1-08: what a person acknowledged is read by account (GET /me, GET /policies), so the index leads with the account.

ALTER TABLE "policy_versions" DROP CONSTRAINT IF EXISTS "policy_versions_draft_or_published";
ALTER TABLE "policy_versions" ADD CONSTRAINT "policy_versions_draft_or_published" CHECK (
  ("version_number" IS NULL AND "published_at" IS NULL AND "published_by_app_user_id" IS NULL AND "change_note" IS NULL)
  OR ("version_number" >= 1 AND "published_at" IS NOT NULL AND "change_note" IS NOT NULL AND btrim("change_note") <> ''
      AND "applicable_roles" IS NOT NULL AND cardinality("applicable_roles") >= 1
      AND ("version_number" > 1 OR "requires_reacknowledgement"))
);

ALTER TABLE "policy_versions" DROP CONSTRAINT IF EXISTS "policy_versions_no_super_admin";
ALTER TABLE "policy_versions" ADD CONSTRAINT "policy_versions_no_super_admin" CHECK (
  "applicable_roles" IS NULL OR NOT ('SUPER_ADMIN'::"AppRole" = ANY ("applicable_roles"))
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "policy_acknowledgements_app_user_id_policy_version_id_idx"
  ON "policy_acknowledgements"("app_user_id", "policy_version_id");
