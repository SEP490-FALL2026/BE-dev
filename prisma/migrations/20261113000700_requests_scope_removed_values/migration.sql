-- QĐ-110m (X-SA.1b): why the system closes a request for a service account that was still open when service accounts left the scope. Nobody
-- closes it, so it is a cause of its own (like `SYSTEM_BENEFICIARY_LEFT`, `SYSTEM_BENEFICIARY_TRANSFERRED`) and the column of who closed it is empty
-- for it. Only `ADD VALUE`: PostgreSQL does not let a value be used in the transaction that adds it, so the check that names it is the next migration
-- (`_requests_scope_removed_cancellation`) and the rows that carry it the one after (`_licensing_service_accounts_converted`). A value cannot be
-- taken back (`DB-05`): a release before this one fails on a row that holds it.
ALTER TYPE "AccessRequestCancelCause" ADD VALUE IF NOT EXISTS 'SYSTEM_SCOPE_REMOVED';
