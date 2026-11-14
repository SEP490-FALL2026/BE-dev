-- RQ-2 (QĐ-111i, R-38, FR-2.8, INV-07, expand): the day the contract of a person with a term ends. A request for a contractor, a freelancer or an
-- intern gives its time of use in months; a term that would run past this day is cut at it (the person is not refused), and each month that has
-- begun counts. The column is read by the requests when they work out a term, and by no one else. Null: no contract end is known, nothing is cut.
-- Nothing is dropped and no row changes; safe to run twice.

ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "contract_ends_on" DATE;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employees_contract_ends_on_check') THEN
        ALTER TABLE "employees"
            ADD CONSTRAINT "employees_contract_ends_on_check" CHECK ("contract_ends_on" IS NULL OR "contract_ends_on" >= "hire_date");
    END IF;
END
$$;
