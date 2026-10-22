-- The handling of a failed task (g4-provisioning-failure-handling, US-07-04): how it failed, how many times it was tried,
-- when the next try is due, and the three decisions an IT Admin takes on it (try again, hand it to a person, close it as
-- failed). Only closing is final. A grant that is closed as failed leaves its assignment as a failed one: the period is
-- empty, so the seat is free again on every day, and the row stays as the history of what was decided.

-- AlterTable
ALTER TABLE "provisioning_tasks"
    ADD COLUMN "failure_kind" "ProvisioningFailureKind",
    ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "last_error" TEXT,
    ADD COLUMN "next_retry_at" TIMESTAMPTZ(3),
    ADD COLUMN "closed_by_app_user_id" UUID,
    ADD COLUMN "closed_at" TIMESTAMPTZ(3),
    ADD COLUMN "close_reason" TEXT,
    ADD COLUMN "handed_off_by_app_user_id" UUID,
    ADD COLUMN "handed_off_at" TIMESTAMPTZ(3),
    ADD COLUMN "hand_off_evidence" TEXT;

-- A task that a person reported as not done before this migration was a failure of that kind.
UPDATE "provisioning_tasks" SET "failure_kind" = 'NOT_DONE' WHERE "status" = 'FAILED';

-- The status and the columns say the same thing, in each of the six states. A task of the connector is taken and failed by
-- the system, so only a task by hand needs a person for those steps.
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
        )
    );

-- A hand-off to a person is whole or absent: who, when and the evidence that was given with it.
ALTER TABLE "provisioning_tasks"
    ADD CONSTRAINT "provisioning_tasks_hand_off_whole" CHECK (
        ("handed_off_by_app_user_id" IS NULL) = ("handed_off_at" IS NULL)
        AND ("handed_off_by_app_user_id" IS NULL) = ("hand_off_evidence" IS NULL)
        AND ("hand_off_evidence" IS NULL OR length(btrim("hand_off_evidence")) > 0)
    );

-- A completed task and a task closed as failed are the end of the work: no writer changes them, none is ever deleted.
CREATE OR REPLACE FUNCTION "provisioning_task_guard"() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'A provisioning task is never deleted'
            USING ERRCODE = '55000', CONSTRAINT = 'provisioning_task_kept';
    END IF;
    IF OLD."status" IN ('COMPLETED', 'CLOSED_FAILED') THEN
        RAISE EXCEPTION 'A task that is completed or closed as failed is never changed'
            USING ERRCODE = '55000', CONSTRAINT = 'provisioning_task_final';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- AlterTable
ALTER TABLE "license_assignments" ADD COLUMN "failed_at" TIMESTAMPTZ(3);

-- An assignment ends after it starts, except one that failed: its period is empty (it ends the day it starts), so no day
-- has it among the seats taken, and it overlaps nothing.
ALTER TABLE "license_assignments" DROP CONSTRAINT "license_assignments_period_order";
ALTER TABLE "license_assignments"
    ADD CONSTRAINT "license_assignments_period_order" CHECK (
        "valid_until" IS NULL OR "valid_until" > "valid_from" OR ("failed_at" IS NOT NULL AND "valid_until" = "valid_from")
    ),
    ADD CONSTRAINT "license_assignments_failed_is_empty" CHECK (
        "failed_at" IS NULL OR ("valid_until" IS NOT NULL AND "valid_until" = "valid_from")
    );

-- History: nothing of an assignment changes but when it ends and when it is expected to end, and, once, that it failed:
-- only an open assignment can fail, and a failed one never changes again.
CREATE OR REPLACE FUNCTION "license_assignment_reject_change"() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'A license assignment is never deleted'
            USING ERRCODE = '55000', CONSTRAINT = 'license_assignments_immutable';
    END IF;

    IF (NEW."id", NEW."organization_id", NEW."kind", NEW."source", NEW."plan_id", NEW."subscription_id",
        NEW."employee_id", NEW."account_identifier", NEW."normalized_account_identifier", NEW."reason",
        NEW."cost_center_id", NEW."valid_from", NEW."valid_from_basis", NEW."predecessor_id",
        NEW."baseline_import_id", NEW."created_by_app_user_id", NEW."created_at")
       IS DISTINCT FROM
       (OLD."id", OLD."organization_id", OLD."kind", OLD."source", OLD."plan_id", OLD."subscription_id",
        OLD."employee_id", OLD."account_identifier", OLD."normalized_account_identifier", OLD."reason",
        OLD."cost_center_id", OLD."valid_from", OLD."valid_from_basis", OLD."predecessor_id",
        OLD."baseline_import_id", OLD."created_by_app_user_id", OLD."created_at") THEN
        RAISE EXCEPTION 'Only when a license assignment ends and when it is expected to end may change'
            USING ERRCODE = '55000', CONSTRAINT = 'license_assignments_immutable';
    END IF;

    IF OLD."failed_at" IS NOT NULL
       AND (NEW."failed_at", NEW."valid_until", NEW."expected_end_date")
           IS DISTINCT FROM (OLD."failed_at", OLD."valid_until", OLD."expected_end_date") THEN
        RAISE EXCEPTION 'A license assignment that failed never changes again'
            USING ERRCODE = '55000', CONSTRAINT = 'license_assignments_failed_is_final';
    END IF;

    IF OLD."failed_at" IS NULL AND NEW."failed_at" IS NOT NULL AND OLD."valid_until" IS NOT NULL THEN
        RAISE EXCEPTION 'Only an assignment that is still open can fail'
            USING ERRCODE = '55000', CONSTRAINT = 'license_assignments_failed_needs_open';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
