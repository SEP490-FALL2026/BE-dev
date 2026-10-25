-- The report of an error in a SaaS right that a person holds, and the handling of it by the IT Admin (g6-saas-error-report, US-07-10,
-- US-07-11, BM-11). A report is a row of its own: it never changes the assignment, the grant task or a request, and nothing is sent to
-- the vendor (the vendor ticket is a text the IT Admin types). The people, the organization and the grant task are values, not foreign
-- keys, as in the audit trail: the history of a report outlives a change of the organization. The exchange of a report is insert-only.

-- CreateEnum
CREATE TYPE "SaasIssueState" AS ENUM (
  'NEW', 'IN_PROGRESS', 'WAITING_REPORTER', 'WAITING_PROVIDER', 'RESOLVED', 'CLOSED', 'DUPLICATE'
);
CREATE TYPE "SaasIssueCategory" AS ENUM (
  'NO_ACCESS', 'INVITATION_OR_ACTIVATION', 'MISSING_PLAN_FEATURE', 'PROVIDER_OUTAGE', 'OTHER'
);
CREATE TYPE "SaasIssueImpact" AS ENUM ('UNUSABLE', 'PARTIAL', 'QUESTION_OR_OTHER');
CREATE TYPE "SaasIssueEntryKind" AS ENUM ('MESSAGE', 'TRANSITION');
CREATE TYPE "SaasIssueAuthorRole" AS ENUM ('REPORTER', 'IT_ADMIN', 'SYSTEM');

-- The numbers of the codes `BM11-<year>-<six digits>`.
CREATE SEQUENCE "saas_issue_seq" AS INTEGER MINVALUE 1 MAXVALUE 999999;

-- CreateTable
CREATE TABLE "saas_issues" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "organization_id" UUID NOT NULL,
    "reporter_employee_id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "grant_task_id" UUID,
    "category" "SaasIssueCategory" NOT NULL,
    "impact" "SaasIssueImpact" NOT NULL,
    "description" TEXT NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "state" "SaasIssueState" NOT NULL DEFAULT 'NEW',
    "assigned_it_admin_employee_id" UUID NOT NULL,
    "assigned_by_fallback" BOOLEAN NOT NULL DEFAULT false,
    "response_due_on" DATE NOT NULL,
    "response_overdue_noticed_at" TIMESTAMPTZ(3),
    "resolution" TEXT,
    "vendor_ticket_ref" TEXT,
    "duplicate_of_id" UUID,
    "duplicate_reason" TEXT,
    "linked_work" JSONB,
    "resolved_at" TIMESTAMPTZ(3),
    "reopen_until" DATE,
    "closed_at" TIMESTAMPTZ(3),
    "reopen_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saas_issues_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "saas_issues_code_form" CHECK ("code" ~ '^BM11-[0-9]{4}-[0-9]{6}$'),
    CONSTRAINT "saas_issues_description_bounds" CHECK (length(btrim("description")) > 0 AND length("description") <= 2000),
    CONSTRAINT "saas_issues_resolution_bounds" CHECK (
        "resolution" IS NULL OR (length(btrim("resolution")) > 0 AND length("resolution") <= 2000)
    ),
    CONSTRAINT "saas_issues_vendor_ticket_ref_bounds" CHECK (
        "vendor_ticket_ref" IS NULL OR (length(btrim("vendor_ticket_ref")) > 0 AND length("vendor_ticket_ref") <= 100)
    ),
    CONSTRAINT "saas_issues_linked_work_object" CHECK ("linked_work" IS NULL OR jsonb_typeof("linked_work") = 'object'),
    CONSTRAINT "saas_issues_reopen_count_not_negative" CHECK ("reopen_count" >= 0),
    -- A resolved report has its result, the moment and the last day to reopen it.
    CONSTRAINT "saas_issues_resolved_has_result" CHECK (
        "state" <> 'RESOLVED'
        OR ("resolution" IS NOT NULL AND "resolved_at" IS NOT NULL AND "reopen_until" IS NOT NULL)
    ),
    -- A duplicate names another report and says why.
    CONSTRAINT "saas_issues_duplicate_has_original" CHECK (
        "state" <> 'DUPLICATE'
        OR ("duplicate_of_id" IS NOT NULL AND "duplicate_of_id" <> "id"
            AND "duplicate_reason" IS NOT NULL AND length(btrim("duplicate_reason")) > 0)
    ),
    CONSTRAINT "saas_issues_duplicate_reason_bounds" CHECK ("duplicate_reason" IS NULL OR length("duplicate_reason") <= 1000),
    -- A closed report was resolved first and has the moment it was closed.
    CONSTRAINT "saas_issues_closed_has_moment" CHECK (
        "state" <> 'CLOSED' OR ("closed_at" IS NOT NULL AND "resolution" IS NOT NULL AND "resolved_at" IS NOT NULL)
    )
);

CREATE TABLE "saas_issue_entries" (
    "id" UUID NOT NULL,
    "issue_id" UUID NOT NULL,
    "kind" "SaasIssueEntryKind" NOT NULL,
    "author_employee_id" UUID,
    "author_role" "SaasIssueAuthorRole" NOT NULL,
    "body" TEXT,
    "from_state" "SaasIssueState",
    "to_state" "SaasIssueState",
    "on_behalf_of_employee_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saas_issue_entries_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "saas_issue_entries_body_bounds" CHECK ("body" IS NULL OR (length(btrim("body")) > 0 AND length("body") <= 2000)),
    CONSTRAINT "saas_issue_entries_kind_shape" CHECK (
        ("kind" = 'MESSAGE' AND "body" IS NOT NULL AND "from_state" IS NULL AND "to_state" IS NULL)
        OR ("kind" = 'TRANSITION' AND "to_state" IS NOT NULL)
    ),
    CONSTRAINT "saas_issue_entries_author_matches_role" CHECK (
        ("author_role" = 'SYSTEM') = ("author_employee_id" IS NULL)
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "saas_issues_code_key" ON "saas_issues"("code");
CREATE INDEX "saas_issues_reporter_employee_id_created_at_id_idx"
    ON "saas_issues"("reporter_employee_id", "created_at" DESC, "id");
CREATE INDEX "saas_issues_assigned_it_admin_employee_id_created_at_id_idx"
    ON "saas_issues"("assigned_it_admin_employee_id", "created_at" DESC, "id");
CREATE INDEX "saas_issues_created_at_id_idx" ON "saas_issues"("created_at" DESC, "id");
CREATE INDEX "saas_issues_state_response_due_on_idx" ON "saas_issues"("state", "response_due_on");
CREATE INDEX "saas_issues_state_reopen_until_idx" ON "saas_issues"("state", "reopen_until");
CREATE INDEX "saas_issues_assignment_id_idx" ON "saas_issues"("assignment_id");
CREATE INDEX "saas_issue_entries_issue_id_created_at_id_idx" ON "saas_issue_entries"("issue_id", "created_at", "id");

-- AddForeignKey
ALTER TABLE "saas_issues" ADD CONSTRAINT "saas_issues_assignment_id_fkey"
    FOREIGN KEY ("assignment_id") REFERENCES "license_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "saas_issues" ADD CONSTRAINT "saas_issues_duplicate_of_id_fkey"
    FOREIGN KEY ("duplicate_of_id") REFERENCES "saas_issues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "saas_issue_entries" ADD CONSTRAINT "saas_issue_entries_issue_id_fkey"
    FOREIGN KEY ("issue_id") REFERENCES "saas_issues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A report is kept and what was reported never changes: only the state, the result, the vendor ticket, the links, the reopen window
-- and the marks of the handling move, and a report that is closed or a duplicate never moves again.
CREATE FUNCTION "saas_issue_guard"() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'A SaaS issue is never deleted'
            USING ERRCODE = '55000', CONSTRAINT = 'saas_issue_kept';
    END IF;
    IF OLD."state" IN ('CLOSED', 'DUPLICATE') THEN
        RAISE EXCEPTION 'A SaaS issue that is closed or a duplicate never changes again'
            USING ERRCODE = '55000', CONSTRAINT = 'saas_issue_final';
    END IF;
    IF (NEW."id", NEW."code", NEW."organization_id", NEW."reporter_employee_id", NEW."assignment_id", NEW."grant_task_id",
        NEW."category", NEW."impact", NEW."description", NEW."occurred_at", NEW."assigned_it_admin_employee_id",
        NEW."assigned_by_fallback", NEW."response_due_on", NEW."created_at")
       IS DISTINCT FROM
       (OLD."id", OLD."code", OLD."organization_id", OLD."reporter_employee_id", OLD."assignment_id", OLD."grant_task_id",
        OLD."category", OLD."impact", OLD."description", OLD."occurred_at", OLD."assigned_it_admin_employee_id",
        OLD."assigned_by_fallback", OLD."response_due_on", OLD."created_at") THEN
        RAISE EXCEPTION 'What a SaaS issue reported and who it was given to never change'
            USING ERRCODE = '55000', CONSTRAINT = 'saas_issue_report_fixed';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "saas_issues_guard"
    BEFORE UPDATE OR DELETE ON "saas_issues"
    FOR EACH ROW EXECUTE FUNCTION "saas_issue_guard"();

-- The exchange is a fact: written once and never changed or deleted.
CREATE FUNCTION "saas_issue_entry_guard"() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'An entry of a SaaS issue is never changed or deleted'
        USING ERRCODE = '55000', CONSTRAINT = 'saas_issue_entry_kept';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "saas_issue_entries_guard"
    BEFORE UPDATE OR DELETE ON "saas_issue_entries"
    FOR EACH ROW EXECUTE FUNCTION "saas_issue_entry_guard"();
