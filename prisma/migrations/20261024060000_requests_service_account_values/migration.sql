-- The kind of request that asks for a service account after the installation (US-05-21). A value added to an enum cannot be
-- used in the transaction that adds it, so the table, the constraints and the rules that use this value come in the next
-- migration. Like every added value it cannot be taken away again (DB-05).

ALTER TYPE "AccessRequestType" ADD VALUE 'SERVICE_ACCOUNT';
