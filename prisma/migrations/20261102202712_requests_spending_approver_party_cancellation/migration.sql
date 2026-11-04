-- QĐ-93k(1), OD-6 (`qd93-remove-fallback-substitute-approvers`, Task 1): the conversion command is the one who closes a request, or a line,
-- of the spending approver; it is not an employee, so the column that names who closed it may be empty — and only for the cause
-- `SPENDING_APPROVER_PARTY`. Every other cause still names who closed it. The definitions replaced are those of
-- `20261024200100_requests_cancellation` (requests) and `20261025010100_requests_line_cancellation` (lines).
ALTER TABLE "access_requests" DROP CONSTRAINT "access_requests_cancellation_columns";
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_cancellation_columns" CHECK (
    (
        (
            "state" = 'CANCELLED' AND "cancelled_at" IS NOT NULL AND "cancel_cause" IS NOT NULL
            AND ("cancelled_by_employee_id" IS NOT NULL OR "cancel_cause" = 'SPENDING_APPROVER_PARTY')
        )
        OR (
            "state" <> 'CANCELLED' AND "cancelled_at" IS NULL AND "cancelled_by_employee_id" IS NULL
            AND "cancel_cause" IS NULL AND "cancel_note" IS NULL
        )
    )
    AND ("cancel_note" IS NULL OR length(btrim("cancel_note")) > 0)
);

ALTER TABLE "access_request_lines" DROP CONSTRAINT "access_request_lines_ender_state_check";
ALTER TABLE "access_request_lines" ADD CONSTRAINT "access_request_lines_ender_state_check" CHECK (
    "state" NOT IN ('NEED_REJECTED', 'SPEND_REJECTED', 'WITHDRAWN', 'DROPPED', 'AWAITING_IT_CLOSE', 'CANCELLED')
    OR "ended_by_employee_id" IS NOT NULL
    OR ("state" = 'CANCELLED' AND "cancel_cause" = 'SPENDING_APPROVER_PARTY')
);
