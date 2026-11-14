-- QĐ-110d, QĐ-110o (X0.7): why the system closes a request, or a line of a request for a group, because the person it is for is gone: they
-- left (MF-2, the day access is blocked) or were moved to another department (MF-3, the day the transfer takes effect). Nobody closes it, so
-- these are causes of their own and not `BENEFICIARY_LEFT` / `BENEFICIARY_TRANSFERRED`, which are the IT Admin's.
-- Only `ADD VALUE`: PostgreSQL does not let a value be used in the transaction that adds it, so the constraints that name them are the next
-- migration (`_requests_beneficiary_gone_cancellation`). The lines of a request share this enum (`_requests_line_cancellation`). A value
-- cannot be taken back (`DB-05`): a release before this one fails on a row that holds one of them.
ALTER TYPE "AccessRequestCancelCause" ADD VALUE IF NOT EXISTS 'SYSTEM_BENEFICIARY_LEFT';
ALTER TYPE "AccessRequestCancelCause" ADD VALUE IF NOT EXISTS 'SYSTEM_BENEFICIARY_TRANSFERRED';
