-- A subscription of the shared pool (QĐ-103d(2), QĐ-103e, QĐ-103v(4), QĐ-104d(3)): the months it commits to, the IT Admin who answers
-- for it, the least number of seats the vendor sells and whether it prices its plan. Only added to: the owner department, its
-- triggers and its guard are left as they are, and the shared BillingCycle enum is not touched (requests use it too).

ALTER TABLE "subscriptions"
    ADD COLUMN "commitment_term_months" SMALLINT,
    ADD COLUMN "responsible_it_admin_employee_id" UUID,
    ADD COLUMN "vendor_minimum_seats" INTEGER,
    ADD COLUMN "is_primary_for_plan" BOOLEAN NOT NULL DEFAULT false;

-- A term already bought commits to a month when it is paid by the month and to a year otherwise; a K1 plan is by the month only.
UPDATE "subscriptions"
   SET "commitment_term_months" = CASE WHEN "billing_cycle" = 'MONTHLY' THEN 1 ELSE 12 END
 WHERE "kind" = 'TERM';
UPDATE "subscriptions" s
   SET "commitment_term_months" = 1
  FROM "plans" p
 WHERE p."id" = s."plan_id" AND p."provisioning_type" = 'K1' AND s."kind" = 'TERM';

ALTER TABLE "subscriptions"
    ADD CONSTRAINT "subscriptions_commitment_term_range" CHECK (
        "commitment_term_months" IS NULL OR "commitment_term_months" IN (1, 12)
    ),
    -- A perpetual purchase commits to no term.
    ADD CONSTRAINT "subscriptions_perpetual_no_commitment" CHECK (
        "kind" <> 'PERPETUAL' OR "commitment_term_months" IS NULL
    ),
    ADD CONSTRAINT "subscriptions_vendor_minimum_positive" CHECK (
        "vendor_minimum_seats" IS NULL OR "vendor_minimum_seats" > 0
    );

ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_responsible_it_admin_employee_id_fkey"
    FOREIGN KEY ("responsible_it_admin_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "subscriptions_responsible_it_admin_employee_id_idx" ON "subscriptions"("responsible_it_admin_employee_id");

-- At most one subscription prices a plan.
CREATE UNIQUE INDEX "subscriptions_one_primary_per_plan"
    ON "subscriptions"("organization_id", "plan_id") WHERE "is_primary_for_plan";
