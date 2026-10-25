-- What the assessment records when the IT Admin refuses at the gate (US-05-18): the kind, the reason that must go with it,
-- the alternative if there is one, who and when. A refused assessment says all of it and says nothing of a completion; a
-- draft or a completed one says nothing of a refusal.

-- CreateEnum
CREATE TYPE "ItRejectionKind" AS ENUM ('UNCONTROLLABLE', 'NOT_ELIGIBLE');

-- AlterTable
ALTER TABLE "access_request_assessments" ADD COLUMN     "alternative_note" TEXT,
ADD COLUMN     "alternative_plan_id" UUID,
ADD COLUMN     "rejected_at" TIMESTAMPTZ(3),
ADD COLUMN     "rejected_by_employee_id" UUID,
ADD COLUMN     "rejection_kind" "ItRejectionKind",
ADD COLUMN     "rejection_reason" TEXT;

-- AddForeignKey
ALTER TABLE "access_request_assessments" ADD CONSTRAINT "access_request_assessments_alternative_plan_id_fkey" FOREIGN KEY ("alternative_plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_request_assessments" ADD CONSTRAINT "access_request_assessments_rejected_by_employee_id_fkey" FOREIGN KEY ("rejected_by_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Constraints Prisma cannot express (ADR-0005).
ALTER TABLE "access_request_assessments" DROP CONSTRAINT "access_request_assessments_completed_check";

ALTER TABLE "access_request_assessments"
    ADD CONSTRAINT "access_request_assessments_state_check" CHECK (
        ("status" = 'DRAFT'
            AND "completed_at" IS NULL AND "completed_by_employee_id" IS NULL
            AND "rejection_kind" IS NULL AND "rejection_reason" IS NULL AND "rejected_at" IS NULL
            AND "rejected_by_employee_id" IS NULL AND "alternative_plan_id" IS NULL AND "alternative_note" IS NULL)
        OR ("status" = 'COMPLETED'
            AND "completed_at" IS NOT NULL AND "completed_by_employee_id" IS NOT NULL AND "classification" IS NOT NULL
            AND "rejection_kind" IS NULL AND "rejection_reason" IS NULL AND "rejected_at" IS NULL
            AND "rejected_by_employee_id" IS NULL AND "alternative_plan_id" IS NULL AND "alternative_note" IS NULL)
        OR ("status" = 'REJECTED'
            AND "completed_at" IS NULL AND "completed_by_employee_id" IS NULL
            AND "rejection_kind" IS NOT NULL AND "rejection_reason" IS NOT NULL AND btrim("rejection_reason") <> ''
            AND "rejected_at" IS NOT NULL AND "rejected_by_employee_id" IS NOT NULL)
    ),
    ADD CONSTRAINT "access_request_assessments_alternative_check" CHECK (
        "alternative_note" IS NULL OR btrim("alternative_note") <> '');
