-- The controlled procedure for an event whose subject is the Super Admin (g0-g6-final-business-baseline-remediation, Task 1.8;
-- F19; P03-D02 = A; spec L.2; QĐ-87c, QĐ-88b). The Super Admin cannot record an event about themself in the application, and
-- no other role may either; `pnpm ops:record-super-admin-event` does it on a written approval ticket. The ticket is the
-- "who" of such a record, so each of the ten columns that name the person who did an event (an application account) gets a
-- sibling that names the ticket instead, and exactly one of the two is set (at most one where the column was optional).
--
-- The compatibility image stays valid on this schema: it writes the application account and never the ticket, so every
-- new rule is met by what it writes. Existing rows all have an account: nothing is backfilled.

CREATE TYPE "SuperAdminEventMode" AS ENUM (
    'TRANSFER_RECORD', 'TRANSFER_RESCHEDULE', 'TRANSFER_CANCEL', 'LEAVE_START', 'LEAVE_RETURN',
    'DEPARTURE_RECORD', 'DEPARTURE_CHANGE', 'DEPARTURE_CANCEL', 'ABRUPT_DEPARTURE_RECORD', 'PROFILE_CORRECT'
);

-- The approval ticket of one run of the command: the key that makes it idempotent (`parameters_digest` tells a repeated
-- run of the same ticket from a different one), and the record of who approved and who ran it. Added to, never changed.
CREATE TABLE "super_admin_event_tickets" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "ticket_ref" TEXT NOT NULL,
    "mode" "SuperAdminEventMode" NOT NULL,
    "subject_employee_id" UUID NOT NULL,
    "parameters_digest" TEXT NOT NULL,
    "approver_ref" TEXT NOT NULL,
    "operator_ref" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "recorded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "super_admin_event_tickets_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "super_admin_event_tickets_environment_known" CHECK ("environment" IN ('LOCAL_TEST', 'SHARED'))
);

CREATE UNIQUE INDEX "super_admin_event_tickets_organization_id_ticket_ref_key"
    ON "super_admin_event_tickets"("organization_id", "ticket_ref");
CREATE INDEX "super_admin_event_tickets_subject_employee_id_idx" ON "super_admin_event_tickets"("subject_employee_id");

ALTER TABLE "super_admin_event_tickets" ADD CONSTRAINT "super_admin_event_tickets_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "super_admin_event_tickets" ADD CONSTRAINT "super_admin_event_tickets_subject_employee_id_fkey"
    FOREIGN KEY ("subject_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION super_admin_event_tickets_reject_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'super_admin_event_tickets is append-only (% rejected)', TG_OP
        USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER super_admin_event_tickets_no_update_delete
    BEFORE UPDATE OR DELETE ON "super_admin_event_tickets"
    FOR EACH ROW EXECUTE FUNCTION super_admin_event_tickets_reject_change();
CREATE TRIGGER super_admin_event_tickets_no_truncate
    BEFORE TRUNCATE ON "super_admin_event_tickets"
    FOR EACH STATEMENT EXECUTE FUNCTION super_admin_event_tickets_reject_change();

-- The ten siblings. A person who did the event is an application account OR a ticket.
ALTER TABLE "department_transfers"
    ADD COLUMN "recorded_by_ticket_id" UUID,
    ADD COLUMN "cancelled_by_ticket_id" UUID;
ALTER TABLE "department_transfer_changes" ADD COLUMN "changed_by_ticket_id" UUID;
ALTER TABLE "employee_leaves" ADD COLUMN "started_by_ticket_id" UUID;
ALTER TABLE "employee_leave_changes" ADD COLUMN "recorded_by_ticket_id" UUID;
ALTER TABLE "offboarding_cases"
    ADD COLUMN "recorded_by_ticket_id" UUID,
    ADD COLUMN "cancelled_by_ticket_id" UUID;
ALTER TABLE "offboarding_case_changes" ADD COLUMN "changed_by_ticket_id" UUID;
ALTER TABLE "personnel_notices" ADD COLUMN "handled_by_ticket_id" UUID;
ALTER TABLE "personnel_notice_verifications" ADD COLUMN "verified_by_ticket_id" UUID;

ALTER TABLE "department_transfers" ADD CONSTRAINT "department_transfers_recorded_by_ticket_id_fkey"
    FOREIGN KEY ("recorded_by_ticket_id") REFERENCES "super_admin_event_tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "department_transfers" ADD CONSTRAINT "department_transfers_cancelled_by_ticket_id_fkey"
    FOREIGN KEY ("cancelled_by_ticket_id") REFERENCES "super_admin_event_tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "department_transfer_changes" ADD CONSTRAINT "department_transfer_changes_changed_by_ticket_id_fkey"
    FOREIGN KEY ("changed_by_ticket_id") REFERENCES "super_admin_event_tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "employee_leaves" ADD CONSTRAINT "employee_leaves_started_by_ticket_id_fkey"
    FOREIGN KEY ("started_by_ticket_id") REFERENCES "super_admin_event_tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "employee_leave_changes" ADD CONSTRAINT "employee_leave_changes_recorded_by_ticket_id_fkey"
    FOREIGN KEY ("recorded_by_ticket_id") REFERENCES "super_admin_event_tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "offboarding_cases" ADD CONSTRAINT "offboarding_cases_recorded_by_ticket_id_fkey"
    FOREIGN KEY ("recorded_by_ticket_id") REFERENCES "super_admin_event_tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "offboarding_cases" ADD CONSTRAINT "offboarding_cases_cancelled_by_ticket_id_fkey"
    FOREIGN KEY ("cancelled_by_ticket_id") REFERENCES "super_admin_event_tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "offboarding_case_changes" ADD CONSTRAINT "offboarding_case_changes_changed_by_ticket_id_fkey"
    FOREIGN KEY ("changed_by_ticket_id") REFERENCES "super_admin_event_tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "personnel_notices" ADD CONSTRAINT "personnel_notices_handled_by_ticket_id_fkey"
    FOREIGN KEY ("handled_by_ticket_id") REFERENCES "super_admin_event_tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "personnel_notice_verifications" ADD CONSTRAINT "personnel_notice_verifications_verified_by_ticket_id_fkey"
    FOREIGN KEY ("verified_by_ticket_id") REFERENCES "super_admin_event_tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Who did it: exactly one of the account and the ticket where the person was required, at most one where it was optional.
ALTER TABLE "department_transfers" ADD CONSTRAINT "department_transfers_recorded_by_one" CHECK (
    num_nonnulls("recorded_by_app_user_id", "recorded_by_ticket_id") = 1);
ALTER TABLE "department_transfers" ADD CONSTRAINT "department_transfers_cancelled_by_at_most_one" CHECK (
    num_nonnulls("cancelled_by_app_user_id", "cancelled_by_ticket_id") <= 1);
ALTER TABLE "department_transfer_changes" ADD CONSTRAINT "department_transfer_changes_changed_by_one" CHECK (
    num_nonnulls("changed_by_app_user_id", "changed_by_ticket_id") = 1);
ALTER TABLE "employee_leaves" ADD CONSTRAINT "employee_leaves_started_by_one" CHECK (
    num_nonnulls("started_by_app_user_id", "started_by_ticket_id") = 1);
ALTER TABLE "employee_leave_changes" ADD CONSTRAINT "employee_leave_changes_recorded_by_one" CHECK (
    num_nonnulls("recorded_by_app_user_id", "recorded_by_ticket_id") = 1);
ALTER TABLE "offboarding_cases" ADD CONSTRAINT "offboarding_cases_recorded_by_one" CHECK (
    num_nonnulls("recorded_by_app_user_id", "recorded_by_ticket_id") = 1);
ALTER TABLE "offboarding_cases" ADD CONSTRAINT "offboarding_cases_cancelled_by_at_most_one" CHECK (
    num_nonnulls("cancelled_by_app_user_id", "cancelled_by_ticket_id") <= 1);
ALTER TABLE "offboarding_case_changes" ADD CONSTRAINT "offboarding_case_changes_changed_by_one" CHECK (
    num_nonnulls("changed_by_app_user_id", "changed_by_ticket_id") = 1);
ALTER TABLE "personnel_notices" ADD CONSTRAINT "personnel_notices_handled_by_at_most_one" CHECK (
    num_nonnulls("handled_by_app_user_id", "handled_by_ticket_id") <= 1);
ALTER TABLE "personnel_notice_verifications" ADD CONSTRAINT "personnel_notice_verifications_verified_by_one" CHECK (
    num_nonnulls("verified_by_app_user_id", "verified_by_ticket_id") = 1);

-- The three rules that tie a moment or a state to the person now read "the account or the ticket".
ALTER TABLE "department_transfers" DROP CONSTRAINT "department_transfers_cancelled_consistent";
ALTER TABLE "department_transfers" ADD CONSTRAINT "department_transfers_cancelled_consistent" CHECK (
    ("status" = 'CANCELLED') = (
        "cancelled_at" IS NOT NULL
        AND num_nonnulls("cancelled_by_app_user_id", "cancelled_by_ticket_id") = 1
        AND "cancelled_reason" IS NOT NULL AND btrim("cancelled_reason") <> ''
    )
);

ALTER TABLE "offboarding_cases" DROP CONSTRAINT "offboarding_cases_cancelled_consistent_check";
ALTER TABLE "offboarding_cases" ADD CONSTRAINT "offboarding_cases_cancelled_consistent_check" CHECK (
    (("state" = 'CANCELLED') = ("cancelled_at" IS NOT NULL))
    AND (("cancelled_at" IS NULL) = (num_nonnulls("cancelled_by_app_user_id", "cancelled_by_ticket_id") = 0))
    AND (("cancelled_at" IS NULL) = ("cancel_reason" IS NULL))
    AND ("cancel_reason" IS NULL OR btrim("cancel_reason") <> '')
);

ALTER TABLE "personnel_notices" DROP CONSTRAINT "personnel_notices_status_check";
ALTER TABLE "personnel_notices" ADD CONSTRAINT "personnel_notices_status_check" CHECK (
    CASE "status"
        WHEN 'PENDING_VERIFICATION' THEN
            "reject_reason" IS NULL AND "recorded_event_kind" IS NULL AND "recorded_event_id" IS NULL
            AND num_nonnulls("handled_by_app_user_id", "handled_by_ticket_id") = 0 AND "handled_at" IS NULL
        WHEN 'RECORDED' THEN
            "reject_reason" IS NULL AND "recorded_event_kind" IS NOT NULL AND "recorded_event_id" IS NOT NULL
            AND num_nonnulls("handled_by_app_user_id", "handled_by_ticket_id") = 1 AND "handled_at" IS NOT NULL
        WHEN 'REJECTED' THEN
            "reject_reason" IS NOT NULL AND btrim("reject_reason") <> '' AND "recorded_event_kind" IS NULL
            AND "recorded_event_id" IS NULL AND num_nonnulls("handled_by_app_user_id", "handled_by_ticket_id") = 1
            AND "handled_at" IS NOT NULL
        WHEN 'WITHDRAWN' THEN
            "reject_reason" IS NULL AND "recorded_event_kind" IS NULL AND "recorded_event_id" IS NULL
            AND num_nonnulls("handled_by_app_user_id", "handled_by_ticket_id") = 1 AND "handled_at" IS NOT NULL
    END
);

-- Who recorded or started a record never changes while the record can still change: the three guards that say so for the
-- application account now say it for the ticket too (a record could otherwise be handed from one ticket to another). Each
-- function is rewritten from its own current definition, and the migration stops if the line it extends is not there exactly once.
DO $$
DECLARE
    rule RECORD;
    old_definition TEXT;
    new_definition TEXT;
    anchor TEXT;
BEGIN
    FOR rule IN
        SELECT * FROM (VALUES
            ('department_transfers_guard', 'recorded_by_app_user_id', 'recorded_by_ticket_id'),
            ('employee_leaves_guard', 'started_by_app_user_id', 'started_by_ticket_id'),
            ('offboarding_cases_guard', 'recorded_by_app_user_id', 'recorded_by_ticket_id')
        ) AS t("function_name", "account_column", "ticket_column")
    LOOP
        old_definition := pg_get_functiondef(to_regproc(rule."function_name"));
        -- The bodies write every column quoted: NEW."col" IS DISTINCT FROM OLD."col".
        anchor := format('NEW."%s" IS DISTINCT FROM OLD."%s"', rule."account_column", rule."account_column");
        IF old_definition IS NULL
           OR (length(old_definition) - length(replace(old_definition, anchor, ''))) / length(anchor) <> 1 THEN
            RAISE EXCEPTION '% is not in the shape this migration extends', rule."function_name";
        END IF;
        new_definition := replace(old_definition, anchor,
            anchor || format(E'\n     OR NEW."%s" IS DISTINCT FROM OLD."%s"', rule."ticket_column", rule."ticket_column"));
        EXECUTE new_definition;
    END LOOP;
END
$$;
