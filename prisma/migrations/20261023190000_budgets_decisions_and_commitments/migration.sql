-- The decision of the spending approver on a version of a budget, kept as an electronic record that is never changed, and
-- the commitment a request holds against the budget of a Cost Center and a year, attached to the current version when
-- there is one and waiting unattached until one is approved (US-06-11, US-06-07). Only what attaching needs is here: the
-- slices that create and release commitments extend the table.

-- CreateEnum
CREATE TYPE "BudgetDecision" AS ENUM ('APPROVED', 'REJECTED', 'CHANGES_REQUESTED');

-- CreateEnum
CREATE TYPE "CommitmentState" AS ENUM ('HELD', 'RELEASED', 'EXPENSED');

-- CreateTable
CREATE TABLE "budget_version_decisions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "version_id" UUID NOT NULL,
    "decision" "BudgetDecision" NOT NULL,
    "decided_by_employee_id" UUID NOT NULL,
    "decider_role" TEXT NOT NULL DEFAULT 'SPENDING_APPROVER',
    "reason" TEXT,
    "total_minor" BIGINT NOT NULL,
    "previous_total_minor" BIGINT,
    "currency" CHAR(3) NOT NULL,
    "decided_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "budget_version_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_commitments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "cost_center_id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "state" "CommitmentState" NOT NULL DEFAULT 'HELD',
    "unattached_reason" TEXT,
    "attached_version_id" UUID,
    "attached_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "budget_commitments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "budget_version_decisions_version_id_decided_at_idx" ON "budget_version_decisions"("version_id", "decided_at");

-- CreateIndex
CREATE INDEX "budget_commitments_cost_center_id_year_state_idx" ON "budget_commitments"("cost_center_id", "year", "state");

-- CreateIndex
CREATE UNIQUE INDEX "budget_commitments_request_id_year_key" ON "budget_commitments"("request_id", "year");

-- AddForeignKey
ALTER TABLE "budget_version_decisions" ADD CONSTRAINT "budget_version_decisions_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "budget_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_commitments" ADD CONSTRAINT "budget_commitments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_commitments" ADD CONSTRAINT "budget_commitments_cost_center_id_fkey" FOREIGN KEY ("cost_center_id") REFERENCES "cost_centers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_commitments" ADD CONSTRAINT "budget_commitments_currency_fkey" FOREIGN KEY ("currency") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_commitments" ADD CONSTRAINT "budget_commitments_attached_version_id_fkey" FOREIGN KEY ("attached_version_id") REFERENCES "budget_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Constraints Prisma cannot express (ADR-0005).
ALTER TABLE "budget_version_decisions"
    ADD CONSTRAINT "budget_version_decisions_role_check" CHECK ("decider_role" = 'SPENDING_APPROVER'),
    ADD CONSTRAINT "budget_version_decisions_total_check" CHECK (
        "total_minor" >= 0 AND ("previous_total_minor" IS NULL OR "previous_total_minor" >= 0)),
    -- A refusal, and a request to look again, give their reason; an approval has none (US-06-11 AC-3, AC-4).
    ADD CONSTRAINT "budget_version_decisions_reason_check" CHECK (
        ("decision" = 'APPROVED' AND "reason" IS NULL)
        OR ("decision" <> 'APPROVED' AND "reason" IS NOT NULL AND btrim("reason") <> ''));

-- INV-05: the record of a decision is append-only, so no code path, including raw SQL from another module, can rewrite it.
CREATE FUNCTION budget_version_decisions_reject_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'budget_version_decisions is append-only (% rejected)', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER budget_version_decisions_no_update_delete
  BEFORE UPDATE OR DELETE ON budget_version_decisions
  FOR EACH ROW EXECUTE FUNCTION budget_version_decisions_reject_change();

CREATE TRIGGER budget_version_decisions_no_truncate
  BEFORE TRUNCATE ON budget_version_decisions
  FOR EACH STATEMENT EXECUTE FUNCTION budget_version_decisions_reject_change();

ALTER TABLE "budget_commitments"
    ADD CONSTRAINT "budget_commitments_year_check" CHECK ("year" BETWEEN 2000 AND 2200),
    ADD CONSTRAINT "budget_commitments_amount_check" CHECK ("amount_minor" > 0),
    -- Attached to a version, with the time, or unattached with its reason: never half of each (US-06-07 AC-1, AC-3).
    ADD CONSTRAINT "budget_commitments_attachment_check" CHECK (
        ("attached_version_id" IS NOT NULL AND "attached_at" IS NOT NULL AND "unattached_reason" IS NULL)
        OR ("attached_version_id" IS NULL AND "attached_at" IS NULL
            AND "unattached_reason" IS NOT NULL AND "unattached_reason" = 'NO_BUDGET'));
