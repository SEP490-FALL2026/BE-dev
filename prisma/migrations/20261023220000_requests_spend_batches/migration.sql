-- The batch the head sends their requests on in (QĐ-82j, US-06-14) and the supplementary file that changes the day the money
-- is expected to go out after a request was sent (QĐ-82n). A batch is an envelope: it has no decision and no commitment.

-- CreateEnum
CREATE TYPE "SpendBatchItemOutcome" AS ENUM ('SENT_TO_APPROVER', 'SENT_TO_FINANCE', 'STOPPED');

-- CreateEnum
CREATE TYPE "SpendBatchLeftReason" AS ENUM ('RETURNED_BY_FINANCE', 'CONFLICT_OF_INTEREST');

-- CreateTable
CREATE TABLE "spend_batches" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "department_id" UUID NOT NULL,
    "submitted_by_employee_id" UUID NOT NULL,
    "submitted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "spend_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spend_batch_items" (
    "batch_id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "outcome" "SpendBatchItemOutcome" NOT NULL,
    "stop_reason" TEXT,
    "left_reason" "SpendBatchLeftReason",
    "left_at" TIMESTAMPTZ(3),

    CONSTRAINT "spend_batch_items_pkey" PRIMARY KEY ("batch_id", "request_id"),
    CONSTRAINT "spend_batch_items_position_check" CHECK ("position" >= 1),
    -- A request that stayed says why, and one that was sent does not (US-06-14 AC-9). Both sides are never missing.
    CONSTRAINT "spend_batch_items_stop_check" CHECK (
        ("outcome" = 'STOPPED' AND "stop_reason" IS NOT NULL
            AND "stop_reason" IN ('PLAN_LINE_REQUIRED', 'STALE_COST_EVIDENCE', 'CLOSED_OR_EXPIRED_BUDGET_PERIOD', 'PRICE_MISSING', 'RATE_MISSING'))
        OR ("outcome" IN ('SENT_TO_APPROVER', 'SENT_TO_FINANCE') AND "stop_reason" IS NULL)
    ),
    -- Leaving the batch says why and when, and only a request that was sent has left anything.
    CONSTRAINT "spend_batch_items_left_check" CHECK (
        ("left_reason" IS NULL AND "left_at" IS NULL)
        OR ("left_reason" IS NOT NULL AND "left_at" IS NOT NULL AND "outcome" <> 'STOPPED')
    )
);

-- CreateTable
CREATE TABLE "request_supplements" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "changed_by_employee_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "before_expected_spend_on" DATE NOT NULL,
    "after_expected_spend_on" DATE NOT NULL,
    "before_budget_year" INTEGER NOT NULL,
    "after_budget_year" INTEGER NOT NULL,
    "before_amount_minor" BIGINT NOT NULL,
    "after_amount_minor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,

    CONSTRAINT "request_supplements_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "request_supplements_number_check" CHECK ("number" >= 1),
    CONSTRAINT "request_supplements_reason_check" CHECK (btrim("reason") <> ''),
    CONSTRAINT "request_supplements_change_check" CHECK ("before_expected_spend_on" <> "after_expected_spend_on"),
    CONSTRAINT "request_supplements_amount_check" CHECK ("before_amount_minor" >= 0 AND "after_amount_minor" >= 0)
);

-- CreateIndex
CREATE INDEX "spend_batches_submitted_by_employee_id_submitted_at_idx" ON "spend_batches"("submitted_by_employee_id", "submitted_at");

-- CreateIndex
CREATE UNIQUE INDEX "spend_batch_items_batch_id_position_key" ON "spend_batch_items"("batch_id", "position");

-- CreateIndex
CREATE INDEX "spend_batch_items_request_id_idx" ON "spend_batch_items"("request_id");

-- CreateIndex
CREATE UNIQUE INDEX "request_supplements_request_id_number_key" ON "request_supplements"("request_id", "number");

-- AddForeignKey
ALTER TABLE "spend_batches" ADD CONSTRAINT "spend_batches_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spend_batches" ADD CONSTRAINT "spend_batches_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spend_batches" ADD CONSTRAINT "spend_batches_submitted_by_employee_id_fkey" FOREIGN KEY ("submitted_by_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spend_batch_items" ADD CONSTRAINT "spend_batch_items_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "spend_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spend_batch_items" ADD CONSTRAINT "spend_batch_items_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "access_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_supplements" ADD CONSTRAINT "request_supplements_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_supplements" ADD CONSTRAINT "request_supplements_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "access_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_supplements" ADD CONSTRAINT "request_supplements_changed_by_employee_id_fkey" FOREIGN KEY ("changed_by_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_supplements" ADD CONSTRAINT "request_supplements_currency_fkey" FOREIGN KEY ("currency") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- INV-05: a batch and a supplementary file are append-only, so no code path, including raw SQL from another module, can
-- rewrite who sent what, or what the head changed and why. (The function is the one of the checks and reviews.)
CREATE TRIGGER spend_batches_no_update_delete
  BEFORE UPDATE OR DELETE ON spend_batches
  FOR EACH ROW EXECUTE FUNCTION request_budget_records_reject_change();

CREATE TRIGGER spend_batches_no_truncate
  BEFORE TRUNCATE ON spend_batches
  FOR EACH STATEMENT EXECUTE FUNCTION request_budget_records_reject_change();

CREATE TRIGGER request_supplements_no_update_delete
  BEFORE UPDATE OR DELETE ON request_supplements
  FOR EACH ROW EXECUTE FUNCTION request_budget_records_reject_change();

CREATE TRIGGER request_supplements_no_truncate
  BEFORE TRUNCATE ON request_supplements
  FOR EACH STATEMENT EXECUTE FUNCTION request_budget_records_reject_change();

-- An item of a batch is kept: nothing deletes it, and the only change is to say once that the request has left it.
CREATE FUNCTION spend_batch_items_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RAISE EXCEPTION 'spend_batch_items is append-only (% rejected)', TG_OP USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.left_reason IS NOT NULL
     OR NEW.batch_id <> OLD.batch_id OR NEW.request_id <> OLD.request_id OR NEW.position <> OLD.position
     OR NEW.outcome <> OLD.outcome OR NEW.stop_reason IS DISTINCT FROM OLD.stop_reason THEN
    RAISE EXCEPTION 'spend_batch_items keeps what it said, and says once that the request left (UPDATE rejected)'
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER spend_batch_items_guard_row
  BEFORE UPDATE OR DELETE ON spend_batch_items
  FOR EACH ROW EXECUTE FUNCTION spend_batch_items_guard();

CREATE TRIGGER spend_batch_items_guard_truncate
  BEFORE TRUNCATE ON spend_batch_items
  FOR EACH STATEMENT EXECUTE FUNCTION spend_batch_items_guard();
