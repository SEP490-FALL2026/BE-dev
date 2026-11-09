-- QĐ-100h: a first version built from the baseline (nobody headed the department at the deadline) has no proposal behind it.
-- A first version has a proposal exactly when it did not come from the baseline; a revision still rests on the version it revises.
ALTER TABLE "budget_versions" DROP CONSTRAINT "budget_versions_source_check";
ALTER TABLE "budget_versions"
  ADD CONSTRAINT "budget_versions_source_check" CHECK (
    ("kind" = 'INITIAL' AND "based_on_version_id" IS NULL AND ("proposal_id" IS NULL) = ("origin" = 'BASELINE_NO_HEAD'))
    OR ("kind" = 'REVISION' AND "based_on_version_id" IS NOT NULL AND "proposal_id" IS NULL AND "origin" = 'PROPOSAL')
  );
