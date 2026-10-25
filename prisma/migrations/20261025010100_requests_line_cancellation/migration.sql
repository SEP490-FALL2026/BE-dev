-- One person of a request for a group left, and the IT Admin closes their line only (g5-group-requests and g6-leaver-request-closure follow-up):
-- the line ends as CANCELLED with who closed it, when and why, and the request goes on for the people who remain.

-- 1. Why the line was cancelled: the cause of the cancellation of a request, which the line shares.
ALTER TABLE "access_request_lines" ADD COLUMN "cancel_cause" "AccessRequestCancelCause";

-- 2. The checks of 20261024130100 with the new state in them: a cancelled line has ended, names who closed it and says why; no other line
-- has a cause. A cancelled line never asked to be withdrawn, so the check of the withdrawal does not change.
ALTER TABLE "access_request_lines"
    DROP CONSTRAINT "access_request_lines_end_check",
    DROP CONSTRAINT "access_request_lines_ender_state_check";

ALTER TABLE "access_request_lines"
    ADD CONSTRAINT "access_request_lines_end_check" CHECK (
        ("state" IN ('NEED_REJECTED', 'SPEND_REJECTED', 'COMPLETED', 'FAILED', 'WITHDRAWN', 'DROPPED', 'CANCELLED')) = ("ended_at" IS NOT NULL)
    ),
    ADD CONSTRAINT "access_request_lines_ender_state_check" CHECK (
        "state" NOT IN ('NEED_REJECTED', 'SPEND_REJECTED', 'WITHDRAWN', 'DROPPED', 'AWAITING_IT_CLOSE', 'CANCELLED')
        OR "ended_by_employee_id" IS NOT NULL
    ),
    ADD CONSTRAINT "access_request_lines_cancel_cause_check" CHECK (("state" = 'CANCELLED') = ("cancel_cause" IS NOT NULL));

-- 3. The guard of 20261024130100 (the latest definition) with one thing added: a line that waits for its need, has it confirmed, is
-- approved or is being carried out can end as cancelled. A line that waits for the IT Admin to close the task of a failed grant is not
-- cancelled here: that task has its own way, and an ended line is never touched again.
CREATE OR REPLACE FUNCTION access_request_lines_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  kind "AccessRequestType";
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'A line of a request is never deleted'
      USING ERRCODE = '55000', CONSTRAINT = 'access_request_lines_immutable';
  END IF;

  IF TG_OP = 'INSERT' THEN
    SELECT r."type" INTO kind FROM "access_requests" r WHERE r."id" = NEW."request_id";
    IF kind IS DISTINCT FROM 'GROUP_GRANT' THEN
      RAISE EXCEPTION 'Only a request for a group has lines'
        USING ERRCODE = '23514', CONSTRAINT = 'access_request_lines_group_only';
    END IF;
    IF NEW."state" NOT IN ('AWAITING_NEED', 'NEED_CONFIRMED') THEN
      RAISE EXCEPTION 'A line begins awaiting its need or with the need confirmed'
        USING ERRCODE = '23514', CONSTRAINT = 'access_request_lines_initial_state';
    END IF;

    RETURN NEW;
  END IF;

  IF (NEW."request_id", NEW."employee_id", NEW."need_step_id", NEW."created_at")
     IS DISTINCT FROM (OLD."request_id", OLD."employee_id", OLD."need_step_id", OLD."created_at") THEN
    RAISE EXCEPTION 'The identity of a line never changes'
      USING ERRCODE = '55000', CONSTRAINT = 'access_request_lines_identity';
  END IF;

  IF OLD."state" IN ('NEED_REJECTED', 'SPEND_REJECTED', 'COMPLETED', 'FAILED', 'WITHDRAWN', 'DROPPED', 'CANCELLED') THEN
    RAISE EXCEPTION 'A line that has ended is never changed'
      USING ERRCODE = '55000', CONSTRAINT = 'access_request_lines_ended';
  END IF;

  IF NEW."state" <> OLD."state" AND NOT (
       (OLD."state" = 'AWAITING_NEED' AND NEW."state" IN ('NEED_CONFIRMED', 'NEED_REJECTED', 'WITHDRAWN', 'CANCELLED'))
    OR (OLD."state" = 'NEED_CONFIRMED' AND NEW."state" IN ('APPROVED', 'SPEND_REJECTED', 'WITHDRAWN', 'DROPPED', 'CANCELLED'))
    OR (OLD."state" = 'APPROVED' AND NEW."state" IN ('EXECUTING', 'WITHDRAWN', 'CANCELLED'))
    OR (OLD."state" = 'EXECUTING' AND NEW."state" IN ('COMPLETED', 'FAILED', 'WITHDRAWN', 'AWAITING_IT_CLOSE', 'CANCELLED'))
    OR (OLD."state" = 'AWAITING_IT_CLOSE' AND NEW."state" = 'WITHDRAWN')
  ) THEN
    RAISE EXCEPTION 'A line cannot move from % to %', OLD."state", NEW."state"
      USING ERRCODE = '55000', CONSTRAINT = 'access_request_lines_transition';
  END IF;

  RETURN NEW;
END;
$$;
