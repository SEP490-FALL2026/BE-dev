-- SM-1.2 (QĐ-103k, QĐ-104c, QĐ-111bg, B-2): what one seat of a K2 pool cost one department in one month that has ended. One row for each seat
-- (assignment), month and department: the days the seat was held in that department, the price of a month, and the amount of the days (the
-- remainder of rounding is on the last stretch of the month, so the rows of a seat add up to the price of the days it was held). `commitment_id` and
-- `applied_minor` say what of the amount took the commitment of the seat down (the same Cost Center only).
-- Expand only: one new table; nothing is dropped or rewritten. The rows of a subscription and a month are replaced together by the service until a
-- review period signs the month (RV-1), so the table is not evidence in itself and the runtime role keeps plain DML. The ids of the other contexts
-- (organization, subscription, assignment, employee, department, Cost Center) are values, not foreign keys, as in `purchase_invoices`.
-- Safe to run twice. It does not depend on a table of the budget-cycle migrations (2026111310xxxx), only on `budget_commitments`.

CREATE TABLE IF NOT EXISTS "seat_month_charges" (
    "id" uuid NOT NULL,
    "organization_id" uuid NOT NULL,
    "subscription_id" uuid NOT NULL,
    "assignment_id" uuid NOT NULL,
    "employee_id" uuid NOT NULL,
    "department_id" uuid NOT NULL,
    -- Null for a department that has no Cost Center yet: the amount is then the line "not allocated to a Cost Center".
    "cost_center_id" uuid,
    "month" date NOT NULL,
    "days" smallint NOT NULL,
    "days_in_month" smallint NOT NULL,
    "monthly_price_minor" bigint NOT NULL,
    "amount_minor" bigint NOT NULL,
    "commitment_id" uuid,
    "applied_minor" bigint NOT NULL DEFAULT 0,
    "computed_at" timestamptz(3) NOT NULL,
    CONSTRAINT "seat_month_charges_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "seat_month_charges_month_check" CHECK (EXTRACT(day FROM "month") = 1),
    CONSTRAINT "seat_month_charges_days_check" CHECK (
        "days_in_month" BETWEEN 28 AND 31 AND "days" BETWEEN 1 AND "days_in_month"
    ),
    CONSTRAINT "seat_month_charges_amount_check" CHECK ("monthly_price_minor" >= 0 AND "amount_minor" >= 0),
    -- What took a commitment down is part of the amount, and only a seat that has a commitment takes one down.
    CONSTRAINT "seat_month_charges_applied_check" CHECK (
        "applied_minor" BETWEEN 0 AND "amount_minor" AND ("applied_minor" = 0 OR "commitment_id" IS NOT NULL)
    )
);

ALTER TABLE "seat_month_charges" DROP CONSTRAINT IF EXISTS "seat_month_charges_commitment_id_fkey";
ALTER TABLE "seat_month_charges" ADD CONSTRAINT "seat_month_charges_commitment_id_fkey"
    FOREIGN KEY ("commitment_id") REFERENCES "budget_commitments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- One row for a seat, a month and a department: a department that held the person twice in a month is one row.
CREATE UNIQUE INDEX IF NOT EXISTS "seat_month_charges_assignment_id_month_department_id_key"
    ON "seat_month_charges" ("assignment_id", "month", "department_id");
CREATE INDEX IF NOT EXISTS "seat_month_charges_subscription_id_month_idx" ON "seat_month_charges" ("subscription_id", "month");
CREATE INDEX IF NOT EXISTS "seat_month_charges_cost_center_id_month_idx" ON "seat_month_charges" ("cost_center_id", "month");
CREATE INDEX IF NOT EXISTS "seat_month_charges_commitment_id_idx" ON "seat_month_charges" ("commitment_id");
