-- FIX-SM1 SM1-03 (QĐ-103k, QĐ-111ae, security-jobs.md): the mark that one subscription was charged for one month that has ended. The sweeper charged a month
-- only when it had no row at all, so a subscription that failed in the middle of the pass left the ones after it with no row for good; it now looks for
-- the subscriptions of the month that have no mark and charges those, each in a transaction of its own that writes its mark in the same step (a mark exists
-- if and only if that subscription was charged for that month). A month charged on request (the review that fixes the numbers of a month) charges every
-- subscription again whatever the marks say. Expand only: one new table; nothing is dropped or rewritten. The ids of the other contexts are values.
-- Safe to run twice. It does not depend on a table of the budget-cycle migrations (2026111310xxxx).

CREATE TABLE IF NOT EXISTS "seat_month_runs" (
    "id" uuid NOT NULL,
    "organization_id" uuid NOT NULL,
    "subscription_id" uuid NOT NULL,
    "month" date NOT NULL,
    -- How many rows of the subscription and the month the charge left (0 when none of its seats cost a department anything).
    "rows" integer NOT NULL,
    "completed_at" timestamptz(3) NOT NULL,
    CONSTRAINT "seat_month_runs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "seat_month_runs_month_check" CHECK (EXTRACT(day FROM "month") = 1),
    CONSTRAINT "seat_month_runs_rows_check" CHECK ("rows" >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS "seat_month_runs_subscription_id_month_key" ON "seat_month_runs" ("subscription_id", "month");
CREATE INDEX IF NOT EXISTS "seat_month_runs_month_idx" ON "seat_month_runs" ("month");
