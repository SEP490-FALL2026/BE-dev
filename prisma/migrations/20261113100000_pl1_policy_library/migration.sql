-- PL-1.2 (QĐ-111ao, QĐ-111bi, SPEC FE PL-1): the policy library. Three new tables; nothing else is touched. A policy is a fixed row per
-- organization (no route creates or deletes one, R-42); a version is a row of `policy_versions`: the one with a null number is the draft (at most
-- one per policy), the others are published and never change; an acknowledgement is added to and never changed.

-- CreateTable
CREATE TABLE "policies" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policy_versions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "policy_id" UUID NOT NULL,
    "version_number" INTEGER,
    "title" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "applicable_roles" "AppRole"[],
    "change_note" TEXT,
    "requires_reacknowledgement" BOOLEAN NOT NULL DEFAULT true,
    "drafted_by_app_user_id" UUID,
    "published_by_app_user_id" UUID,
    "published_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "policy_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policy_acknowledgements" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "policy_version_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "app_user_id" UUID NOT NULL,
    "acknowledged_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "policy_acknowledgements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "policies_organization_id_code_key" ON "policies"("organization_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "policy_versions_policy_id_version_number_key" ON "policy_versions"("policy_id", "version_number");

-- CreateIndex
CREATE INDEX "policy_acknowledgements_organization_id_employee_id_idx" ON "policy_acknowledgements"("organization_id", "employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "policy_acknowledgements_policy_version_id_app_user_id_key" ON "policy_acknowledgements"("policy_version_id", "app_user_id");

-- AddForeignKey
ALTER TABLE "policy_versions" ADD CONSTRAINT "policy_versions_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_acknowledgements" ADD CONSTRAINT "policy_acknowledgements_policy_version_id_fkey" FOREIGN KEY ("policy_version_id") REFERENCES "policy_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- At most one draft per policy; the unique index above does not hold it (null numbers are distinct).
CREATE UNIQUE INDEX "policy_versions_one_draft" ON "policy_versions" ("policy_id") WHERE "version_number" IS NULL;

-- A version is either the draft (no number, no time, no person, no ground) or published (a number from 1, the time, and the ground of the issue
-- that the Super Admin or the installation wrote), and the first version always asks to be acknowledged (R-34). A published version names at
-- least one role: a policy that applies to nobody could never be acknowledged.
ALTER TABLE "policy_versions" ADD CONSTRAINT "policy_versions_draft_or_published" CHECK (
  ("version_number" IS NULL AND "published_at" IS NULL AND "published_by_app_user_id" IS NULL AND "change_note" IS NULL)
  OR ("version_number" >= 1 AND "published_at" IS NOT NULL AND "change_note" IS NOT NULL AND btrim("change_note") <> ''
      AND cardinality("applicable_roles") >= 1 AND ("version_number" > 1 OR "requires_reacknowledgement"))
);

-- A published version is never changed or deleted; the draft is changed in place and turns into the published version by the one UPDATE
-- that fills the number in.
CREATE FUNCTION policy_versions_guard() RETURNS trigger AS $$ BEGIN
  IF OLD."version_number" IS NOT NULL THEN
    RAISE EXCEPTION 'A published policy version is never changed or deleted'
      USING ERRCODE = '55000', CONSTRAINT = 'policy_versions_published_kept';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER policy_versions_guard BEFORE UPDATE OR DELETE ON "policy_versions"
  FOR EACH ROW EXECUTE FUNCTION policy_versions_guard();

-- An acknowledgement is evidence: added to and never changed.
CREATE FUNCTION policies_append_only() RETURNS trigger AS $$ BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = '55000'; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER policy_acknowledgements_append_only BEFORE UPDATE OR DELETE ON "policy_acknowledgements"
  FOR EACH ROW EXECUTE FUNCTION policies_append_only();
CREATE TRIGGER policy_acknowledgements_no_truncate BEFORE TRUNCATE ON "policy_acknowledgements"
  FOR EACH STATEMENT EXECUTE FUNCTION policies_append_only();
