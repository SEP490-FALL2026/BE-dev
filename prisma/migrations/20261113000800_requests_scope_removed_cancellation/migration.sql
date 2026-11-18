-- QĐ-110m (X-SA.1b): a request the system closed because its kind left the scope (`SYSTEM_SCOPE_REMOVED`) names nobody who closed it, and only
-- the causes of the system (the two of X0.7, this one) and the conversion command's `SPENDING_APPROVER_PARTY` may leave that column empty. Every
-- column of a check is tested on its own (`IS NOT NULL`): a check passes on NULL, so a missing column must not pass through another. The definition
-- replaced is that of `20261113000400_requests_beneficiary_gone_cancellation`; only the new cause is added to its two lists.
ALTER TABLE "access_requests" DROP CONSTRAINT "access_requests_cancellation_columns";
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_cancellation_columns" CHECK (
    (
        (
            "state" = 'CANCELLED' AND "cancelled_at" IS NOT NULL AND "cancel_cause" IS NOT NULL
            AND (
                "cancelled_by_employee_id" IS NOT NULL
                OR "cancel_cause" IN (
                    'SPENDING_APPROVER_PARTY', 'SYSTEM_BENEFICIARY_LEFT', 'SYSTEM_BENEFICIARY_TRANSFERRED', 'SYSTEM_SCOPE_REMOVED'
                )
            )
            AND (
                "cancel_cause" NOT IN ('SYSTEM_BENEFICIARY_LEFT', 'SYSTEM_BENEFICIARY_TRANSFERRED', 'SYSTEM_SCOPE_REMOVED')
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
