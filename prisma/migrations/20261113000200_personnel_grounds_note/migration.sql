-- The basis of a personnel event is one box of words (QĐ-110a, QĐ-111bd, R-32): it is kept in `grounds_reference`, and the type, the
-- issuer and the day of the old four-part basis are all there or all absent. What was written before stays as it is: it is whole.
-- Notice (`personnel_notices`) keeps its own form and is not touched. Each part is tested for NULL on its own: a NULL in a CHECK passes it.
ALTER TABLE "offboarding_cases"
    ALTER COLUMN "grounds_type" DROP NOT NULL,
    ALTER COLUMN "grounds_issuer" DROP NOT NULL,
    ALTER COLUMN "grounds_issued_on" DROP NOT NULL;
ALTER TABLE "offboarding_cases" DROP CONSTRAINT "offboarding_cases_grounds_check";
ALTER TABLE "offboarding_cases"
    ADD CONSTRAINT "offboarding_cases_grounds_check" CHECK (
        btrim("grounds_reference") <> '' AND (
            ("grounds_type" IS NULL AND "grounds_issuer" IS NULL AND "grounds_issued_on" IS NULL)
            OR ("grounds_type" IS NOT NULL AND btrim("grounds_type") <> ''
                AND "grounds_issuer" IS NOT NULL AND btrim("grounds_issuer") <> '' AND "grounds_issued_on" IS NOT NULL)));

ALTER TABLE "department_transfers"
    ALTER COLUMN "grounds_type" DROP NOT NULL,
    ALTER COLUMN "grounds_issuer" DROP NOT NULL,
    ALTER COLUMN "grounds_issued_on" DROP NOT NULL;
ALTER TABLE "department_transfers" DROP CONSTRAINT "department_transfers_grounds_check";
ALTER TABLE "department_transfers"
    ADD CONSTRAINT "department_transfers_grounds_check" CHECK (
        btrim("grounds_reference") <> '' AND (
            ("grounds_type" IS NULL AND "grounds_issuer" IS NULL AND "grounds_issued_on" IS NULL)
            OR ("grounds_type" IS NOT NULL AND btrim("grounds_type") <> ''
                AND "grounds_issuer" IS NOT NULL AND btrim("grounds_issuer") <> '' AND "grounds_issued_on" IS NOT NULL)));

ALTER TABLE "department_transfer_changes"
    ALTER COLUMN "grounds_type" DROP NOT NULL,
    ALTER COLUMN "grounds_issuer" DROP NOT NULL,
    ALTER COLUMN "grounds_issued_on" DROP NOT NULL;
ALTER TABLE "department_transfer_changes" DROP CONSTRAINT "department_transfer_changes_grounds_check";
ALTER TABLE "department_transfer_changes"
    ADD CONSTRAINT "department_transfer_changes_grounds_check" CHECK (
        btrim("grounds_reference") <> '' AND (
            ("grounds_type" IS NULL AND "grounds_issuer" IS NULL AND "grounds_issued_on" IS NULL)
            OR ("grounds_type" IS NOT NULL AND btrim("grounds_type") <> ''
                AND "grounds_issuer" IS NOT NULL AND btrim("grounds_issuer") <> '' AND "grounds_issued_on" IS NOT NULL)));

ALTER TABLE "employee_leaves"
    ALTER COLUMN "grounds_type" DROP NOT NULL,
    ALTER COLUMN "grounds_issuer" DROP NOT NULL,
    ALTER COLUMN "grounds_issued_on" DROP NOT NULL;
ALTER TABLE "employee_leaves" DROP CONSTRAINT "employee_leaves_grounds_check";
ALTER TABLE "employee_leaves"
    ADD CONSTRAINT "employee_leaves_grounds_check" CHECK (
        btrim("grounds_reference") <> '' AND (
            ("grounds_type" IS NULL AND "grounds_issuer" IS NULL AND "grounds_issued_on" IS NULL)
            OR ("grounds_type" IS NOT NULL AND btrim("grounds_type") <> ''
                AND "grounds_issuer" IS NOT NULL AND btrim("grounds_issuer") <> '' AND "grounds_issued_on" IS NOT NULL)));

-- A change of a leave has a basis, or none (a return on the approved day needs no new document): the box, with the other three parts
-- all there or all absent, or nothing at all. The kinds that need a basis now ask for the box, which every basis has.
ALTER TABLE "employee_leave_changes" DROP CONSTRAINT "employee_leave_changes_grounds_whole_check";
ALTER TABLE "employee_leave_changes"
    ADD CONSTRAINT "employee_leave_changes_grounds_whole_check" CHECK (
        ("grounds_type" IS NULL AND "grounds_reference" IS NULL AND "grounds_issuer" IS NULL AND "grounds_issued_on" IS NULL)
        OR ("grounds_reference" IS NOT NULL AND btrim("grounds_reference") <> '' AND (
            ("grounds_type" IS NULL AND "grounds_issuer" IS NULL AND "grounds_issued_on" IS NULL)
            OR ("grounds_type" IS NOT NULL AND btrim("grounds_type") <> ''
                AND "grounds_issuer" IS NOT NULL AND btrim("grounds_issuer") <> '' AND "grounds_issued_on" IS NOT NULL))));
ALTER TABLE "employee_leave_changes" DROP CONSTRAINT "employee_leave_changes_kind_check";
ALTER TABLE "employee_leave_changes"
    ADD CONSTRAINT "employee_leave_changes_kind_check" CHECK (
        CASE "kind"
            WHEN 'STARTED' THEN "new_return_on" IS NOT NULL AND "old_return_on" IS NULL AND "grounds_reference" IS NOT NULL
            WHEN 'RETURN_DATE_CHANGED' THEN "old_return_on" IS NOT NULL AND "new_return_on" IS NOT NULL
                AND "new_return_on" <> "old_return_on" AND "grounds_reference" IS NOT NULL
            WHEN 'RETURNED' THEN "returned_on" IS NOT NULL AND "on_schedule" IS NOT NULL
                AND ("on_schedule" OR "grounds_reference" IS NOT NULL)
            WHEN 'ENDED_FOR_DEPARTURE' THEN "returned_on" IS NOT NULL
            WHEN 'RESUMED' THEN "new_return_on" IS NOT NULL
        END);
