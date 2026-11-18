-- Subscription owner department, expansion step (g0-g6-final-business-baseline-remediation, Task 1.2a; F02, P03-D03 = A;
-- reviews P03-RV-01 and P03-RV-02). This migration only ADDS. H7 runs `migrate deploy` before it recreates `api` and
-- `worker`, and recovers the previous image after a failed deploy, so the application of the previous release (which sends
-- no owner department) must keep creating, updating and reading subscriptions on this schema: there is no trigger, CHECK or
-- NOT NULL on `subscriptions` here. The rules that make the department required and unchangeable (NOT NULL,
-- `subscriptions_owner_immutable`, `license_assignments_owner_department_guard`) belong to migration (B), the first
-- migration of the final release, which applies only after every existing subscription has a recorded assignment.

-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN "owner_department_id" UUID;

-- CreateTable
-- The basis on which an operator gave an existing subscription its owner department (QĐ-89e): one row per subscription,
-- added to and never changed, kept as the evidence after (B) copies the department into the subscription.
CREATE TABLE "subscription_owner_assignments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "department_id" UUID NOT NULL,
    "basis_reference" TEXT NOT NULL,
    "operator_ref" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "assigned_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_owner_assignments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "subscription_owner_assignments_basis_length" CHECK (char_length(btrim("basis_reference")) BETWEEN 2 AND 200),
    CONSTRAINT "subscription_owner_assignments_environment_known" CHECK ("environment" IN ('LOCAL_TEST', 'SHARED'))
);

-- CreateIndex
CREATE INDEX "subscriptions_owner_department_id_idx" ON "subscriptions"("owner_department_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_owner_assignments_subscription_id_key" ON "subscription_owner_assignments"("subscription_id");

-- CreateIndex
CREATE INDEX "subscription_owner_assignments_department_id_idx" ON "subscription_owner_assignments"("department_id");

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_owner_department_id_fkey"
    FOREIGN KEY ("owner_department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_owner_assignments" ADD CONSTRAINT "subscription_owner_assignments_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_owner_assignments" ADD CONSTRAINT "subscription_owner_assignments_subscription_id_fkey"
    FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_owner_assignments" ADD CONSTRAINT "subscription_owner_assignments_department_id_fkey"
    FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The record is evidence: nothing rewrites or removes a row, whoever holds the privilege (the owner role included).
CREATE FUNCTION subscription_owner_assignments_reject_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'subscription_owner_assignments is append-only (% rejected)', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER subscription_owner_assignments_no_update_delete
  BEFORE UPDATE OR DELETE ON "subscription_owner_assignments"
  FOR EACH ROW EXECUTE FUNCTION subscription_owner_assignments_reject_change();

CREATE TRIGGER subscription_owner_assignments_no_truncate
  BEFORE TRUNCATE ON "subscription_owner_assignments"
  FOR EACH STATEMENT EXECUTE FUNCTION subscription_owner_assignments_reject_change();

-- A subscription that already has its owner department needs no assignment: the row would record a basis for nothing,
-- and (B) would have two sources to reconcile. The check reads the subscription under a share lock so that setting the
-- department cannot slip in between the check and the insert.
CREATE FUNCTION subscription_owner_assignments_require_unowned() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1 FROM "subscriptions" WHERE "id" = NEW."subscription_id" AND "owner_department_id" IS NOT NULL FOR SHARE;
  IF FOUND THEN
    RAISE EXCEPTION 'the subscription already has an owner department'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'subscription_owner_assignments_unowned_only';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER subscription_owner_assignments_unowned_only
  BEFORE INSERT ON "subscription_owner_assignments"
  FOR EACH ROW EXECUTE FUNCTION subscription_owner_assignments_require_unowned();
