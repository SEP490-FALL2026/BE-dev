-- The reminder that a right which ends on a day is about to end (g6-time-limited-access, US-03-05 AC-1): at most one for each right,
-- end date and person told (the holder, the head of their department and the IT Admin in charge of it), written by the hourly pass
-- and never changed. The queue of the rights that have ended is not stored: it is read from the assignments.

-- CreateEnum
CREATE TYPE "ExpiryReminderAudience" AS ENUM ('EMPLOYEE', 'HEAD', 'IT_ADMIN');

-- CreateTable
CREATE TABLE "assignment_expiry_reminders" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "expected_end_date" DATE NOT NULL,
    "audience" "ExpiryReminderAudience" NOT NULL,
    "recipient_employee_id" UUID NOT NULL,
    "department_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assignment_expiry_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- One reminder for each right, end date and audience: a changed end date reminds again, the same one never does.
CREATE UNIQUE INDEX "assignment_expiry_reminders_assignment_id_expected_end_date_key"
    ON "assignment_expiry_reminders"("assignment_id", "expected_end_date", "audience");
CREATE INDEX "assignment_expiry_reminders_recipient_employee_id_created_a_idx"
    ON "assignment_expiry_reminders"("recipient_employee_id", "created_at" DESC, "id");
CREATE INDEX "assignment_expiry_reminders_created_at_id_idx"
    ON "assignment_expiry_reminders"("created_at" DESC, "id");

-- AddForeignKey
ALTER TABLE "assignment_expiry_reminders" ADD CONSTRAINT "assignment_expiry_reminders_assignment_id_fkey"
    FOREIGN KEY ("assignment_id") REFERENCES "license_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The reminders are facts: written once and never changed or deleted.
CREATE FUNCTION "assignment_expiry_reminder_guard"() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'An expiry reminder is never changed or deleted'
        USING ERRCODE = '55000', CONSTRAINT = 'assignment_expiry_reminder_kept';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "assignment_expiry_reminders_guard"
    BEFORE UPDATE OR DELETE ON "assignment_expiry_reminders"
    FOR EACH ROW EXECUTE FUNCTION "assignment_expiry_reminder_guard"();
