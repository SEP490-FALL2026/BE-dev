-- The standard toolset of a department and job title (g3-standard-toolset, US-04-10): the plans IT keeps as the usual
-- tools of that kind of work, each change a version with who, why and when, never changed or deleted; the head row says
-- which version is current. Changing a toolset grants and revokes nothing: no column here refers to an assignment. The
-- department and the job title are organization tables: foreign keys only.

-- CreateTable
CREATE TABLE "standard_toolsets" (
    "department_id" UUID NOT NULL,
    "job_title_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "current_version" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "standard_toolsets_pkey" PRIMARY KEY ("department_id", "job_title_id"),
    CONSTRAINT "standard_toolsets_current_version_range" CHECK ("current_version" >= 0)
);

CREATE TABLE "standard_toolset_versions" (
    "id" UUID NOT NULL,
    "department_id" UUID NOT NULL,
    "job_title_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    -- A value, not a foreign key: the history outlives the account (as the audit trail does).
    "changed_by_app_user_id" UUID NOT NULL,
    "changed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "standard_toolset_versions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "standard_toolset_versions_version_positive" CHECK ("version" >= 1),
    -- Every change says why (AC-2): a blank reason is none.
    CONSTRAINT "standard_toolset_versions_reason_given" CHECK (length(btrim("reason")) > 0)
);

CREATE TABLE "standard_toolset_items" (
    "version_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,

    CONSTRAINT "standard_toolset_items_pkey" PRIMARY KEY ("version_id", "plan_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "standard_toolset_versions_department_id_job_title_id_versio_key"
    ON "standard_toolset_versions"("department_id", "job_title_id", "version");
CREATE INDEX "standard_toolset_items_plan_id_idx" ON "standard_toolset_items"("plan_id");

-- AddForeignKey
ALTER TABLE "standard_toolsets" ADD CONSTRAINT "standard_toolsets_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "standard_toolsets" ADD CONSTRAINT "standard_toolsets_department_id_fkey"
    FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "standard_toolsets" ADD CONSTRAINT "standard_toolsets_job_title_id_fkey"
    FOREIGN KEY ("job_title_id") REFERENCES "job_titles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "standard_toolset_versions" ADD CONSTRAINT "standard_toolset_versions_department_id_job_title_id_fkey"
    FOREIGN KEY ("department_id", "job_title_id") REFERENCES "standard_toolsets"("department_id", "job_title_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "standard_toolset_items" ADD CONSTRAINT "standard_toolset_items_version_id_fkey"
    FOREIGN KEY ("version_id") REFERENCES "standard_toolset_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "standard_toolset_items" ADD CONSTRAINT "standard_toolset_items_plan_id_fkey"
    FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A recorded version and its items are history: no writer changes or deletes them (the head is the only row that moves).
CREATE FUNCTION "standard_toolset_reject_change"() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'A recorded standard toolset version is never changed or deleted'
        USING ERRCODE = '55000', CONSTRAINT = 'standard_toolset_immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "standard_toolset_versions_immutable"
    BEFORE UPDATE OR DELETE ON "standard_toolset_versions"
    FOR EACH ROW EXECUTE FUNCTION "standard_toolset_reject_change"();

CREATE TRIGGER "standard_toolset_items_immutable"
    BEFORE UPDATE OR DELETE ON "standard_toolset_items"
    FOR EACH ROW EXECUTE FUNCTION "standard_toolset_reject_change"();
