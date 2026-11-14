-- MF-2 MF2-G (QĐ-110e, B-1, P28): item (1b) of BM-08, the lock of the mailbox for good, is kept on the case, and the system closes the case itself.
-- Expand only: three nullable columns, nothing is dropped and nothing is backfilled (a case closed by an IT Admin before this release stays as it
-- is). Safe to run twice: the columns are added if absent and the checks and the guard are replaced.
--
-- (1b) is written by an IT Admin, or by the system when the IT Admin ticks the last step of the checklist of the last K1 revocation of the person
-- (then no account wrote it: `mailbox_lock_by_app_user_id` stays NULL). It is only written after (1a), the lock of the company account.
ALTER TABLE "offboarding_cases"
    ADD COLUMN IF NOT EXISTS "mailbox_lock_at" TIMESTAMPTZ(3),
    ADD COLUMN IF NOT EXISTS "mailbox_lock_by_app_user_id" UUID,
    ADD COLUMN IF NOT EXISTS "mailbox_lock_note" TEXT;

-- Each column is asked on its own: a CHECK passes on NULL.
ALTER TABLE "offboarding_cases" DROP CONSTRAINT IF EXISTS "offboarding_cases_mailbox_lock_check";
ALTER TABLE "offboarding_cases" ADD CONSTRAINT "offboarding_cases_mailbox_lock_check" CHECK (
    ("mailbox_lock_at" IS NOT NULL OR ("mailbox_lock_by_app_user_id" IS NULL AND "mailbox_lock_note" IS NULL))
    AND ("mailbox_lock_at" IS NULL OR "account_lock_at" IS NOT NULL)
    AND ("mailbox_lock_note" IS NULL OR btrim("mailbox_lock_note") <> '')
);

-- A case is closed by an IT Admin (a case closed before this release) or by the system, and a case the system closes has item (1b) written.
ALTER TABLE "offboarding_cases" DROP CONSTRAINT IF EXISTS "offboarding_cases_closed_check";
ALTER TABLE "offboarding_cases" ADD CONSTRAINT "offboarding_cases_closed_check" CHECK (
    ("closed_by_app_user_id" IS NULL OR "closed_at" IS NOT NULL)
    AND ("closed_at" IS NULL OR ("state" = 'LEFT' AND "account_lock_at" IS NOT NULL))
    AND ("closed_at" IS NULL OR "closed_by_app_user_id" IS NOT NULL OR "mailbox_lock_at" IS NOT NULL)
);

-- The log of a case may hold the lines that no account and no ticket wrote: the system blocking the access, the system recording (1b) and the
-- system closing the case. Every other kind is still written by exactly one of the two.
ALTER TABLE "offboarding_case_changes" DROP CONSTRAINT IF EXISTS "offboarding_case_changes_changed_by_one";
ALTER TABLE "offboarding_case_changes" ADD CONSTRAINT "offboarding_case_changes_changed_by_one" CHECK (
    num_nonnulls("changed_by_app_user_id", "changed_by_ticket_id") = 1
    OR (
        "kind" IN ('ACCESS_BLOCKED', 'MAILBOX_LOCKED', 'CLOSED_BY_SYSTEM')
        AND "changed_by_app_user_id" IS NULL
        AND "changed_by_ticket_id" IS NULL
    )
);

-- (1b) is written once, whatever the state, like the lock of the account (the guard checked only the lock of the account). The function is
-- rewritten from its current definition, and the migration stops if the line it extends is not there exactly once.
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
    IF position('the lock of the mailbox is written once' IN old_definition) > 0 THEN
        RETURN;
    END IF;
    new_definition := replace(old_definition, anchor,
        'IF OLD."mailbox_lock_at" IS NOT NULL
       AND (NEW."mailbox_lock_at" IS DISTINCT FROM OLD."mailbox_lock_at"
            OR NEW."mailbox_lock_by_app_user_id" IS DISTINCT FROM OLD."mailbox_lock_by_app_user_id"
            OR NEW."mailbox_lock_note" IS DISTINCT FROM OLD."mailbox_lock_note") THEN
      RAISE EXCEPTION ''the lock of the mailbox is written once''
        USING ERRCODE = ''object_not_in_prerequisite_state'';
    END IF;
  ' || anchor);
    EXECUTE new_definition;
END
$$;
