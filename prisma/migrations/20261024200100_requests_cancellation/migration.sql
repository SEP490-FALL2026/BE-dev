-- The IT Admin closes a request whose beneficiary left (g6-leaver-request-closure, US-03-04 AC-25): the request ends as CANCELLED with who
-- closed it, when and why, and the task of its grant, even one that is being worked, can end as cancelled when that is the reason.

-- 1. Why a request was cancelled. One cause today; the enum is where the next one goes.
CREATE TYPE "AccessRequestCancelCause" AS ENUM ('BENEFICIARY_LEFT');

ALTER TABLE "access_requests"
    ADD COLUMN "cancelled_at" TIMESTAMPTZ(3),
    ADD COLUMN "cancelled_by_employee_id" UUID,
    ADD COLUMN "cancel_cause" "AccessRequestCancelCause",
    ADD COLUMN "cancel_note" TEXT;

ALTER TABLE "access_requests"
    ADD CONSTRAINT "access_requests_cancelled_by_employee_id_fkey"
    FOREIGN KEY ("cancelled_by_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The columns and the state say the same thing: a cancelled request has who, when and why; no other has any of them. A note that is
-- given is not blank.
ALTER TABLE "access_requests"
    ADD CONSTRAINT "access_requests_cancellation_columns" CHECK (
        (
            ("state" = 'CANCELLED'
                AND "cancelled_at" IS NOT NULL AND "cancelled_by_employee_id" IS NOT NULL AND "cancel_cause" IS NOT NULL)
            OR ("state" <> 'CANCELLED'
                AND "cancelled_at" IS NULL AND "cancelled_by_employee_id" IS NULL AND "cancel_cause" IS NULL
                AND "cancel_note" IS NULL)
        )
        AND ("cancel_note" IS NULL OR length(btrim("cancel_note")) > 0)
    );

-- 2. The guard of 20261024030100 with one thing added: a task that is being worked can end as cancelled, and only when the reason that
-- closes it is that the beneficiary left. Withdrawing a request still never cancels a task that is being worked.
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
        OR (OLD."status"::text = 'IN_PROGRESS' AND NEW."status"::text = 'CANCELLED'
            AND NEW."close_reason" = 'BENEFICIARY_LEFT')
    ) THEN
        RAISE EXCEPTION 'A provisioning task cannot go from % to %', OLD."status", NEW."status"
            USING ERRCODE = '55000', CONSTRAINT = 'provisioning_task_transition';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
