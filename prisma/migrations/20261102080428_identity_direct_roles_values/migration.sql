-- QĐ-93a (`qd93-direct-manager-spending-approver-roles`, Task 1): MANAGER and SPENDING_APPROVER become roles that are granted
-- directly, like IT_ADMIN and FINANCE, instead of being derived. Only `ADD VALUE`: PostgreSQL does not let a value be used in the
-- transaction that adds it, so the backfill and the constraints that name them are the next migration (`_identity_direct_roles`).
-- A value cannot be taken back (`DB-05`); one that nothing uses is harmless.
ALTER TYPE "AppRole" ADD VALUE IF NOT EXISTS 'MANAGER';
ALTER TYPE "AppRole" ADD VALUE IF NOT EXISTS 'SPENDING_APPROVER';
