-- What the spending approver decided on the spend step, and what the other requests that wait cost (US-06-01).

-- AlterTable: what the others that wait to be decided cost in the year; none for a check made before this was kept, and none
-- for a year that has ended, which is not judged.
ALTER TABLE "request_budget_check_years" ADD COLUMN "pending_minor" BIGINT;
ALTER TABLE "request_budget_check_years"
    ADD CONSTRAINT "request_budget_check_years_pending_check" CHECK (
        "pending_minor" IS NULL OR ("pending_minor" >= 0 AND "code" IS NOT NULL)
    );

-- CreateTable
CREATE TABLE "spend_decisions" (
    "step_id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "check_id" UUID,
    "decision" "ApprovalDecision" NOT NULL,
    "override_reason" TEXT,
    "override_years" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "decided_by_employee_id" UUID NOT NULL,
    "decided_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "spend_decisions_pkey" PRIMARY KEY ("step_id"),
    -- An approval keeps the snapshot it was made on, and a refusal accepts no exception.
    CONSTRAINT "spend_decisions_shape_check" CHECK (
        ("decision" = 'APPROVED' AND "check_id" IS NOT NULL)
        OR ("decision" = 'REJECTED' AND COALESCE(cardinality("override_years"), 0) = 0 AND "override_reason" IS NULL)
    ),
    -- An override says why, and for which years; without one there is neither.
    CONSTRAINT "spend_decisions_override_check" CHECK (
        (COALESCE(cardinality("override_years"), 0) = 0 AND "override_reason" IS NULL)
        OR (COALESCE(cardinality("override_years"), 0) > 0 AND "override_reason" IS NOT NULL AND btrim("override_reason") <> '')
    )
);

-- CreateIndex
CREATE INDEX "spend_decisions_request_id_idx" ON "spend_decisions"("request_id");

-- AddForeignKey
ALTER TABLE "spend_decisions" ADD CONSTRAINT "spend_decisions_step_id_fkey" FOREIGN KEY ("step_id") REFERENCES "access_request_steps"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spend_decisions" ADD CONSTRAINT "spend_decisions_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "access_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spend_decisions" ADD CONSTRAINT "spend_decisions_check_id_fkey" FOREIGN KEY ("check_id") REFERENCES "request_budget_checks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spend_decisions" ADD CONSTRAINT "spend_decisions_decided_by_employee_id_fkey" FOREIGN KEY ("decided_by_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- INV-05: what the approver decided and on which snapshot is append-only (the function is the one of the checks and reviews).
CREATE TRIGGER spend_decisions_no_update_delete
  BEFORE UPDATE OR DELETE ON spend_decisions
  FOR EACH ROW EXECUTE FUNCTION request_budget_records_reject_change();

CREATE TRIGGER spend_decisions_no_truncate
  BEFORE TRUNCATE ON spend_decisions
  FOR EACH STATEMENT EXECUTE FUNCTION request_budget_records_reject_change();
