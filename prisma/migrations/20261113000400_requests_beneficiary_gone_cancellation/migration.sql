-- QĐ-110d, QĐ-110o (X0.7): the system closes a request, or a line, whose person is gone (`BeneficiaryGoneCancellation`). It is not an
-- employee, so the column that names who closed it is empty for the two causes of the system — and only for them (and the conversion
-- command's `SPENDING_APPROVER_PARTY`, as before). A cause of the system never names an employee, and every other cause still does. Every
-- column of a check is tested on its own (`IS NOT NULL`): a check passes on NULL, so a missing column must not pass through another.
-- The definitions replaced are those of `20261102202712_requests_spending_approver_party_cancellation`.
ALTER TABLE "access_requests" DROP CONSTRAINT "access_requests_cancellation_columns";
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_cancellation_columns" CHECK (
    (
        (
            "state" = 'CANCELLED' AND "cancelled_at" IS NOT NULL AND "cancel_cause" IS NOT NULL
            AND (
                "cancelled_by_employee_id" IS NOT NULL
                OR "cancel_cause" IN ('SPENDING_APPROVER_PARTY', 'SYSTEM_BENEFICIARY_LEFT', 'SYSTEM_BENEFICIARY_TRANSFERRED')
            )
            AND (
                "cancel_cause" NOT IN ('SYSTEM_BENEFICIARY_LEFT', 'SYSTEM_BENEFICIARY_TRANSFERRED')
                OR "cancelled_by_employee_id" IS NULL
            )
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
    OR (
        "state" = 'CANCELLED' AND "cancel_cause" IS NOT NULL
        AND "cancel_cause" IN ('SPENDING_APPROVER_PARTY', 'SYSTEM_BENEFICIARY_LEFT', 'SYSTEM_BENEFICIARY_TRANSFERRED')
    )
);
-- A line the system closed names nobody who closed it.
ALTER TABLE "access_request_lines" ADD CONSTRAINT "access_request_lines_system_cancel_check" CHECK (
    "cancel_cause" IS NULL
    OR "cancel_cause" NOT IN ('SYSTEM_BENEFICIARY_LEFT', 'SYSTEM_BENEFICIARY_TRANSFERRED')
    OR "ended_by_employee_id" IS NULL
);
