-- MF-2 (QĐ-100z, QĐ-110c): a handover cancelled after its last working day ends the registrations of the machines of the person with a
-- cause of its own, so the unlock that lifts the block never revives a credential. A value of an enum cannot be used in the transaction
-- that adds it, so nothing here uses it. ADD VALUE cannot be rolled back (DB-05): a release before this one fails on a registration that
-- holds this value.
ALTER TYPE "DeviceRegistrationEndCause" ADD VALUE IF NOT EXISTS 'DEPARTURE_BLOCKED';
