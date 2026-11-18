-- MF-2 (QĐ-110b, QĐ-110d): the sweeper of the block moment announces, once for a case, that the access of the person is blocked: it writes
-- the audit event, ends the registrations of the machines, closes the open requests, tells the Super Admin and the IT Admin, and sets this column
-- in the same transaction. The column is what keeps it from telling twice, however many instances run. Expand only: nullable, nothing dropped.
-- Safe to run twice: the column is added if absent and the check is replaced.
--
-- No case is marked here: a departure that is open when this release starts is announced once by the first pass, so its open requests are
-- closed as the rule says and the IT Admin is told what is left to do; a closed or cancelled case is never picked up.

ALTER TABLE "offboarding_cases" ADD COLUMN IF NOT EXISTS "block_announced_at" TIMESTAMPTZ(3);

-- The log of a case may now hold one line that no account and no ticket wrote: the system blocking the access at the block moment. Every
-- other kind is still written by exactly one of the two. Each column is asked on its own: a CHECK passes on NULL.
ALTER TABLE "offboarding_case_changes" DROP CONSTRAINT IF EXISTS "offboarding_case_changes_changed_by_one";
ALTER TABLE "offboarding_case_changes" ADD CONSTRAINT "offboarding_case_changes_changed_by_one" CHECK (
    num_nonnulls("changed_by_app_user_id", "changed_by_ticket_id") = 1
    OR ("kind" = 'ACCESS_BLOCKED' AND "changed_by_app_user_id" IS NULL AND "changed_by_ticket_id" IS NULL)
);
