-- W2-Q10: allow a SaaS issue report to be created unassigned when the reporter's department has no acting IT Admin,
-- and enforce that it can be assigned at most once from NULL and cannot leave NEW while unassigned.

ALTER TABLE "saas_issues" ALTER COLUMN "assigned_it_admin_employee_id" DROP NOT NULL;

ALTER TABLE "saas_issues"
  ADD CONSTRAINT "saas_issues_assignee_when_handled"
  CHECK ("assigned_it_admin_employee_id" IS NOT NULL OR "state" = 'NEW');

-- A report is kept and what was reported never changes: only the state, the result, the vendor ticket, the links, the reopen window
-- and the marks of the handling move; an unassigned report may be given to an IT Admin once; and a report that is closed or a duplicate
-- never moves again.
CREATE OR REPLACE FUNCTION "saas_issue_guard"() RETURNS trigger AS $$
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
        NEW."category", NEW."impact", NEW."description", NEW."occurred_at", NEW."response_due_on", NEW."created_at")
       IS DISTINCT FROM
       (OLD."id", OLD."code", OLD."organization_id", OLD."reporter_employee_id", OLD."assignment_id", OLD."grant_task_id",
        OLD."category", OLD."impact", OLD."description", OLD."occurred_at", OLD."response_due_on", OLD."created_at") THEN
        RAISE EXCEPTION 'What a SaaS issue reported and who it was given to never change'
            USING ERRCODE = '55000', CONSTRAINT = 'saas_issue_report_fixed';
    END IF;
    IF (NEW."assigned_it_admin_employee_id", NEW."assigned_by_fallback")
       IS DISTINCT FROM
       (OLD."assigned_it_admin_employee_id", OLD."assigned_by_fallback")
       AND NOT (OLD."assigned_it_admin_employee_id" IS NULL AND NEW."assigned_it_admin_employee_id" IS NOT NULL) THEN
        RAISE EXCEPTION 'What a SaaS issue reported and who it was given to never change'
            USING ERRCODE = '55000', CONSTRAINT = 'saas_issue_report_fixed';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
