-- W4-10 (D-10 = A): allow REPLY_NOTE_REQUIRED as a stop_reason when a head resubmits a C1-returned request without a reply note.
ALTER TABLE "spend_batch_items" DROP CONSTRAINT "spend_batch_items_stop_check";
ALTER TABLE "spend_batch_items"
    ADD CONSTRAINT "spend_batch_items_stop_check" CHECK (
        ("outcome" = 'STOPPED' AND "stop_reason" IS NOT NULL
            AND "stop_reason" IN (
                'PLAN_LINE_REQUIRED',
                'STALE_COST_EVIDENCE',
                'CLOSED_OR_EXPIRED_BUDGET_PERIOD',
                'PRICE_MISSING',
                'RATE_MISSING',
                'OVER_RESERVE',
                'NO_APPROVED_BUDGET',
                'PRICE_EXPIRED',
                'REPLY_NOTE_REQUIRED'
            ))
        OR ("outcome" IN ('SENT_TO_APPROVER', 'SENT_TO_FINANCE', 'AWAITING_RESERVE_CONFIRMATION') AND "stop_reason" IS NULL)
    );
