-- PL-2.2 (QĐ-111ap, R-24, US-05-04 AC-22): a request for a group that the head sent back goes to its sender, who sends it on again; the head decides
-- its need at a NEW step (the record of approval of a step is one, and the old step is closed, returned). The line of a person that still waits
-- for its need then moves to the new step. The guard of the lines (the latest definition is the one of 20261025010100) keeps the identity of a line
-- but for that one move: from a closed need step to a pending or waiting need step of the same request, the line still waiting for its need.
-- Safe to run twice (the function is replaced).

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

  IF (NEW."request_id", NEW."employee_id", NEW."created_at")
     IS DISTINCT FROM (OLD."request_id", OLD."employee_id", OLD."created_at") THEN
    RAISE EXCEPTION 'The identity of a line never changes'
      USING ERRCODE = '55000', CONSTRAINT = 'access_request_lines_identity';
  END IF;

  -- The only change of the step that holds the need of a line: the request was sent back and sent on again, so the line that still waits for its
  -- need moves from the step that was returned (closed) to the new need step of the same request (PL-2.2, R-24).
  IF NEW."need_step_id" IS DISTINCT FROM OLD."need_step_id" AND (
       OLD."state" <> 'AWAITING_NEED' OR NEW."state" <> 'AWAITING_NEED'
       OR NOT EXISTS (
         SELECT 1 FROM "access_request_steps" s
          WHERE s."id" = OLD."need_step_id" AND s."kind" = 'NEED' AND s."state" = 'CLOSED')
       OR NOT EXISTS (
         SELECT 1 FROM "access_request_steps" s
          WHERE s."id" = NEW."need_step_id" AND s."request_id" = NEW."request_id" AND s."kind" = 'NEED'
            AND s."state" IN ('PENDING', 'WAITING'))
     ) THEN
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
