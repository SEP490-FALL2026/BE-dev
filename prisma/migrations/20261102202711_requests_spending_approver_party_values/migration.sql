-- QĐ-93k(1) (`qd93-remove-fallback-substitute-approvers`, Task 1): why a request, or a line of a request for a group, was closed because
-- the spending approver is one of its parties (`QĐ-93d`(2)): the conversion command closes the requests that were made before the rule.
-- Only `ADD VALUE`: PostgreSQL does not let a value be used in the transaction that adds it, so the constraints that name it are the next
-- migration (`_requests_spending_approver_party_cancellation`). The lines of a request share this enum (`_requests_line_cancellation`).
-- A value cannot be taken back (`DB-05`); one that nothing uses is harmless.
ALTER TYPE "AccessRequestCancelCause" ADD VALUE IF NOT EXISTS 'SPENDING_APPROVER_PARTY';
