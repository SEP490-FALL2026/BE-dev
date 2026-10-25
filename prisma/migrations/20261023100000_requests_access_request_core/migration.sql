-- The requests context (C4, ADR-0015): the request for access, the people it is for and the steps that decide it.
-- Nothing here holds money, a budget or a commitment: the slices that need them add their own tables. The enums grow
-- with the slices (ALTER TYPE ... ADD VALUE); there is no down migration (DB-05).

-- CreateEnum
CREATE TYPE "AccessRequestType" AS ENUM ('GRANT');

-- CreateEnum
CREATE TYPE "AccessRequestBranch" AS ENUM ('INTERNAL_FREE', 'PAID_IN_CATALOG');

-- CreateEnum
CREATE TYPE "AccessRequestState" AS ENUM ('PENDING', 'WAITING_CONTROLLED');

-- CreateEnum
CREATE TYPE "AccessRequestStepKind" AS ENUM ('NEED');

-- CreateEnum
CREATE TYPE "AccessRequestStepState" AS ENUM ('PENDING', 'WAITING');

-- CreateTable
CREATE TABLE "access_requests" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "type" "AccessRequestType" NOT NULL DEFAULT 'GRANT',
    "branch" "AccessRequestBranch" NOT NULL,
    "state" "AccessRequestState" NOT NULL,
    "plan_id" UUID NOT NULL,
    "requester_employee_id" UUID NOT NULL,
    "department_id" UUID NOT NULL,
    "cost_center_id" UUID NOT NULL,
    "business_reason" TEXT NOT NULL,
    "term_months" INTEGER NOT NULL,
    "project_label" TEXT,
    "outside_standard_reason" TEXT,
    "policy" JSONB NOT NULL,
    "created_by_app_user_id" UUID NOT NULL,
    "submitted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "access_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "access_request_beneficiaries" (
    "request_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "access_request_beneficiaries_pkey" PRIMARY KEY ("request_id","employee_id")
);

-- CreateTable
CREATE TABLE "access_request_steps" (
    "id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "kind" "AccessRequestStepKind" NOT NULL,
    "sequence" INTEGER NOT NULL,
    "state" "AccessRequestStepState" NOT NULL,
    "assignee_employee_id" UUID,
    "routing_row" INTEGER NOT NULL,
    "waiting_reason" TEXT,
    "same_person_as_spend" BOOLEAN NOT NULL DEFAULT false,
    "sla_working_days" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assigned_at" TIMESTAMPTZ(3),

    CONSTRAINT "access_request_steps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "access_requests_requester_employee_id_submitted_at_idx" ON "access_requests"("requester_employee_id", "submitted_at");

-- CreateIndex
CREATE INDEX "access_requests_state_submitted_at_idx" ON "access_requests"("state", "submitted_at");

-- CreateIndex
CREATE INDEX "access_requests_plan_id_idx" ON "access_requests"("plan_id");

-- CreateIndex
CREATE INDEX "access_request_beneficiaries_employee_id_idx" ON "access_request_beneficiaries"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "access_request_beneficiaries_request_id_position_key" ON "access_request_beneficiaries"("request_id", "position");

-- CreateIndex
CREATE INDEX "access_request_steps_assignee_employee_id_state_idx" ON "access_request_steps"("assignee_employee_id", "state");

-- CreateIndex
CREATE UNIQUE INDEX "access_request_steps_request_id_sequence_key" ON "access_request_steps"("request_id", "sequence");

-- AddForeignKey
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_requester_employee_id_fkey" FOREIGN KEY ("requester_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_cost_center_id_fkey" FOREIGN KEY ("cost_center_id") REFERENCES "cost_centers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_request_beneficiaries" ADD CONSTRAINT "access_request_beneficiaries_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "access_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_request_beneficiaries" ADD CONSTRAINT "access_request_beneficiaries_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_request_steps" ADD CONSTRAINT "access_request_steps_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "access_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_request_steps" ADD CONSTRAINT "access_request_steps_assignee_employee_id_fkey" FOREIGN KEY ("assignee_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Constraints Prisma cannot express (ADR-0005).
ALTER TABLE "access_requests"
    ADD CONSTRAINT "access_requests_term_months_check" CHECK ("term_months" >= 1),
    ADD CONSTRAINT "access_requests_business_reason_check" CHECK (btrim("business_reason") <> ''),
    ADD CONSTRAINT "access_requests_project_label_check" CHECK ("project_label" IS NULL OR btrim("project_label") <> ''),
    ADD CONSTRAINT "access_requests_outside_standard_reason_check" CHECK ("outside_standard_reason" IS NULL OR btrim("outside_standard_reason") <> ''),
    ADD CONSTRAINT "access_requests_policy_check" CHECK (jsonb_typeof("policy") = 'object');

ALTER TABLE "access_request_beneficiaries"
    ADD CONSTRAINT "access_request_beneficiaries_position_check" CHECK ("position" >= 1);

-- A step is held by one person or waits for one, never both: a held step has the person and the time it was given, a
-- waiting step has neither and says why (US-05-03 AC-10, AC-5, AC-13).
ALTER TABLE "access_request_steps"
    ADD CONSTRAINT "access_request_steps_sequence_check" CHECK ("sequence" >= 1),
    ADD CONSTRAINT "access_request_steps_routing_row_check" CHECK ("routing_row" BETWEEN 1 AND 9),
    ADD CONSTRAINT "access_request_steps_sla_check" CHECK ("sla_working_days" >= 1),
    ADD CONSTRAINT "access_request_steps_holder_check" CHECK (
        ("state" = 'PENDING' AND "assignee_employee_id" IS NOT NULL AND "assigned_at" IS NOT NULL AND "waiting_reason" IS NULL)
        OR ("state" = 'WAITING' AND "assignee_employee_id" IS NULL AND "assigned_at" IS NULL AND "waiting_reason" IS NOT NULL)
    );
