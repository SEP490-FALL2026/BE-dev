-- QĐ-100h, QĐ-100v: where a version came from (a proposal, or the baseline when nobody headed the department at the deadline) and why
-- Finance moved the base. Every version that exists came from a proposal.
CREATE TYPE "BudgetVersionOrigin" AS ENUM ('PROPOSAL', 'BASELINE_NO_HEAD');

ALTER TABLE "budget_versions" ADD COLUMN "origin" "BudgetVersionOrigin" NOT NULL DEFAULT 'PROPOSAL';
ALTER TABLE "budget_versions" ADD COLUMN "base_reason" TEXT;

ALTER TABLE "budget_versions"
  ADD CONSTRAINT "budget_versions_base_reason_check"
  CHECK ("base_reason" IS NULL OR (btrim("base_reason") <> '' AND char_length("base_reason") <= 1000));
