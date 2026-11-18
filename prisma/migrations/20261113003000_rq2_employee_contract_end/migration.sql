-- RQ-2 (QĐ-111i, R-38, FR-2.8, INV-07, expand): the last day of the contract of a person with a term (`contract_end_date`, the name the design of
-- `qd96-100-approved-end-date` gave it). A request for a contractor, a freelancer or an intern gives its time of use in months; a term that would
-- run past this day is cut at it (the person is not refused), and each month that has begun counts. The Super Admin writes it with the official
-- fields of the record. Null: no contract end is known, nothing is cut (a record that exists has none). Only a person with a term has one: for staff
-- it is empty. Nothing is dropped and no row changes (the column is new, so every row is null and satisfies both checks); safe to run twice.

ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "contract_end_date" DATE;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employees_contract_end_date_check') THEN
        ALTER TABLE "employees"
            ADD CONSTRAINT "employees_contract_end_date_check" CHECK ("contract_end_date" IS NULL OR "contract_end_date" >= "hire_date");
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employees_contract_end_staff_check') THEN
        ALTER TABLE "employees"
            ADD CONSTRAINT "employees_contract_end_staff_check" CHECK ("employment_type" <> 'STAFF' OR "contract_end_date" IS NULL);
    END IF;
END
$$;
