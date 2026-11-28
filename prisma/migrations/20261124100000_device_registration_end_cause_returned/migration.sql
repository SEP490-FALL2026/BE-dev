-- The value that says a machine went back to the store (redesign wave 2). It is added alone, in its own migration, because a value added to
-- an enum cannot be used in the transaction that adds it. Nothing in the next migrations names it.
-- Not reversible: PostgreSQL cannot drop a value from an enum (DB-05: roll forward, never down).
ALTER TYPE "DeviceRegistrationEndCause" ADD VALUE 'RETURNED';
