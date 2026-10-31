-- Compatibility step of the controlled procedure for a Super Admin who is the subject of an event (`g0-g6-final-business-baseline-
-- remediation`, Task 1.9a, spec L.2, L.10, review `P03-RV-03`, F19): the release after this one writes an event whose actor is a
-- procedure ticket, not an account, so the columns that name the account that recorded, changed or verified an event may then be
-- NULL. This release still writes its account in every one of them; it must only be able to READ a row that has none. Relaxing a
-- NOT NULL only: the CHECK constraints that tie a moment to its actor stay as they are (the release after this one replaces them
-- with the one-of-two form together with the ticket column, which does not exist yet). The columns that were already nullable
-- need nothing; they are listed so the ten of the spec are all accounted for.

ALTER TABLE "department_transfers" ALTER COLUMN "recorded_by_app_user_id" DROP NOT NULL;
-- "department_transfers"."cancelled_by_app_user_id" is nullable already.
ALTER TABLE "department_transfer_changes" ALTER COLUMN "changed_by_app_user_id" DROP NOT NULL;
ALTER TABLE "employee_leaves" ALTER COLUMN "started_by_app_user_id" DROP NOT NULL;
ALTER TABLE "employee_leave_changes" ALTER COLUMN "recorded_by_app_user_id" DROP NOT NULL;
ALTER TABLE "offboarding_cases" ALTER COLUMN "recorded_by_app_user_id" DROP NOT NULL;
-- "offboarding_cases"."cancelled_by_app_user_id" is nullable already.
ALTER TABLE "offboarding_case_changes" ALTER COLUMN "changed_by_app_user_id" DROP NOT NULL;
-- "personnel_notices"."handled_by_app_user_id" is nullable already.
ALTER TABLE "personnel_notice_verifications" ALTER COLUMN "verified_by_app_user_id" DROP NOT NULL;
