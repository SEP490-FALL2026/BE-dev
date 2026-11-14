-- MF-2 and MF-3 (QĐ-110, QĐ-111): the enum values the later migrations and the code name. A value of an enum cannot be used in the
-- transaction that adds it, so nothing here uses them; the constraints, the data and the code that name them come after. ADD VALUE cannot
-- be rolled back (DB-05): a release before this one fails on a row that holds one of these values.
-- The seat ends because its holder was moved to another department and the grace of five working days ran out (QĐ-110p).
ALTER TYPE "RevocationSource" ADD VALUE IF NOT EXISTS 'TRANSFER';
-- The commitment of a seat the holder took to another department goes back on the day the transfer takes effect (QĐ-111bg).
ALTER TYPE "CommitmentReleaseReason" ADD VALUE IF NOT EXISTS 'TRANSFER_EFFECTIVE';
-- A service-account seat turned into the personal seat of an IT Admin flagged as a machine account (QĐ-110m, R-9).
ALTER TYPE "AssignmentSource" ADD VALUE IF NOT EXISTS 'MACHINE_ACCOUNT_CONVERSION';
-- What the system and the IT Admin write on an offboarding case now (QĐ-110b, QĐ-110e, QĐ-110j, B-1).
ALTER TYPE "OffboardingChangeKind" ADD VALUE IF NOT EXISTS 'ACCESS_BLOCKED';
ALTER TYPE "OffboardingChangeKind" ADD VALUE IF NOT EXISTS 'REVOCATIONS_WITHDRAWN';
ALTER TYPE "OffboardingChangeKind" ADD VALUE IF NOT EXISTS 'IT_ADMIN_HANDED_OVER';
ALTER TYPE "OffboardingChangeKind" ADD VALUE IF NOT EXISTS 'CLOSED_BY_SYSTEM';
ALTER TYPE "OffboardingChangeKind" ADD VALUE IF NOT EXISTS 'MAILBOX_LOCKED';
