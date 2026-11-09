-- The lock of the company account is written for a person the departure already blocks (QĐ-100q, S-11): a handover past its last working day
-- is HANDING_OVER, not LEFT. The lock is still written once, by a person; the case closes only when the person has left (offboarding_cases_closed_check).
ALTER TABLE "offboarding_cases" DROP CONSTRAINT "offboarding_cases_account_lock_check";
ALTER TABLE "offboarding_cases" ADD CONSTRAINT "offboarding_cases_account_lock_check" CHECK (
  (("account_lock_at" IS NULL) = ("account_lock_by_app_user_id" IS NULL))
  AND (("account_lock_at" IS NULL) = ("account_lock_note" IS NULL))
  AND ("account_lock_note" IS NULL OR btrim("account_lock_note") <> '')
  AND ("account_lock_at" IS NULL OR "state" IN ('HANDING_OVER', 'LEFT'))
);
