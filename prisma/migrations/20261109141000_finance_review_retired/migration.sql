-- BR-MF1-06g, QĐ-97c: there is no review of Finance, no question to Finance, no override and no wait for a budget any more (Q-26: simple data
-- migration, no judgement preflight; the demo is seeded again). What waits for Finance goes back to the queue of the head, where the check runs
-- when the head sends it on. Nothing is dropped (RV-15): the enum values and the old tables stay readable, and a CHECK refuses a NEW row that
-- uses them (NOT VALID looks at new and changed rows only). No grant to the runtime role here (RV-28).

-- 1. A request that waits for a review of Finance or for a budget, or that waits (under control) on a review nobody can hold, is back in the
-- queue of its head. The steps are read before they are closed.
UPDATE "access_requests" r
   SET "state" = 'AWAITING_SPEND_SUBMISSION'
 WHERE r."state" IN ('AWAITING_FINANCE_REVIEW', 'AWAITING_BUDGET')
    OR (r."state" = 'WAITING_CONTROLLED'
        AND EXISTS (SELECT 1 FROM "access_request_steps" s
                     WHERE s."request_id" = r."id" AND s."kind" = 'FINANCE_REVIEW' AND s."state" IN ('PENDING', 'WAITING')));

-- 2. A review that is open is closed without an outcome (a step that ended without a decision is CLOSED); the question of the approver to Finance
-- that is open is closed with it.
UPDATE "budget_information_requests"
   SET "state" = 'CLOSED', "closed_at" = now(), "close_reason" = 'STEP_CLOSED'
 WHERE "state" = 'OPEN';

UPDATE "access_request_steps"
   SET "state" = 'CLOSED', "waiting_reason" = NULL, "decided_at" = now()
 WHERE "kind" = 'FINANCE_REVIEW' AND "state" IN ('PENDING', 'WAITING');

-- 3. Nothing new is written in what is retired.
ALTER TABLE "access_requests"
    ADD CONSTRAINT "access_requests_state_not_retired_check"
    CHECK ("state" NOT IN ('AWAITING_FINANCE_REVIEW', 'AWAITING_BUDGET'));

ALTER TABLE "access_request_steps"
    ADD CONSTRAINT "access_request_steps_finance_review_retired_check" CHECK ("kind" <> 'FINANCE_REVIEW') NOT VALID;

ALTER TABLE "request_finance_reviews"
    ADD CONSTRAINT "request_finance_reviews_retired_check" CHECK (false) NOT VALID;

ALTER TABLE "budget_information_requests"
    ADD CONSTRAINT "budget_information_requests_retired_check" CHECK (false) NOT VALID;

-- The approval has no override any more (an approval on a year with too little money is blocked, not accepted with a reason).
ALTER TABLE "spend_decisions"
    ADD CONSTRAINT "spend_decisions_override_retired_check"
    CHECK ("override_reason" IS NULL AND cardinality("override_years") = 0) NOT VALID;

-- A check is made by the submission of the head, by the confirmation of the reserve and by the decision, and goes where the outcome says.
ALTER TABLE "request_budget_checks"
    ADD CONSTRAINT "request_budget_checks_trigger_retired_check"
    CHECK ("trigger" IN ('SUBMISSION', 'SPEND_DECISION', 'RESERVE_CONFIRMATION')) NOT VALID;

-- 4. An item of a batch that waits for the head to confirm the reserve, and the reasons a request is blocked (BR-MF1-06g): the old list of reasons
-- stays readable; a request is no longer sent to Finance or given back by it.
ALTER TABLE "spend_batch_items" DROP CONSTRAINT "spend_batch_items_stop_check";
ALTER TABLE "spend_batch_items"
    ADD CONSTRAINT "spend_batch_items_stop_check" CHECK (
        ("outcome" = 'STOPPED' AND "stop_reason" IS NOT NULL
            AND "stop_reason" IN ('PLAN_LINE_REQUIRED', 'STALE_COST_EVIDENCE', 'CLOSED_OR_EXPIRED_BUDGET_PERIOD', 'PRICE_MISSING',
                                  'RATE_MISSING', 'OVER_RESERVE', 'NO_APPROVED_BUDGET', 'PRICE_EXPIRED'))
        OR ("outcome" IN ('SENT_TO_APPROVER', 'SENT_TO_FINANCE', 'AWAITING_RESERVE_CONFIRMATION') AND "stop_reason" IS NULL)
    );
-- No CHECK refuses a new SENT_TO_FINANCE item: an old item is still updated when its request leaves the batch, and a CHECK cannot tell that
-- update from an insert. The code does not write it any more.
