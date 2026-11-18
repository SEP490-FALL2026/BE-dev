-- M15a (QĐ-98): the reserve of a version defaults to a share of the base. The share in force when the version was made and the reason
-- Finance gives for a different reserve are kept; a version made before this has neither, so none of them needs a reason.
ALTER TABLE budget_versions ADD COLUMN reserve_percent smallint;
ALTER TABLE budget_versions ADD COLUMN reserve_reason text;
ALTER TABLE budget_versions ADD CONSTRAINT budget_versions_reserve_percent_check
  CHECK (reserve_percent IS NULL OR reserve_percent BETWEEN 0 AND 100);

-- A commitment released for want of a budget is unattached for `NO_BUDGET`, or for `CARRY_FORWARD` once a carried-over amount is named.
ALTER TABLE budget_commitments DROP CONSTRAINT budget_commitments_attachment_check;
ALTER TABLE budget_commitments ADD CONSTRAINT budget_commitments_attachment_check CHECK (
  (attached_version_id IS NOT NULL AND attached_at IS NOT NULL AND unattached_reason IS NULL)
  OR (attached_version_id IS NULL AND attached_at IS NULL
      AND unattached_reason IS NOT NULL AND unattached_reason IN ('NO_BUDGET', 'CARRY_FORWARD')));
