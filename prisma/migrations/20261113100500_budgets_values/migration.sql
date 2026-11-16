-- BG-2 (QĐ-111bb, QĐ-111ag): where a version came from gets two values, only added: a department that submitted no BM-10 (Finance builds the version from the baseline,
-- BASELINE_NO_PROPOSAL; BASELINE_NO_HEAD stays for the versions written before), and an adjustment of the budget in the year (used from AD-1). Nothing uses them in this migration.
ALTER TYPE "BudgetVersionOrigin" ADD VALUE IF NOT EXISTS 'BASELINE_NO_PROPOSAL';
ALTER TYPE "BudgetVersionOrigin" ADD VALUE IF NOT EXISTS 'ADJUSTMENT';
