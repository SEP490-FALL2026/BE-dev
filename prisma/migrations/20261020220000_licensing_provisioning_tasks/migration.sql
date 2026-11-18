-- The queue of the work that makes a decision real (g4-provisioning-queue-manual, US-07-01, US-07-02): today the grant of a
-- seat, by hand or through a connector, in one table and one life. The assignment is the decision and holds the seat, so a
-- seat stays taken while a task is queued, in progress or failed (BR-10.4). A manual task completes only with a person's
-- evidence, and the database says so. The request is a value: the table of requests belongs to a later module.

-- CreateEnum
CREATE TYPE "ProvisioningTaskKind" AS ENUM ('GRANT');
CREATE TYPE "ProvisioningChannel" AS ENUM ('MANUAL', 'CONNECTOR');
CREATE TYPE "ProvisioningTaskStatus" AS ENUM ('QUEUED', 'IN_PROGRESS', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "provisioning_tasks" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "kind" "ProvisioningTaskKind" NOT NULL,
    "channel" "ProvisioningChannel" NOT NULL,
    "status" "ProvisioningTaskStatus" NOT NULL DEFAULT 'QUEUED',
    "request_id" UUID NOT NULL,
    "default_responsible_employee_id" UUID,
    "claimed_by_app_user_id" UUID,
    "claimed_at" TIMESTAMPTZ(3),
    "completed_by_app_user_id" UUID,
    "completed_at" TIMESTAMPTZ(3),
    "evidence" TEXT,
    "failed_by_app_user_id" UUID,
    "failed_at" TIMESTAMPTZ(3),
    "failure_reason" TEXT,
    "created_by_app_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provisioning_tasks_pkey" PRIMARY KEY ("id"),
    -- The status and the columns say the same thing: a task has a person who took it once it is in progress, a person
    -- and a note of evidence once it is completed, and a person and a reason once it has failed. Nothing else is set.
    CONSTRAINT "provisioning_tasks_status_columns" CHECK (
        ("status" = 'QUEUED'
            AND "claimed_by_app_user_id" IS NULL AND "claimed_at" IS NULL
            AND "completed_by_app_user_id" IS NULL AND "completed_at" IS NULL AND "evidence" IS NULL
            AND "failed_by_app_user_id" IS NULL AND "failed_at" IS NULL AND "failure_reason" IS NULL)
        OR ("status" = 'IN_PROGRESS'
            AND "claimed_by_app_user_id" IS NOT NULL AND "claimed_at" IS NOT NULL
            AND "completed_by_app_user_id" IS NULL AND "completed_at" IS NULL AND "evidence" IS NULL
            AND "failed_by_app_user_id" IS NULL AND "failed_at" IS NULL AND "failure_reason" IS NULL)
        OR ("status" = 'COMPLETED'
            AND "claimed_by_app_user_id" IS NOT NULL AND "claimed_at" IS NOT NULL
            AND "completed_by_app_user_id" IS NOT NULL AND "completed_at" IS NOT NULL
            AND "evidence" IS NOT NULL AND length(btrim("evidence")) > 0
            AND "failed_by_app_user_id" IS NULL AND "failed_at" IS NULL AND "failure_reason" IS NULL)
        OR ("status" = 'FAILED'
            AND "claimed_by_app_user_id" IS NOT NULL AND "claimed_at" IS NOT NULL
            AND "completed_by_app_user_id" IS NULL AND "completed_at" IS NULL AND "evidence" IS NULL
            AND "failed_by_app_user_id" IS NOT NULL AND "failed_at" IS NOT NULL
            AND "failure_reason" IS NOT NULL AND length(btrim("failure_reason")) > 0)
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "provisioning_tasks_assignment_id_kind_key" ON "provisioning_tasks"("assignment_id", "kind");
CREATE INDEX "provisioning_tasks_status_created_at_idx" ON "provisioning_tasks"("status", "created_at");
CREATE INDEX "provisioning_tasks_default_responsible_employee_id_idx"
    ON "provisioning_tasks"("default_responsible_employee_id");

-- AddForeignKey
ALTER TABLE "provisioning_tasks" ADD CONSTRAINT "provisioning_tasks_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "provisioning_tasks" ADD CONSTRAINT "provisioning_tasks_assignment_id_fkey"
    FOREIGN KEY ("assignment_id") REFERENCES "license_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "provisioning_tasks" ADD CONSTRAINT "provisioning_tasks_default_responsible_employee_id_fkey"
    FOREIGN KEY ("default_responsible_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A completed task is the record of work that was done: no writer changes it, and no task is ever deleted. (Failed tasks
-- will be decided on by the next item, so only completion is final here.)
CREATE FUNCTION "provisioning_task_guard"() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'A provisioning task is never deleted'
            USING ERRCODE = '55000', CONSTRAINT = 'provisioning_task_kept';
    END IF;
    IF OLD."status" = 'COMPLETED' THEN
        RAISE EXCEPTION 'A completed provisioning task is never changed'
            USING ERRCODE = '55000', CONSTRAINT = 'provisioning_task_completed';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "provisioning_tasks_guard"
    BEFORE UPDATE OR DELETE ON "provisioning_tasks"
    FOR EACH ROW EXECUTE FUNCTION "provisioning_task_guard"();
