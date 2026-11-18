-- The requester withdraws a request that is still waiting, or whose grant has not been carried out (US-05-08). The request
-- ends as WITHDRAWN; when the grant failed it first waits for the IT Admin to close the task (AWAITING_IT_CLOSE). The task of
-- the grant ends as CANCELLED and its assignment as a cancelled one: the period is empty, so the seat is free on every day.

-- 1. The request: who withdrew, when, and why. Whoever asked is the requester or, in the cases of FR-3.20, the head.
ALTER TABLE "access_requests"
    ADD COLUMN "withdrawal_requested_at" TIMESTAMPTZ(3),
    ADD COLUMN "withdrawn_by_employee_id" UUID,
    ADD COLUMN "withdrawal_reason" TEXT,
    ADD COLUMN "withdrawn_at" TIMESTAMPTZ(3);

ALTER TABLE "access_requests"
    ADD CONSTRAINT "access_requests_withdrawn_by_employee_id_fkey"
    FOREIGN KEY ("withdrawn_by_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The columns and the state say the same thing: a request waiting for the close has been asked to withdraw and not ended; a
-- withdrawn one was asked and ended; no other has any of them. A reason that is given is not blank.
ALTER TABLE "access_requests"
    ADD CONSTRAINT "access_requests_withdrawal_columns" CHECK (
        (
            ("state" = 'AWAITING_IT_CLOSE'
                AND "withdrawal_requested_at" IS NOT NULL AND "withdrawn_by_employee_id" IS NOT NULL
                AND "withdrawn_at" IS NULL)
            OR ("state" = 'WITHDRAWN'
                AND "withdrawal_requested_at" IS NOT NULL AND "withdrawn_by_employee_id" IS NOT NULL
                AND "withdrawn_at" IS NOT NULL AND "withdrawn_at" >= "withdrawal_requested_at")
            OR ("state" NOT IN ('AWAITING_IT_CLOSE', 'WITHDRAWN')
                AND "withdrawal_requested_at" IS NULL AND "withdrawn_by_employee_id" IS NULL
                AND "withdrawal_reason" IS NULL AND "withdrawn_at" IS NULL)
        )
        AND ("withdrawal_reason" IS NULL OR length(btrim("withdrawal_reason")) > 0)
    );

-- 2. The assignment of a grant that was cancelled: like a failed one, it ends the day it starts, so no day counts it among the
-- seats taken, and the row stays as what was decided. It is never at once failed and cancelled.
ALTER TABLE "license_assignments" ADD COLUMN "cancelled_at" TIMESTAMPTZ(3);

ALTER TABLE "license_assignments" DROP CONSTRAINT "license_assignments_period_order";
ALTER TABLE "license_assignments"
    ADD CONSTRAINT "license_assignments_period_order" CHECK (
        "valid_until" IS NULL OR "valid_until" > "valid_from"
        OR (("failed_at" IS NOT NULL OR "cancelled_at" IS NOT NULL) AND "valid_until" = "valid_from")
    ),
    ADD CONSTRAINT "license_assignments_cancelled_is_empty" CHECK (
        "cancelled_at" IS NULL OR ("valid_until" IS NOT NULL AND "valid_until" = "valid_from")
    ),
    ADD CONSTRAINT "license_assignments_failed_or_cancelled" CHECK ("failed_at" IS NULL OR "cancelled_at" IS NULL);

CREATE OR REPLACE FUNCTION "license_assignment_reject_change"() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'A license assignment is never deleted'
            USING ERRCODE = '55000', CONSTRAINT = 'license_assignments_immutable';
    END IF;

    IF (NEW."id", NEW."organization_id", NEW."kind", NEW."source", NEW."plan_id", NEW."subscription_id",
        NEW."employee_id", NEW."account_identifier", NEW."normalized_account_identifier", NEW."reason",
        NEW."cost_center_id", NEW."owning_department_id", NEW."valid_from", NEW."valid_from_basis", NEW."predecessor_id",
        NEW."baseline_import_id", NEW."created_by_app_user_id", NEW."created_at")
       IS DISTINCT FROM
       (OLD."id", OLD."organization_id", OLD."kind", OLD."source", OLD."plan_id", OLD."subscription_id",
        OLD."employee_id", OLD."account_identifier", OLD."normalized_account_identifier", OLD."reason",
        OLD."cost_center_id", OLD."owning_department_id", OLD."valid_from", OLD."valid_from_basis", OLD."predecessor_id",
        OLD."baseline_import_id", OLD."created_by_app_user_id", OLD."created_at") THEN
        RAISE EXCEPTION 'Only when a license assignment ends and when it is expected to end may change'
            USING ERRCODE = '55000', CONSTRAINT = 'license_assignments_immutable';
    END IF;

    IF OLD."failed_at" IS NOT NULL
       AND (NEW."failed_at", NEW."cancelled_at", NEW."valid_until", NEW."expected_end_date")
           IS DISTINCT FROM (OLD."failed_at", OLD."cancelled_at", OLD."valid_until", OLD."expected_end_date") THEN
        RAISE EXCEPTION 'A license assignment that failed never changes again'
            USING ERRCODE = '55000', CONSTRAINT = 'license_assignments_failed_is_final';
    END IF;

    IF OLD."cancelled_at" IS NOT NULL
       AND (NEW."failed_at", NEW."cancelled_at", NEW."valid_until", NEW."expected_end_date")
           IS DISTINCT FROM (OLD."failed_at", OLD."cancelled_at", OLD."valid_until", OLD."expected_end_date") THEN
        RAISE EXCEPTION 'A license assignment that was cancelled never changes again'
            USING ERRCODE = '55000', CONSTRAINT = 'license_assignments_cancelled_is_final';
    END IF;

    IF OLD."failed_at" IS NULL AND NEW."failed_at" IS NOT NULL AND OLD."valid_until" IS NOT NULL THEN
        RAISE EXCEPTION 'Only an assignment that is still open can fail'
            USING ERRCODE = '55000', CONSTRAINT = 'license_assignments_failed_needs_open';
    END IF;

    IF OLD."cancelled_at" IS NULL AND NEW."cancelled_at" IS NOT NULL AND OLD."valid_until" IS NOT NULL THEN
        RAISE EXCEPTION 'Only an assignment that is still open can be cancelled'
            USING ERRCODE = '55000', CONSTRAINT = 'license_assignments_cancelled_needs_open';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. The task of a grant that was cancelled: the end of it, with who closed it and why. A cancelled task never had a result:
-- it was not completed and has nothing to retry. When it had failed first, the failure it ended stays on it.
ALTER TABLE "provisioning_tasks" DROP CONSTRAINT "provisioning_tasks_status_columns";
ALTER TABLE "provisioning_tasks"
    ADD CONSTRAINT "provisioning_tasks_status_columns" CHECK (
        "attempts" >= 0 AND (
            ("status" = 'QUEUED'
                AND "claimed_by_app_user_id" IS NULL AND "claimed_at" IS NULL
                AND "completed_by_app_user_id" IS NULL AND "completed_at" IS NULL AND "evidence" IS NULL
                AND "failed_by_app_user_id" IS NULL AND "failed_at" IS NULL AND "failure_reason" IS NULL
                AND "failure_kind" IS NULL AND "next_retry_at" IS NULL
                AND "closed_by_app_user_id" IS NULL AND "closed_at" IS NULL AND "close_reason" IS NULL)
            OR ("status" = 'RETRY_SCHEDULED'
                AND "failure_kind" = 'TRANSIENT' AND "next_retry_at" IS NOT NULL
                AND "attempts" >= 1 AND "last_error" IS NOT NULL
                AND "claimed_by_app_user_id" IS NULL AND "claimed_at" IS NULL
                AND "completed_by_app_user_id" IS NULL AND "completed_at" IS NULL AND "evidence" IS NULL
                AND "failed_by_app_user_id" IS NULL AND "failed_at" IS NULL AND "failure_reason" IS NULL
                AND "closed_by_app_user_id" IS NULL AND "closed_at" IS NULL AND "close_reason" IS NULL)
            OR ("status" = 'IN_PROGRESS'
                AND "claimed_at" IS NOT NULL AND ("channel" = 'CONNECTOR' OR "claimed_by_app_user_id" IS NOT NULL)
                AND "completed_by_app_user_id" IS NULL AND "completed_at" IS NULL AND "evidence" IS NULL
                AND "failed_by_app_user_id" IS NULL AND "failed_at" IS NULL AND "failure_reason" IS NULL
                AND "failure_kind" IS NULL AND "next_retry_at" IS NULL
                AND "closed_by_app_user_id" IS NULL AND "closed_at" IS NULL AND "close_reason" IS NULL)
            OR ("status" = 'COMPLETED'
                AND "claimed_by_app_user_id" IS NOT NULL AND "claimed_at" IS NOT NULL
                AND "completed_by_app_user_id" IS NOT NULL AND "completed_at" IS NOT NULL
                AND "evidence" IS NOT NULL AND length(btrim("evidence")) > 0
                AND "failed_by_app_user_id" IS NULL AND "failed_at" IS NULL AND "failure_reason" IS NULL
                AND "failure_kind" IS NULL AND "next_retry_at" IS NULL
                AND "closed_by_app_user_id" IS NULL AND "closed_at" IS NULL AND "close_reason" IS NULL)
            OR ("status" = 'FAILED'
                AND "failed_at" IS NOT NULL AND "failure_kind" IS NOT NULL
                AND "failure_reason" IS NOT NULL AND length(btrim("failure_reason")) > 0
                AND ("channel" = 'CONNECTOR'
                     OR ("failed_by_app_user_id" IS NOT NULL
                         AND "claimed_by_app_user_id" IS NOT NULL AND "claimed_at" IS NOT NULL))
                AND "completed_by_app_user_id" IS NULL AND "completed_at" IS NULL AND "evidence" IS NULL
                AND "next_retry_at" IS NULL
                AND "closed_by_app_user_id" IS NULL AND "closed_at" IS NULL AND "close_reason" IS NULL)
            OR ("status" = 'CLOSED_FAILED'
                AND "closed_by_app_user_id" IS NOT NULL AND "closed_at" IS NOT NULL
                AND "close_reason" IS NOT NULL AND length(btrim("close_reason")) > 0
                AND "failed_at" IS NOT NULL AND "failure_kind" IS NOT NULL
                AND "failure_reason" IS NOT NULL AND length(btrim("failure_reason")) > 0
                AND "completed_by_app_user_id" IS NULL AND "completed_at" IS NULL AND "evidence" IS NULL
                AND "next_retry_at" IS NULL)
            OR ("status" = 'CANCELLED'
                AND "closed_by_app_user_id" IS NOT NULL AND "closed_at" IS NOT NULL
                AND "close_reason" IS NOT NULL AND length(btrim("close_reason")) > 0
                AND "completed_by_app_user_id" IS NULL AND "completed_at" IS NULL AND "evidence" IS NULL
                AND "next_retry_at" IS NULL)
        )
    );

-- A completed task, one closed as failed and one cancelled are the end of the work: no writer changes them.
CREATE OR REPLACE FUNCTION "provisioning_task_guard"() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'A provisioning task is never deleted'
            USING ERRCODE = '55000', CONSTRAINT = 'provisioning_task_kept';
    END IF;
    IF OLD."status" IN ('COMPLETED', 'CLOSED_FAILED', 'CANCELLED') THEN
        RAISE EXCEPTION 'A task that is completed, closed as failed or cancelled is never changed'
            USING ERRCODE = '55000', CONSTRAINT = 'provisioning_task_final';
    END IF;
    IF NEW."max_attempts" IS DISTINCT FROM OLD."max_attempts" THEN
        RAISE EXCEPTION 'The most tries of a task are fixed when it is made'
            USING ERRCODE = '55000', CONSTRAINT = 'provisioning_task_max_attempts_fixed';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- A task is cancelled before anyone worked it (queued, or waiting for its retry) or after it failed, never while it is being
-- worked and never once it is completed.
CREATE OR REPLACE FUNCTION "provisioning_task_transition_guard"() RETURNS trigger AS $$
BEGIN
    IF NEW."status" <> OLD."status" AND NOT (
        (OLD."status"::text, NEW."status"::text) IN (
            ('QUEUED', 'IN_PROGRESS'),
            ('QUEUED', 'RETRY_SCHEDULED'),
            ('QUEUED', 'FAILED'),
            ('QUEUED', 'CANCELLED'),
            ('IN_PROGRESS', 'COMPLETED'),
            ('IN_PROGRESS', 'FAILED'),
            ('IN_PROGRESS', 'RETRY_SCHEDULED'),
            ('RETRY_SCHEDULED', 'FAILED'),
            ('RETRY_SCHEDULED', 'CANCELLED'),
            ('FAILED', 'QUEUED'),
            ('FAILED', 'CLOSED_FAILED'),
            ('FAILED', 'CANCELLED')
        )
    ) THEN
        RAISE EXCEPTION 'A provisioning task cannot go from % to %', OLD."status", NEW."status"
            USING ERRCODE = '55000', CONSTRAINT = 'provisioning_task_transition';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
