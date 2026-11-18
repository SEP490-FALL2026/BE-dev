-- The IT task that extends a right after its renewal was approved (BR-MF1-08d, QĐ-103 Q-03 answered: the IT Admin extends it).
-- A value of an enum cannot be used in the transaction that adds it, so the constraints that name it come in the next migration.
ALTER TYPE "ProvisioningTaskKind" ADD VALUE IF NOT EXISTS 'EXTEND';
