-- The electronic approval record of a decision, and the decided states of a step (US-05-04, US-01-12 AC-6).
-- A record is never changed or deleted (INV-05): the database refuses it, as it does for the audit trail.

-- CreateEnum
CREATE TYPE "ApprovalDecision" AS ENUM ('APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ApprovalDeciderRole" AS ENUM ('MANAGER', 'SPENDING_APPROVER', 'FALLBACK_APPROVER');

-- AlterTable
ALTER TABLE "access_request_steps" ADD COLUMN "decided_at" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "approval_records" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "step_id" UUID NOT NULL,
    "decision" "ApprovalDecision" NOT NULL,
    "decided_by_employee_id" UUID NOT NULL,
    "decider_role" "ApprovalDeciderRole" NOT NULL,
    "department_id" UUID NOT NULL,
    "reason" TEXT,
    "term_confirmation_reason" TEXT,
    "decided_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "approval_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "approval_records_step_id_key" ON "approval_records"("step_id");

-- CreateIndex
CREATE INDEX "approval_records_request_id_idx" ON "approval_records"("request_id");

-- AddForeignKey
ALTER TABLE "approval_records" ADD CONSTRAINT "approval_records_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_records" ADD CONSTRAINT "approval_records_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "access_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_records" ADD CONSTRAINT "approval_records_step_id_fkey" FOREIGN KEY ("step_id") REFERENCES "access_request_steps"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_records" ADD CONSTRAINT "approval_records_decided_by_employee_id_fkey" FOREIGN KEY ("decided_by_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_records" ADD CONSTRAINT "approval_records_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Constraints Prisma cannot express (ADR-0005).
-- A refusal gives its reason; a confirmation of a long term, when there is one, is not blank.
ALTER TABLE "approval_records"
    ADD CONSTRAINT "approval_records_reason_check" CHECK ("reason" IS NULL OR btrim("reason") <> ''),
    ADD CONSTRAINT "approval_records_refusal_reason_check" CHECK ("decision" <> 'REJECTED' OR "reason" IS NOT NULL),
    ADD CONSTRAINT "approval_records_term_confirmation_check" CHECK (
        "term_confirmation_reason" IS NULL
        OR ("decision" = 'APPROVED' AND btrim("term_confirmation_reason") <> '')
    );

-- INV-05: a record of a decision is append-only, so no code path, including raw SQL from another module, can rewrite it.
CREATE FUNCTION approval_records_reject_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'approval_records is append-only (% rejected)', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER approval_records_no_update_delete
  BEFORE UPDATE OR DELETE ON approval_records
  FOR EACH ROW EXECUTE FUNCTION approval_records_reject_change();

CREATE TRIGGER approval_records_no_truncate
  BEFORE TRUNCATE ON approval_records
  FOR EACH STATEMENT EXECUTE FUNCTION approval_records_reject_change();

-- A step is held by one person or waits for one, never both; a decided step keeps the person who held it and says when
-- it was decided, and a step not yet decided has no decision time (US-05-03 AC-10, US-05-04).
ALTER TABLE "access_request_steps" DROP CONSTRAINT "access_request_steps_holder_check";
ALTER TABLE "access_request_steps"
    ADD CONSTRAINT "access_request_steps_holder_check" CHECK (
        ("state" = 'PENDING' AND "assignee_employee_id" IS NOT NULL AND "assigned_at" IS NOT NULL AND "waiting_reason" IS NULL AND "decided_at" IS NULL)
        OR ("state" = 'WAITING' AND "assignee_employee_id" IS NULL AND "assigned_at" IS NULL AND "waiting_reason" IS NOT NULL AND "decided_at" IS NULL)
        OR ("state" IN ('APPROVED', 'REJECTED') AND "assignee_employee_id" IS NOT NULL AND "assigned_at" IS NOT NULL AND "waiting_reason" IS NULL AND "decided_at" IS NOT NULL)
    );
