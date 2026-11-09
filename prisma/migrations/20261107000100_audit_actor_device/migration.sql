-- A device is an actor of the Audit Trail: the collector that enrolled or rotated its own credential.
ALTER TYPE "AuditActorKind" ADD VALUE 'DEVICE';
