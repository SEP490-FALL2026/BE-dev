-- The reminders of a step or of the queue of the head that waited too long (US-05-09, US-05-10, US-06-02 AC-3): one for each
-- subject on each working day, with whom it was sent to and why. Append-only: a reminder is a fact that was sent, and nothing
-- edits or deletes it. Nothing here changes a step, a request or a decision.

-- CreateEnum
CREATE TYPE "SlaSubjectKind" AS ENUM ('STEP', 'SPEND_QUEUE');

-- CreateEnum
CREATE TYPE "SlaReminderRole" AS ENUM ('HOLDER', 'SUPERIOR', 'FINANCE_QUESTION', 'SUPER_ADMIN');

-- CreateTable
CREATE TABLE "step_sla_reminders" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "subject_kind" "SlaSubjectKind" NOT NULL,
    "subject_id" UUID NOT NULL,
    "step_kind" "AccessRequestStepKind",
    "business_date" DATE NOT NULL,
    "sequence" INTEGER NOT NULL,
    "holder_employee_id" UUID,
    "due_at" TIMESTAMPTZ(3) NOT NULL,
    "age_working_days" INTEGER NOT NULL,
    "overdue_working_days" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "step_sla_reminders_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "step_sla_reminders_sequence_check" CHECK ("sequence" >= 1),
    CONSTRAINT "step_sla_reminders_age_check" CHECK ("age_working_days" >= 0 AND "overdue_working_days" >= 0),
    -- A step reminder names the kind of step, a reminder of the queue names none.
    CONSTRAINT "step_sla_reminders_kind_check" CHECK (("subject_kind" = 'STEP') = ("step_kind" IS NOT NULL))
);

-- CreateTable
CREATE TABLE "step_sla_reminder_recipients" (
    "reminder_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "role" "SlaReminderRole" NOT NULL,

    CONSTRAINT "step_sla_reminder_recipients_pkey" PRIMARY KEY ("reminder_id", "employee_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "step_sla_reminders_subject_kind_subject_id_business_date_key" ON "step_sla_reminders"("subject_kind", "subject_id", "business_date");

-- CreateIndex
CREATE UNIQUE INDEX "step_sla_reminders_subject_kind_subject_id_sequence_key" ON "step_sla_reminders"("subject_kind", "subject_id", "sequence");

-- CreateIndex
CREATE INDEX "step_sla_reminders_request_id_created_at_idx" ON "step_sla_reminders"("request_id", "created_at");

-- CreateIndex
CREATE INDEX "step_sla_reminders_holder_employee_id_business_date_idx" ON "step_sla_reminders"("holder_employee_id", "business_date");

-- CreateIndex
CREATE INDEX "step_sla_reminder_recipients_employee_id_idx" ON "step_sla_reminder_recipients"("employee_id");

-- AddForeignKey
ALTER TABLE "step_sla_reminders" ADD CONSTRAINT "step_sla_reminders_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "step_sla_reminders" ADD CONSTRAINT "step_sla_reminders_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "access_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "step_sla_reminders" ADD CONSTRAINT "step_sla_reminders_holder_employee_id_fkey" FOREIGN KEY ("holder_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "step_sla_reminder_recipients" ADD CONSTRAINT "step_sla_reminder_recipients_reminder_id_fkey" FOREIGN KEY ("reminder_id") REFERENCES "step_sla_reminders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "step_sla_reminder_recipients" ADD CONSTRAINT "step_sla_reminder_recipients_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A reminder is a fact that was sent: nothing edits or deletes it, so no code path, including raw SQL from another module, can
-- make a late step look as if nobody was told.
CREATE FUNCTION step_sla_reminders_reject_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only (% rejected)', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER step_sla_reminders_no_update_delete
  BEFORE UPDATE OR DELETE ON "step_sla_reminders"
  FOR EACH ROW EXECUTE FUNCTION step_sla_reminders_reject_change();

CREATE TRIGGER step_sla_reminders_no_truncate
  BEFORE TRUNCATE ON "step_sla_reminders"
  FOR EACH STATEMENT EXECUTE FUNCTION step_sla_reminders_reject_change();

CREATE TRIGGER step_sla_reminder_recipients_no_update_delete
  BEFORE UPDATE OR DELETE ON "step_sla_reminder_recipients"
  FOR EACH ROW EXECUTE FUNCTION step_sla_reminders_reject_change();

CREATE TRIGGER step_sla_reminder_recipients_no_truncate
  BEFORE TRUNCATE ON "step_sla_reminder_recipients"
  FOR EACH STATEMENT EXECUTE FUNCTION step_sla_reminders_reject_change();
