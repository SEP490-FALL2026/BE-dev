-- What the spending approver asks Finance, and what Finance answers (US-06-02, US-06-03).

-- CreateEnum
CREATE TYPE "BudgetInformationState" AS ENUM ('OPEN', 'ANSWERED', 'CLOSED');

-- CreateEnum
CREATE TYPE "BudgetInformationAnswer" AS ENUM ('WITHIN_LIMIT', 'OVER_LIMIT', 'NO_BUDGET');

-- CreateEnum
CREATE TYPE "BudgetInformationCloseReason" AS ENUM ('REQUEST_WITHDRAWN', 'STEP_CLOSED');

-- CreateTable
CREATE TABLE "budget_information_requests" (
    "id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "step_id" UUID NOT NULL,
    "asked_by_employee_id" UUID NOT NULL,
    "question" TEXT NOT NULL,
    "asked_at" TIMESTAMPTZ(3) NOT NULL,
    "state" "BudgetInformationState" NOT NULL DEFAULT 'OPEN',
    "answer" "BudgetInformationAnswer",
    "answer_note" TEXT,
    "answered_by_employee_id" UUID,
    "answered_at" TIMESTAMPTZ(3),
    "closed_at" TIMESTAMPTZ(3),
    "close_reason" "BudgetInformationCloseReason",

    CONSTRAINT "budget_information_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "budget_information_requests_question_check" CHECK (btrim("question") <> '' AND char_length("question") <= 2000),
    CONSTRAINT "budget_information_requests_note_check" CHECK ("answer_note" IS NULL OR char_length("answer_note") <= 2000),
    -- A question is open, answered or closed, and says what that state needs and nothing else.
    CONSTRAINT "budget_information_requests_shape_check" CHECK (
        ("state" = 'OPEN'
            AND "answer" IS NULL AND "answer_note" IS NULL AND "answered_by_employee_id" IS NULL AND "answered_at" IS NULL
            AND "closed_at" IS NULL AND "close_reason" IS NULL)
        OR ("state" = 'ANSWERED'
            AND "answer" IS NOT NULL AND "answered_by_employee_id" IS NOT NULL AND "answered_at" IS NOT NULL
            AND "closed_at" IS NULL AND "close_reason" IS NULL)
        OR ("state" = 'CLOSED'
            AND "answer" IS NULL AND "answer_note" IS NULL AND "answered_by_employee_id" IS NULL AND "answered_at" IS NULL
            AND "closed_at" IS NOT NULL AND "close_reason" IS NOT NULL)
    )
);

-- CreateIndex
CREATE INDEX "budget_information_requests_request_id_asked_at_idx" ON "budget_information_requests"("request_id", "asked_at");

-- CreateIndex
CREATE INDEX "budget_information_requests_state_asked_at_idx" ON "budget_information_requests"("state", "asked_at");

-- One question is open for a step at a time; Finance answers it before the approver asks the next.
CREATE UNIQUE INDEX "budget_information_requests_one_open_per_step" ON "budget_information_requests"("step_id") WHERE "state" = 'OPEN';

-- AddForeignKey
ALTER TABLE "budget_information_requests" ADD CONSTRAINT "budget_information_requests_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "access_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_information_requests" ADD CONSTRAINT "budget_information_requests_step_id_fkey" FOREIGN KEY ("step_id") REFERENCES "access_request_steps"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_information_requests" ADD CONSTRAINT "budget_information_requests_asked_by_employee_id_fkey" FOREIGN KEY ("asked_by_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_information_requests" ADD CONSTRAINT "budget_information_requests_answered_by_employee_id_fkey" FOREIGN KEY ("answered_by_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- INV-05: a question is kept as asked and goes from open to answered or closed once; nothing deletes it.
CREATE FUNCTION budget_information_requests_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RAISE EXCEPTION 'budget_information_requests is append-only (% rejected)', TG_OP USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.state <> 'OPEN'
     OR NEW.request_id <> OLD.request_id OR NEW.step_id <> OLD.step_id OR NEW.asked_by_employee_id <> OLD.asked_by_employee_id
     OR NEW.question <> OLD.question OR NEW.asked_at <> OLD.asked_at THEN
    RAISE EXCEPTION 'budget_information_requests keeps what was asked, and ends once (UPDATE rejected)'
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER budget_information_requests_guard_row
  BEFORE UPDATE OR DELETE ON budget_information_requests
  FOR EACH ROW EXECUTE FUNCTION budget_information_requests_guard();

CREATE TRIGGER budget_information_requests_guard_truncate
  BEFORE TRUNCATE ON budget_information_requests
  FOR EACH STATEMENT EXECUTE FUNCTION budget_information_requests_guard();
