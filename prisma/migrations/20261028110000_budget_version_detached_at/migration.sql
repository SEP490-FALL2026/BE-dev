-- Compatibility step of the budget version lifecycle (`g0-g6-final-business-baseline-remediation`, Task 4.7a, F36, F63, spec K and L.10,
-- review `P03-RV-03`): a draft version of a proposal that is withdrawn or given back is marked as detached from it, in the transaction of
-- that move, so that the release after this one finds the marker already written. Only a nullable column is added: no CHECK, no change to
-- the index of the version that is in flight (`budget_versions_in_flight_key`), no backfill. The `7c28e75` application never names the
-- column, and nothing in this release reads it back; the constraints and the wire that use it belong to the release after this one,
-- which also gives a first value to the drafts of the proposals that were withdrawn or given back before this migration.

ALTER TABLE "budget_versions" ADD COLUMN "detached_at" TIMESTAMPTZ(3);
