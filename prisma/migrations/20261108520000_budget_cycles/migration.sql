-- The budget cycle of a year (QĐ-103i, BR-MF4-01, BR-MF4-02, US-06-15): Finance opens it with the deadlines and the annual ceiling of the
-- software budget, divides the ceiling among the departments and into the shared-pool reserve, and publishes it. Only added to.

-- CreateTable
CREATE TABLE "budget_cycles" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "submission_deadline" DATE NOT NULL,
    "decision_deadline" DATE NOT NULL,
    "annual_ceiling_minor" BIGINT NOT NULL,
    -- Null until Finance enters it; an explicit zero is a valid reserve.
    "shared_pool_reserve_minor" BIGINT,
    "currency" CHAR(3) NOT NULL,
    "priorities" TEXT,
    "opened_by_employee_id" UUID NOT NULL,
    "opened_at" TIMESTAMPTZ(3) NOT NULL,
    -- Set while the cycle is published; cleared when Finance changes a ceiling (it is published again to be checked).
    "published_by_employee_id" UUID,
    "published_at" TIMESTAMPTZ(3),
    -- The first publication, never cleared: from then on a department head may submit the proposal of the year.
    "first_published_at" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "budget_cycles_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "budget_cycles_year_check" CHECK ("year" BETWEEN 2000 AND 2999),
    CONSTRAINT "budget_cycles_deadlines_check" CHECK ("decision_deadline" >= "submission_deadline"),
    CONSTRAINT "budget_cycles_amounts_check" CHECK (
        "annual_ceiling_minor" >= 0 AND ("shared_pool_reserve_minor" IS NULL OR "shared_pool_reserve_minor" >= 0)
    ),
    CONSTRAINT "budget_cycles_priorities_check" CHECK ("priorities" IS NULL OR char_length("priorities") <= 2000),
    CONSTRAINT "budget_cycles_published_check" CHECK (
        ("published_at" IS NULL) = ("published_by_employee_id" IS NULL)
        AND ("published_at" IS NULL OR "first_published_at" IS NOT NULL)
    )
);

-- CreateTable
CREATE TABLE "budget_department_ceilings" (
    "cycle_id" UUID NOT NULL,
    "department_id" UUID NOT NULL,
    "signed_commitments_minor" BIGINT NOT NULL,
    "planned_seats_minor" BIGINT NOT NULL,
    "priority_minor" BIGINT NOT NULL,
    "total_minor" BIGINT NOT NULL,
    -- The total the department head was told at the last publication; null before the first one.
    "published_total_minor" BIGINT,
    -- What the total rests on, from the base figures (QT 4.3: a ceiling comes with its explanation).
    "explanation" TEXT,

    CONSTRAINT "budget_department_ceilings_pkey" PRIMARY KEY ("cycle_id", "department_id"),
    CONSTRAINT "budget_department_ceilings_amounts_check" CHECK (
        "signed_commitments_minor" >= 0 AND "planned_seats_minor" >= 0 AND "priority_minor" >= 0
        AND ("published_total_minor" IS NULL OR "published_total_minor" >= 0)
    ),
    CONSTRAINT "budget_department_ceilings_explanation_check" CHECK ("explanation" IS NULL OR char_length("explanation") <= 2000),
    CONSTRAINT "budget_department_ceilings_total_check" CHECK (
        "total_minor" = "signed_commitments_minor" + "planned_seats_minor" + "priority_minor"
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "budget_cycles_organization_id_year_key" ON "budget_cycles"("organization_id", "year");

-- AddForeignKey
ALTER TABLE "budget_cycles" ADD CONSTRAINT "budget_cycles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "budget_cycles" ADD CONSTRAINT "budget_cycles_currency_fkey" FOREIGN KEY ("currency") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "budget_cycles" ADD CONSTRAINT "budget_cycles_opened_by_employee_id_fkey" FOREIGN KEY ("opened_by_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "budget_cycles" ADD CONSTRAINT "budget_cycles_published_by_employee_id_fkey" FOREIGN KEY ("published_by_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "budget_department_ceilings" ADD CONSTRAINT "budget_department_ceilings_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "budget_cycles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "budget_department_ceilings" ADD CONSTRAINT "budget_department_ceilings_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
