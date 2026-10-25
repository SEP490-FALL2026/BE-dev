-- The move of a service account to another department with the confirmation of the receiving head, and the reminder that a service
-- account still has nobody to answer for it (g6-service-account-handover, US-03-08, QĐ-86c). A proposal is a record that waits and
-- touches no assignment; the confirmation writes the two assignments in its own transaction (code), and the rows here keep what
-- was proposed, who confirmed in which role and what came of it.

-- CreateEnum
CREATE TYPE "ServiceAccountMoveStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED');
CREATE TYPE "ServiceAccountMoveConfirmerRole" AS ENUM ('DEPARTMENT_HEAD', 'FALLBACK_APPROVER');

-- CreateTable
CREATE TABLE "service_account_moves" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "from_department_id" UUID NOT NULL,
    "to_department_id" UUID NOT NULL,
    "new_responsible_employee_id" UUID NOT NULL,
    "effective_from" DATE NOT NULL,
    "expected_end_date" DATE,
    "status" "ServiceAccountMoveStatus" NOT NULL DEFAULT 'PENDING',
    "proposed_by_app_user_id" UUID NOT NULL,
    "proposed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_by_employee_id" UUID,
    "confirmed_by_role" "ServiceAccountMoveConfirmerRole",
    "confirmed_at" TIMESTAMPTZ(3),
    "cancelled_by_app_user_id" UUID,
    "cancelled_at" TIMESTAMPTZ(3),
    "cancelled_reason" TEXT,
    "resulting_assignment_id" UUID,

    CONSTRAINT "service_account_moves_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "service_account_moves_other_department" CHECK ("from_department_id" <> "to_department_id"),
    -- The columns of a state come together: a waiting proposal has none of them, a confirmed one has the person, the role, the moment
    -- and the assignment it made, a cancelled one has who, when and why.
    CONSTRAINT "service_account_moves_state_together" CHECK (
        ("status" = 'PENDING'
            AND "confirmed_by_employee_id" IS NULL AND "confirmed_by_role" IS NULL AND "confirmed_at" IS NULL
            AND "resulting_assignment_id" IS NULL
            AND "cancelled_by_app_user_id" IS NULL AND "cancelled_at" IS NULL AND "cancelled_reason" IS NULL)
        OR ("status" = 'CONFIRMED'
            AND "confirmed_by_employee_id" IS NOT NULL AND "confirmed_by_role" IS NOT NULL AND "confirmed_at" IS NOT NULL
            AND "resulting_assignment_id" IS NOT NULL
            AND "cancelled_by_app_user_id" IS NULL AND "cancelled_at" IS NULL AND "cancelled_reason" IS NULL)
        OR ("status" = 'CANCELLED'
            AND "confirmed_by_employee_id" IS NULL AND "confirmed_by_role" IS NULL AND "confirmed_at" IS NULL
            AND "resulting_assignment_id" IS NULL
            AND "cancelled_by_app_user_id" IS NOT NULL AND "cancelled_at" IS NOT NULL AND "cancelled_reason" IS NOT NULL)
    ),
    CONSTRAINT "service_account_moves_reason_not_blank" CHECK ("cancelled_reason" IS NULL OR length(btrim("cancelled_reason")) > 0),
    CONSTRAINT "service_account_moves_end_after_start" CHECK ("expected_end_date" IS NULL OR "expected_end_date" >= "effective_from")
);

CREATE TABLE "service_account_duty_notices" (
    "id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "due_on" DATE NOT NULL,
    "noticed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_account_duty_notices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- One proposal waits for each assignment.
CREATE UNIQUE INDEX "service_account_moves_one_pending_per_assignment"
    ON "service_account_moves"("assignment_id") WHERE "status" = 'PENDING';
CREATE UNIQUE INDEX "service_account_moves_resulting_assignment_id_key" ON "service_account_moves"("resulting_assignment_id");
CREATE INDEX "service_account_moves_assignment_id_idx" ON "service_account_moves"("assignment_id");
CREATE INDEX "service_account_moves_to_department_id_status_idx" ON "service_account_moves"("to_department_id", "status");
CREATE INDEX "service_account_moves_effective_from_id_idx" ON "service_account_moves"("effective_from", "id");
CREATE UNIQUE INDEX "service_account_duty_notices_assignment_id_due_on_key"
    ON "service_account_duty_notices"("assignment_id", "due_on");

-- AddForeignKey
ALTER TABLE "service_account_moves" ADD CONSTRAINT "service_account_moves_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "service_account_moves" ADD CONSTRAINT "service_account_moves_assignment_id_fkey"
    FOREIGN KEY ("assignment_id") REFERENCES "license_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "service_account_moves" ADD CONSTRAINT "service_account_moves_from_department_id_fkey"
    FOREIGN KEY ("from_department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "service_account_moves" ADD CONSTRAINT "service_account_moves_to_department_id_fkey"
    FOREIGN KEY ("to_department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "service_account_moves" ADD CONSTRAINT "service_account_moves_new_responsible_employee_id_fkey"
    FOREIGN KEY ("new_responsible_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "service_account_moves" ADD CONSTRAINT "service_account_moves_confirmed_by_employee_id_fkey"
    FOREIGN KEY ("confirmed_by_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "service_account_moves" ADD CONSTRAINT "service_account_moves_resulting_assignment_id_fkey"
    FOREIGN KEY ("resulting_assignment_id") REFERENCES "license_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "service_account_duty_notices" ADD CONSTRAINT "service_account_duty_notices_assignment_id_fkey"
    FOREIGN KEY ("assignment_id") REFERENCES "license_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A proposal is decided once and kept: only a waiting one changes, and then only to confirmed or cancelled; what was proposed never
-- changes, and none is deleted.
CREATE FUNCTION "service_account_move_guard"() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'A service account move is never deleted'
            USING ERRCODE = '55000', CONSTRAINT = 'service_account_move_kept';
    END IF;
    IF OLD."status" <> 'PENDING' THEN
        RAISE EXCEPTION 'A service account move that was confirmed or cancelled never changes again'
            USING ERRCODE = '55000', CONSTRAINT = 'service_account_move_decided_final';
    END IF;
    IF (NEW."id", NEW."organization_id", NEW."assignment_id", NEW."from_department_id", NEW."to_department_id",
        NEW."new_responsible_employee_id", NEW."effective_from", NEW."expected_end_date", NEW."proposed_by_app_user_id",
        NEW."proposed_at")
       IS DISTINCT FROM
       (OLD."id", OLD."organization_id", OLD."assignment_id", OLD."from_department_id", OLD."to_department_id",
        OLD."new_responsible_employee_id", OLD."effective_from", OLD."expected_end_date", OLD."proposed_by_app_user_id",
        OLD."proposed_at") THEN
        RAISE EXCEPTION 'What a service account move proposed never changes'
            USING ERRCODE = '55000', CONSTRAINT = 'service_account_move_proposal_fixed';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "service_account_moves_guard"
    BEFORE UPDATE OR DELETE ON "service_account_moves"
    FOR EACH ROW EXECUTE FUNCTION "service_account_move_guard"();

-- The reminders are facts: written once and never changed or deleted.
CREATE FUNCTION "service_account_duty_notice_guard"() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'A service account duty notice is never changed or deleted'
        USING ERRCODE = '55000', CONSTRAINT = 'service_account_duty_notice_kept';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "service_account_duty_notices_guard"
    BEFORE UPDATE OR DELETE ON "service_account_duty_notices"
    FOR EACH ROW EXECUTE FUNCTION "service_account_duty_notice_guard"();
