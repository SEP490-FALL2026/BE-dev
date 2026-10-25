-- The return of a seat and the renewal of a right that ends on a day (g5-return-and-renewal-requests, US-05-13, US-05-14).
--
-- 1. A return (BM-03) is a record of its own, not a request that goes through steps: it has no branch, Cost Center or amount.
--    It names exactly one assignment, who sent it, whose seat it is and why; it carries the revocation task it opened (the
--    task is made by licensing in the same transaction) and the handover that was asked of the person who sent it.
-- 2. A request for the renewal of a right (type RENEWAL) is a request like any other; this table holds only what is particular
--    to it: the right it renews, the end it had and the end it asks for, and the record that was made when it was approved.

-- CreateEnum
CREATE TYPE "ReturnRequestState" AS ENUM ('AWAITING_REVOCATION', 'COMPLETED', 'FAILED');
CREATE TYPE "ReturnSource" AS ENUM ('EMPLOYEE_RETURN', 'HEAD_CONFIRMATION');

-- CreateTable
CREATE TABLE "return_requests" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    -- The plan of the seat, as a value kept for the lists: a plan of an assignment never changes.
    "plan_id" UUID NOT NULL,
    "revocation_task_id" UUID NOT NULL,
    "requested_by_employee_id" UUID NOT NULL,
    "holder_employee_id" UUID NOT NULL,
    "department_id" UUID NOT NULL,
    "source" "ReturnSource" NOT NULL,
    "reason" TEXT NOT NULL,
    "requested_on" DATE NOT NULL,
    "revocation_note" TEXT,
    "handover_required" BOOLEAN NOT NULL,
    "handover_due_on" DATE,
    "handover_confirmed_at" TIMESTAMPTZ(3),
    "handover_confirmed_by_employee_id" UUID,
    "handover_flagged" BOOLEAN NOT NULL DEFAULT false,
    "origin_request_id" UUID,
    "state" "ReturnRequestState" NOT NULL DEFAULT 'AWAITING_REVOCATION',
    "completed_at" TIMESTAMPTZ(3),
    "failed_at" TIMESTAMPTZ(3),
    "failure_reason" TEXT,
    -- A value, not a foreign key: the history outlives the account (as the audit trail does).
    "created_by_app_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "return_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "access_request_renewals" (
    "request_id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "previous_expected_end_date" DATE NOT NULL,
    "new_expected_end_date" DATE NOT NULL,
    "consecutive_months" INTEGER NOT NULL,
    "successor_assignment_id" UUID,
    "applied_at" TIMESTAMPTZ(3),

    CONSTRAINT "access_request_renewals_pkey" PRIMARY KEY ("request_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "return_requests_revocation_task_id_key" ON "return_requests"("revocation_task_id");
CREATE INDEX "return_requests_assignment_id_idx" ON "return_requests"("assignment_id");
CREATE INDEX "return_requests_plan_id_idx" ON "return_requests"("plan_id");
CREATE INDEX "return_requests_holder_employee_id_idx" ON "return_requests"("holder_employee_id");
CREATE INDEX "return_requests_requested_by_employee_id_idx" ON "return_requests"("requested_by_employee_id");
CREATE INDEX "return_requests_department_id_idx" ON "return_requests"("department_id");
CREATE INDEX "return_requests_origin_request_id_idx" ON "return_requests"("origin_request_id");
CREATE INDEX "access_request_renewals_assignment_id_idx" ON "access_request_renewals"("assignment_id");
CREATE UNIQUE INDEX "access_request_renewals_successor_assignment_id_key" ON "access_request_renewals"("successor_assignment_id");

-- AddForeignKey
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_assignment_id_fkey"
    FOREIGN KEY ("assignment_id") REFERENCES "license_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_plan_id_fkey"
    FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_revocation_task_id_fkey"
    FOREIGN KEY ("revocation_task_id") REFERENCES "provisioning_tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_requested_by_employee_id_fkey"
    FOREIGN KEY ("requested_by_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_holder_employee_id_fkey"
    FOREIGN KEY ("holder_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_department_id_fkey"
    FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_handover_confirmed_by_employee_id_fkey"
    FOREIGN KEY ("handover_confirmed_by_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_origin_request_id_fkey"
    FOREIGN KEY ("origin_request_id") REFERENCES "access_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "access_request_renewals" ADD CONSTRAINT "access_request_renewals_request_id_fkey"
    FOREIGN KEY ("request_id") REFERENCES "access_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "access_request_renewals" ADD CONSTRAINT "access_request_renewals_assignment_id_fkey"
    FOREIGN KEY ("assignment_id") REFERENCES "license_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "access_request_renewals" ADD CONSTRAINT "access_request_renewals_successor_assignment_id_fkey"
    FOREIGN KEY ("successor_assignment_id") REFERENCES "license_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Constraints Prisma cannot express (ADR-0005).

-- A seat has at most one return that waits for its revocation (US-05-13): two people asking at once leave one record.
CREATE UNIQUE INDEX "return_requests_one_awaiting_per_assignment"
    ON "return_requests"("assignment_id") WHERE "state" = 'AWAITING_REVOCATION';

ALTER TABLE "return_requests"
    -- The reason says something, and so does a note that is kept.
    ADD CONSTRAINT "return_requests_text_check" CHECK (
        btrim("reason") <> '' AND ("revocation_note" IS NULL OR btrim("revocation_note") <> '')
        AND ("failure_reason" IS NULL OR btrim("failure_reason") <> '')
    ),
    -- The holder returns their own seat, or the head of their department confirms it is no longer needed: never somebody
    -- else for them, and a head who confirms is not the holder.
    ADD CONSTRAINT "return_requests_source_check" CHECK (
        ("source" = 'EMPLOYEE_RETURN' AND "requested_by_employee_id" = "holder_employee_id")
        OR ("source" = 'HEAD_CONFIRMATION' AND "requested_by_employee_id" <> "holder_employee_id")
    ),
    -- Only a plan whose removal loses data asks for the confirmation of a handover, and it has a deadline; any other has none of
    -- it, so nothing is ever flagged for it (US-05-13 AC-6, AC-7).
    ADD CONSTRAINT "return_requests_handover_check" CHECK (
        (
            "handover_required" AND "handover_due_on" IS NOT NULL AND "handover_due_on" >= "requested_on"
            AND ("handover_confirmed_at" IS NULL) = ("handover_confirmed_by_employee_id" IS NULL)
        )
        OR (
            NOT "handover_required" AND "handover_due_on" IS NULL AND "handover_confirmed_at" IS NULL
            AND "handover_confirmed_by_employee_id" IS NULL AND NOT "handover_flagged"
        )
    ),
    -- Whoever confirms the handover is the person who sent the return, who triggers it (QĐ-62f).
    ADD CONSTRAINT "return_requests_handover_confirmer_check" CHECK (
        "handover_confirmed_by_employee_id" IS NULL OR "handover_confirmed_by_employee_id" = "requested_by_employee_id"
    ),
    -- A return is flagged as one whose handover was not confirmed only when it was completed without the confirmation.
    ADD CONSTRAINT "return_requests_flag_check" CHECK (
        NOT "handover_flagged" OR ("state" = 'COMPLETED' AND "handover_confirmed_at" IS NULL)
    ),
    -- The state and the columns that say it agree: a return that waits has neither end; one completed has when; one that
    -- failed has when and why (US-05-13 AC-8).
    ADD CONSTRAINT "return_requests_state_check" CHECK (
        ("state" = 'AWAITING_REVOCATION'
            AND "completed_at" IS NULL AND "failed_at" IS NULL AND "failure_reason" IS NULL)
        OR ("state" = 'COMPLETED'
            AND "completed_at" IS NOT NULL AND "failed_at" IS NULL AND "failure_reason" IS NULL)
        OR ("state" = 'FAILED'
            AND "failed_at" IS NOT NULL AND "failure_reason" IS NOT NULL AND "completed_at" IS NULL)
    );

-- What a return says when it is sent never changes, a confirmation of the handover is written once, and a return that has
-- ended (completed or failed) never changes again. A return is never deleted (INV-05): the audit trail keeps what was decided.
CREATE FUNCTION "return_request_reject_change"() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'A return of a seat is never deleted'
            USING ERRCODE = '55000', CONSTRAINT = 'return_requests_immutable';
    END IF;

    IF (NEW."id", NEW."organization_id", NEW."assignment_id", NEW."plan_id", NEW."revocation_task_id", NEW."requested_by_employee_id",
        NEW."holder_employee_id", NEW."department_id", NEW."source", NEW."reason", NEW."requested_on",
        NEW."revocation_note", NEW."handover_required", NEW."handover_due_on", NEW."origin_request_id",
        NEW."created_by_app_user_id", NEW."created_at")
       IS DISTINCT FROM
       (OLD."id", OLD."organization_id", OLD."assignment_id", OLD."plan_id", OLD."revocation_task_id", OLD."requested_by_employee_id",
        OLD."holder_employee_id", OLD."department_id", OLD."source", OLD."reason", OLD."requested_on",
        OLD."revocation_note", OLD."handover_required", OLD."handover_due_on", OLD."origin_request_id",
        OLD."created_by_app_user_id", OLD."created_at") THEN
        RAISE EXCEPTION 'What a return of a seat says when it is sent never changes'
            USING ERRCODE = '55000', CONSTRAINT = 'return_requests_immutable';
    END IF;

    IF OLD."state" <> 'AWAITING_REVOCATION' THEN
        RAISE EXCEPTION 'A return of a seat that has ended never changes again'
            USING ERRCODE = '55000', CONSTRAINT = 'return_requests_end_is_final';
    END IF;

    IF OLD."handover_confirmed_at" IS NOT NULL
       AND (NEW."handover_confirmed_at", NEW."handover_confirmed_by_employee_id")
           IS DISTINCT FROM (OLD."handover_confirmed_at", OLD."handover_confirmed_by_employee_id") THEN
        RAISE EXCEPTION 'The confirmation of the handover is written once'
            USING ERRCODE = '55000', CONSTRAINT = 'return_requests_confirmation_is_final';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "return_requests_immutable"
    BEFORE UPDATE OR DELETE ON "return_requests"
    FOR EACH ROW EXECUTE FUNCTION "return_request_reject_change"();

-- The renewal of a right asks for a later end, for a whole number of months, and writes its successor once.
ALTER TABLE "access_request_renewals"
    ADD CONSTRAINT "access_request_renewals_end_order" CHECK ("new_expected_end_date" > "previous_expected_end_date"),
    ADD CONSTRAINT "access_request_renewals_months_check" CHECK ("consecutive_months" >= 1),
    ADD CONSTRAINT "access_request_renewals_applied_check" CHECK (("successor_assignment_id" IS NULL) = ("applied_at" IS NULL));

CREATE FUNCTION "access_request_renewal_reject_change"() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'The detail of a request for a renewal is never deleted'
            USING ERRCODE = '55000', CONSTRAINT = 'access_request_renewals_immutable';
    END IF;

    IF (NEW."request_id", NEW."assignment_id", NEW."previous_expected_end_date", NEW."new_expected_end_date",
        NEW."consecutive_months")
       IS DISTINCT FROM
       (OLD."request_id", OLD."assignment_id", OLD."previous_expected_end_date", OLD."new_expected_end_date",
        OLD."consecutive_months") THEN
        RAISE EXCEPTION 'What a request for a renewal asks for never changes'
            USING ERRCODE = '55000', CONSTRAINT = 'access_request_renewals_immutable';
    END IF;

    IF OLD."successor_assignment_id" IS NOT NULL THEN
        RAISE EXCEPTION 'The record made by a renewal is written once'
            USING ERRCODE = '55000', CONSTRAINT = 'access_request_renewals_applied_is_final';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "access_request_renewals_immutable"
    BEFORE UPDATE OR DELETE ON "access_request_renewals"
    FOR EACH ROW EXECUTE FUNCTION "access_request_renewal_reject_change"();

-- A request of the kind RENEWAL has exactly one row of detail when the transaction commits, and a request of any other
-- kind has none. The two are written together, so the check waits for the commit.
CREATE FUNCTION "access_request_renewal_detail_check"() RETURNS trigger AS $$
DECLARE
    subject UUID;
    kind "AccessRequestType";
    detailed BOOLEAN;
BEGIN
    -- One function serves both tables, and each branch names a field that only its table has.
    IF TG_TABLE_NAME = 'access_requests' THEN
        subject := NEW."id";
    ELSE
        subject := NEW."request_id";
    END IF;
    SELECT r."type" INTO kind FROM "access_requests" r WHERE r."id" = subject;
    SELECT EXISTS (SELECT 1 FROM "access_request_renewals" d WHERE d."request_id" = subject) INTO detailed;

    IF (kind = 'RENEWAL') IS DISTINCT FROM detailed THEN
        RAISE EXCEPTION 'A request for a renewal has its detail, and no other request has one'
            USING ERRCODE = '23514', CONSTRAINT = 'access_requests_renewal_detail';
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "access_requests_renewal_detail"
    AFTER INSERT OR UPDATE OF "type" ON "access_requests"
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION "access_request_renewal_detail_check"();

CREATE CONSTRAINT TRIGGER "access_request_renewals_detail"
    AFTER INSERT ON "access_request_renewals"
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION "access_request_renewal_detail_check"();
