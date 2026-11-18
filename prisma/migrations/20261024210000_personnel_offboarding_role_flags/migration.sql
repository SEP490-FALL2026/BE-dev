-- The roles a person who leaves holds (g6-leaver-role-and-workspace-duties, US-03-04 AC-11 to AC-13, AC-27, AC-28): a snapshot written
-- when the departure is recorded, so the list can be filtered by it. What the case shows is read again when it is read; the column
-- decides nothing and stops nothing. The guard of offboarding_cases leaves it free to change while the case lives.

-- CreateEnum
CREATE TYPE "OffboardingRoleFlag" AS ENUM (
  'SUPER_ADMIN_HOLDER', 'FINANCE', 'SPENDING_APPROVER', 'SUBSTITUTE_APPROVER', 'FALLBACK_APPROVER',
  'IT_ADMIN_IN_CHARGE', 'DEPARTMENT_HEAD', 'WORKSPACE_OWNER'
);

-- AlterTable
ALTER TABLE "offboarding_cases"
  ADD COLUMN "role_flags" "OffboardingRoleFlag"[] NOT NULL DEFAULT ARRAY[]::"OffboardingRoleFlag"[];

-- CreateIndex (the filter of the list reads the flags of the cases that wait)
CREATE INDEX "offboarding_cases_role_flags_idx" ON "offboarding_cases" USING GIN ("role_flags");
