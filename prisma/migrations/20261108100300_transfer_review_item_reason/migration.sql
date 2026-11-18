-- M21a (QĐ-100, F17): the head says why a tool is still needed or no longer needed. The reason of a line decided before stays NULL, and the
-- one of a line whose decision is changed is overwritten (the Audit Trail keeps the earlier one). No rule makes it mandatory by decision:
-- a line decided by the system (a later change) has none.
ALTER TABLE "transfer_review_items" ADD COLUMN "reason" TEXT;
ALTER TABLE "transfer_review_items" ADD CONSTRAINT "transfer_review_items_reason_check"
    CHECK ("reason" IS NULL OR length(btrim("reason")) BETWEEN 1 AND 500);
