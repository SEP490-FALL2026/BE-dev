-- BG-2 (QĐ-111bb): a first version built from the baseline has no proposal behind it, whether it was written before as BASELINE_NO_HEAD or
-- now as BASELINE_NO_PROPOSAL (a department whose head submitted no BM-10 by the deadline, or a department made after it). The check only
-- widens: every row it held before still holds.
ALTER TABLE "budget_versions" DROP CONSTRAINT "budget_versions_source_check";
ALTER TABLE "budget_versions"
  ADD CONSTRAINT "budget_versions_source_check" CHECK (
    ("kind" = 'INITIAL' AND "based_on_version_id" IS NULL
      AND ("proposal_id" IS NULL) = ("origin" IN ('BASELINE_NO_HEAD', 'BASELINE_NO_PROPOSAL')))
    OR ("kind" = 'REVISION' AND "based_on_version_id" IS NOT NULL AND "proposal_id" IS NULL AND "origin" = 'PROPOSAL')
  );
