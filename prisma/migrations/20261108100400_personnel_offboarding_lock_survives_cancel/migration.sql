-- The lock of the company account is something that happened (QĐ-77i): a handover cancelled after the IT Admin wrote it keeps it.
-- (H1) the CHECK no longer ties the lock to a state; it keeps the lock whole and written by a person.
ALTER TABLE "offboarding_cases" DROP CONSTRAINT "offboarding_cases_account_lock_check";
ALTER TABLE "offboarding_cases" ADD CONSTRAINT "offboarding_cases_account_lock_check" CHECK (
  (("account_lock_at" IS NULL) = ("account_lock_by_app_user_id" IS NULL))
  AND (("account_lock_at" IS NULL) = ("account_lock_note" IS NULL))
  AND ("account_lock_note" IS NULL OR btrim("account_lock_note") <> '')
);

-- (M3) the lock is written once whatever the state: the guard checked it only for a case that had left. The function is rewritten from its
-- current definition, and the migration stops if the line it extends is not there exactly once.
DO $$
DECLARE
    old_definition TEXT;
    new_definition TEXT;
    anchor TEXT := 'IF OLD."state" = ''LEFT'' THEN';
BEGIN
    old_definition := pg_get_functiondef(to_regproc('offboarding_cases_guard'));
    IF old_definition IS NULL
       OR (length(old_definition) - length(replace(old_definition, anchor, ''))) / length(anchor) <> 1 THEN
        RAISE EXCEPTION 'offboarding_cases_guard is not in the shape this migration extends';
    END IF;
    new_definition := replace(old_definition, anchor,
        'IF OLD."account_lock_at" IS NOT NULL
       AND (NEW."account_lock_at" IS DISTINCT FROM OLD."account_lock_at"
            OR NEW."account_lock_by_app_user_id" IS DISTINCT FROM OLD."account_lock_by_app_user_id"
            OR NEW."account_lock_note" IS DISTINCT FROM OLD."account_lock_note") THEN
      RAISE EXCEPTION ''the lock of the account is written once''
        USING ERRCODE = ''object_not_in_prerequisite_state'';
    END IF;
  ' || anchor);
    EXECUTE new_definition;
END
$$;

-- (L4) the mode is chosen by the writer, never filled in: the default was only there to backfill the old rows.
ALTER TABLE "offboarding_cases" ALTER COLUMN "access_block_mode" DROP DEFAULT;
