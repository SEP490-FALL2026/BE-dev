-- PL-2.0 (QĐ-111ap, R-24): a decision can now be "returned". The need step, the spend step and the group lines record what a head or the
-- spending approver decided as APPROVED or REJECTED; a checklist with a "No" lets them refuse or send the request back to the person who
-- sent it, and the electronic approval record says which. Only the value is added here: the type is used in the migration after this one
-- (PostgreSQL does not allow a value added in a transaction to be used in the same transaction, D10). Safe to run twice.
ALTER TYPE "ApprovalDecision" ADD VALUE IF NOT EXISTS 'RETURNED';
