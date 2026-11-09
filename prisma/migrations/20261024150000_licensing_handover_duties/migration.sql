-- The confirmation of the handover of the data of a tool before a seat is taken away (g6-handover-confirmation, US-03-09,
-- US-07-09): one duty for each seat, made when the handover is opened and written once when the person it falls to confirms.
-- The row says what is owed and by what role; who that is today is read from the organization, except where the decision that
-- made the duty fixed a person (a return, a head who decided).

-- CreateEnum
CREATE TYPE "HandoverConfirmerRole" AS ENUM ('DEPARTMENT_HEAD', 'REQUESTER', 'IT_ADMIN');
CREATE TYPE "HandoverConfirmedRole" AS ENUM ('DEPARTMENT_HEAD', 'DESIGNATED_SUCCESSOR', 'REQUESTER', 'IT_ADMIN');
CREATE TYPE "HandoverValue" AS ENUM ('HANDED_OVER', 'NOT_NEEDED', 'HANDLED');

-- CreateTable
CREATE TABLE "handover_duties" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "source" "RevocationSource" NOT NULL,
    "case_ref_id" UUID,
    "department_id" UUID,
    "leaver_is_head" BOOLEAN NOT NULL,
    "resolve_on" DATE,
    "confirmer_role" "HandoverConfirmerRole" NOT NULL,
    "confirmer_employee_id" UUID,
    "data_loss" BOOLEAN NOT NULL,
    "notice_text" TEXT,
    "due_on" DATE NOT NULL,
    "confirmed_value" "HandoverValue",
    "confirmed_by_employee_id" UUID,
    "confirmed_role" "HandoverConfirmedRole",
    "confirmed_at" TIMESTAMPTZ(3),
    "confirmed_late" BOOLEAN NOT NULL DEFAULT false,
    "overdue_noticed_at" TIMESTAMPTZ(3),
    "proceeded_unconfirmed_at" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),
    "cancel_reason" TEXT,
    "created_by_app_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "handover_duties_pkey" PRIMARY KEY ("id"),
    -- The four columns of a confirmation come together: the value, the person, the role they confirmed in and the moment.
    CONSTRAINT "handover_duties_confirmation_together" CHECK (
        ("confirmed_value" IS NULL AND "confirmed_by_employee_id" IS NULL AND "confirmed_role" IS NULL
            AND "confirmed_at" IS NULL AND "confirmed_late" = false)
        OR ("confirmed_value" IS NOT NULL AND "confirmed_by_employee_id" IS NOT NULL AND "confirmed_role" IS NOT NULL
            AND "confirmed_at" IS NOT NULL)
    ),
    -- A duty that was cancelled says why, and a confirmed duty is history that is never cancelled.
    CONSTRAINT "handover_duties_cancel_together" CHECK (
        ("cancelled_at" IS NULL) = ("cancel_reason" IS NULL)
        AND ("cancel_reason" IS NULL OR length(btrim("cancel_reason")) > 0)
    ),
    CONSTRAINT "handover_duties_cancelled_not_confirmed" CHECK ("cancelled_at" IS NULL OR "confirmed_at" IS NULL),
    -- The person of a return is fixed; a person fixed by a decision is only for the roles that can be fixed.
    CONSTRAINT "handover_duties_requester_is_fixed" CHECK ("confirmer_role" <> 'REQUESTER' OR "confirmer_employee_id" IS NOT NULL),
    CONSTRAINT "handover_duties_it_admin_not_fixed" CHECK ("confirmer_role" <> 'IT_ADMIN' OR "confirmer_employee_id" IS NULL),
    -- A successor is looked for on a day only when the person who leaves is the head.
    CONSTRAINT "handover_duties_resolve_on_for_head" CHECK ("resolve_on" IS NULL OR "leaver_is_head"),
    CONSTRAINT "handover_duties_notice_not_blank" CHECK ("notice_text" IS NULL OR length(btrim("notice_text")) > 0)
);

-- A seat owes one handover at a time: a new duty may be made once the one before is confirmed or cancelled.
-- CreateIndex
CREATE UNIQUE INDEX "handover_duties_one_open_per_assignment"
    ON "handover_duties"("assignment_id") WHERE "confirmed_at" IS NULL AND "cancelled_at" IS NULL;
CREATE INDEX "handover_duties_assignment_id_idx" ON "handover_duties"("assignment_id");
CREATE INDEX "handover_duties_employee_id_idx" ON "handover_duties"("employee_id");
CREATE INDEX "handover_duties_due_on_id_idx" ON "handover_duties"("due_on", "id");

-- AddForeignKey
ALTER TABLE "handover_duties" ADD CONSTRAINT "handover_duties_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "handover_duties" ADD CONSTRAINT "handover_duties_assignment_id_fkey"
    FOREIGN KEY ("assignment_id") REFERENCES "license_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "handover_duties" ADD CONSTRAINT "handover_duties_employee_id_fkey"
    FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "handover_duties" ADD CONSTRAINT "handover_duties_department_id_fkey"
    FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "handover_duties" ADD CONSTRAINT "handover_duties_confirmer_employee_id_fkey"
    FOREIGN KEY ("confirmer_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "handover_duties" ADD CONSTRAINT "handover_duties_confirmed_by_employee_id_fkey"
    FOREIGN KEY ("confirmed_by_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A confirmation is written once and kept: a confirmed or a cancelled duty is never changed again, and no duty is deleted.
CREATE FUNCTION "handover_duty_guard"() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'A handover duty is never deleted'
            USING ERRCODE = '55000', CONSTRAINT = 'handover_duty_kept';
    END IF;
    IF OLD."confirmed_at" IS NOT NULL THEN
        RAISE EXCEPTION 'A confirmed handover is never changed'
            USING ERRCODE = '55000', CONSTRAINT = 'handover_duty_confirmed_final';
    END IF;
    IF OLD."cancelled_at" IS NOT NULL THEN
        RAISE EXCEPTION 'A cancelled handover duty is never changed'
            USING ERRCODE = '55000', CONSTRAINT = 'handover_duty_cancelled_final';
    END IF;
    IF NEW."assignment_id" IS DISTINCT FROM OLD."assignment_id" OR NEW."employee_id" IS DISTINCT FROM OLD."employee_id"
       OR NEW."organization_id" IS DISTINCT FROM OLD."organization_id" THEN
        RAISE EXCEPTION 'A handover duty keeps its seat and its person'
            USING ERRCODE = '55000', CONSTRAINT = 'handover_duty_identity_fixed';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "handover_duties_guard"
    BEFORE UPDATE OR DELETE ON "handover_duties"
    FOR EACH ROW EXECUTE FUNCTION "handover_duty_guard"();
