-- FIX-B3b FX3-01 (QĐ-104k(4), QĐ-103r, US-12-17 AC-11, US-12-12 AC-15): the invoice of a `K1` the IT Admin bought and whose grant then failed is no expense of any
-- Cost Center: it is a line of the Cost Center not allocated, with the reason and the department of the user. The invoice names the reason and the department
-- and has no commitment, no subscription, no Cost Center and no case outside the process; the place check accepts the reason as a place. Expand only; safe to run
-- twice (the check is dropped and added again, the columns are added once).
ALTER TABLE "invoices"
  ADD COLUMN IF NOT EXISTS "unallocated_reason" text,
  ADD COLUMN IF NOT EXISTS "department_id" uuid;

ALTER TABLE "invoices" DROP CONSTRAINT IF EXISTS "invoices_place_check";
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_place_check"
    CHECK ("commitment_id" IS NOT NULL OR "subscription_id" IS NOT NULL OR "cost_center_id" IS NOT NULL OR "out_of_process_case_id" IS NOT NULL
           OR "unallocated_reason" IS NOT NULL);

ALTER TABLE "invoices" DROP CONSTRAINT IF EXISTS "invoices_unallocated_check";
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_unallocated_check"
    CHECK (("unallocated_reason" IS NULL AND "department_id" IS NULL)
           OR ("unallocated_reason" = 'K1_GRANT_FAILED' AND "department_id" IS NOT NULL
               AND "commitment_id" IS NULL AND "subscription_id" IS NULL AND "cost_center_id" IS NULL AND "out_of_process_case_id" IS NULL));

-- The purchase invoice keeps what its plan decided at the submission (as it keeps the Cost Center that bears it): the invoice goes to the line not allocated, and
-- Finance signs it there whatever state the request has reached by then.
ALTER TABLE "purchase_invoices" ADD COLUMN IF NOT EXISTS "unallocated_reason" text;
ALTER TABLE "purchase_invoices" DROP CONSTRAINT IF EXISTS "purchase_invoices_unallocated_check";
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_unallocated_check"
    CHECK ("unallocated_reason" IS NULL OR ("unallocated_reason" = 'K1_GRANT_FAILED' AND "charged_cost_center_id" IS NULL));
