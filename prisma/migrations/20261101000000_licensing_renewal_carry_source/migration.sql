-- The source of a seat carried from a subscription period to the period that renews it (QĐ-35c, US-11-03 AC-2). A value of
-- an enum is added in a migration of its own: PostgreSQL does not let the transaction that adds it use it.
-- Not reversible: PostgreSQL cannot drop a value of an enum (DB-05: a fix is a roll-forward).
ALTER TYPE "AssignmentSource" ADD VALUE 'RENEWAL_CARRY';
