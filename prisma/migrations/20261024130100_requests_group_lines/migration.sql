-- A request for a group of people (g5-group-requests, US-05-17). The request is one row of `access_requests` of the type
-- GROUP_GRANT: paid software already in the catalog, one amount, one Cost Center, one spend step. Each person it is for is a
-- line (`access_request_lines`) with a state and an outcome of their own; the request itself is a summary of its lines. The
-- people stay in `access_request_beneficiaries`, which a line joins, so no column is added to a table the other kinds of
-- request use.

-- CreateEnum
CREATE TYPE "AccessRequestLineState" AS ENUM ('AWAITING_NEED', 'NEED_CONFIRMED', 'NEED_REJECTED', 'SPEND_REJECTED', 'APPROVED', 'EXECUTING', 'AWAITING_IT_CLOSE', 'COMPLETED', 'FAILED', 'WITHDRAWN', 'DROPPED');

-- CreateEnum
CREATE TYPE "LineDecisionStage" AS ENUM ('NEED', 'SPEND');

-- CreateTable
CREATE TABLE "access_request_lines" (
    "request_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "state" "AccessRequestLineState" NOT NULL,
    "need_step_id" UUID NOT NULL,
    "expected_end_date" DATE,
    "ended_at" TIMESTAMPTZ(3),
    "ended_by_employee_id" UUID,
    "end_reason" TEXT,
    "withdrawal_requested_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "access_request_lines_pkey" PRIMARY KEY ("request_id","employee_id")
);

-- CreateTable
CREATE TABLE "access_request_line_decisions" (
    "request_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "stage" "LineDecisionStage" NOT NULL,
    "step_id" UUID NOT NULL,
    "decision" "ApprovalDecision" NOT NULL,
    "reason" TEXT,
    "decided_by_employee_id" UUID NOT NULL,
    "decider_role" "ApprovalDeciderRole" NOT NULL,
    "decided_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "access_request_line_decisions_pkey" PRIMARY KEY ("request_id","employee_id","stage")
);

-- CreateTable
CREATE TABLE "access_request_line_amounts" (
    "request_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "budget_year" INTEGER NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "released_at" TIMESTAMPTZ(3),

    CONSTRAINT "access_request_line_amounts_pkey" PRIMARY KEY ("request_id","employee_id","budget_year")
);

-- CreateIndex
CREATE INDEX "access_request_lines_request_id_state_idx" ON "access_request_lines"("request_id", "state");

-- CreateIndex
CREATE INDEX "access_request_lines_need_step_id_idx" ON "access_request_lines"("need_step_id");

-- CreateIndex
CREATE INDEX "access_request_line_decisions_step_id_idx" ON "access_request_line_decisions"("step_id");

-- AddForeignKey
ALTER TABLE "access_request_lines" ADD CONSTRAINT "access_request_lines_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "access_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_request_lines" ADD CONSTRAINT "access_request_lines_request_id_employee_id_fkey" FOREIGN KEY ("request_id", "employee_id") REFERENCES "access_request_beneficiaries"("request_id", "employee_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_request_lines" ADD CONSTRAINT "access_request_lines_need_step_id_fkey" FOREIGN KEY ("need_step_id") REFERENCES "access_request_steps"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_request_lines" ADD CONSTRAINT "access_request_lines_ended_by_employee_id_fkey" FOREIGN KEY ("ended_by_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_request_line_decisions" ADD CONSTRAINT "access_request_line_decisions_request_id_employee_id_fkey" FOREIGN KEY ("request_id", "employee_id") REFERENCES "access_request_lines"("request_id", "employee_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_request_line_decisions" ADD CONSTRAINT "access_request_line_decisions_step_id_fkey" FOREIGN KEY ("step_id") REFERENCES "access_request_steps"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_request_line_decisions" ADD CONSTRAINT "access_request_line_decisions_decided_by_employee_id_fkey" FOREIGN KEY ("decided_by_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_request_line_amounts" ADD CONSTRAINT "access_request_line_amounts_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "access_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_request_line_amounts" ADD CONSTRAINT "access_request_line_amounts_request_id_employee_id_fkey" FOREIGN KEY ("request_id", "employee_id") REFERENCES "access_request_lines"("request_id", "employee_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_request_line_amounts" ADD CONSTRAINT "access_request_line_amounts_currency_fkey" FOREIGN KEY ("currency") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Constraints Prisma cannot express (ADR-0005).

-- A request for a group is always paid software that is already in the catalog: the branch of a plan with a price, never a
-- proposal of software that is not there yet (the branch of an internal tool has no spend step, which the group needs).
ALTER TABLE "access_requests"
    ADD CONSTRAINT "access_requests_group_check" CHECK (
        "type" <> 'GROUP_GRANT' OR ("branch" = 'PAID_IN_CATALOG' AND "plan_id" IS NOT NULL)
    );

-- A line ends in exactly the states that end it, and says who and why when the ending is a person's decision: a refusal and a
-- left-out person give their reason, a withdrawal names who withdrew. A line waiting for the IT Admin to close its task, or that
-- was withdrawn, says when the withdrawal was asked, and who asked, which it keeps until the task is closed.
ALTER TABLE "access_request_lines"
    ADD CONSTRAINT "access_request_lines_end_check" CHECK (
        ("state" IN ('NEED_REJECTED', 'SPEND_REJECTED', 'COMPLETED', 'FAILED', 'WITHDRAWN', 'DROPPED')) = ("ended_at" IS NOT NULL)
    ),
    ADD CONSTRAINT "access_request_lines_ender_check" CHECK (
        "ended_by_employee_id" IS NULL OR "ended_at" IS NOT NULL OR "state" = 'AWAITING_IT_CLOSE'
    ),
    ADD CONSTRAINT "access_request_lines_reason_check" CHECK ("end_reason" IS NULL OR btrim("end_reason") <> ''),
    ADD CONSTRAINT "access_request_lines_refusal_reason_check" CHECK (
        "state" NOT IN ('NEED_REJECTED', 'SPEND_REJECTED', 'DROPPED') OR "end_reason" IS NOT NULL
    ),
    ADD CONSTRAINT "access_request_lines_ender_state_check" CHECK (
        "state" NOT IN ('NEED_REJECTED', 'SPEND_REJECTED', 'WITHDRAWN', 'DROPPED', 'AWAITING_IT_CLOSE')
        OR "ended_by_employee_id" IS NOT NULL
    ),
    ADD CONSTRAINT "access_request_lines_withdrawal_check" CHECK (
        ("withdrawal_requested_at" IS NOT NULL) = ("state" IN ('AWAITING_IT_CLOSE', 'WITHDRAWN'))
    );

-- A refusal of a line gives its reason, and no reason is blank.
ALTER TABLE "access_request_line_decisions"
    ADD CONSTRAINT "access_request_line_decisions_reason_check" CHECK ("reason" IS NULL OR btrim("reason") <> ''),
    ADD CONSTRAINT "access_request_line_decisions_refusal_reason_check" CHECK ("decision" <> 'REJECTED' OR "reason" IS NOT NULL);

-- The share of a person in the commitment of a year is money: never nothing.
ALTER TABLE "access_request_line_amounts"
    ADD CONSTRAINT "access_request_line_amounts_amount_check" CHECK ("amount_minor" > 0);

-- INV-05: what was decided for a person is append-only, so no code path, including raw SQL from another module, can rewrite it.
CREATE FUNCTION access_request_line_decisions_reject_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'access_request_line_decisions is append-only (% rejected)', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER access_request_line_decisions_no_update_delete
  BEFORE UPDATE OR DELETE ON access_request_line_decisions
  FOR EACH ROW EXECUTE FUNCTION access_request_line_decisions_reject_change();

CREATE TRIGGER access_request_line_decisions_no_truncate
  BEFORE TRUNCATE ON access_request_line_decisions
  FOR EACH STATEMENT EXECUTE FUNCTION access_request_line_decisions_reject_change();

-- The share of a person is never changed or deleted; the only thing that happens to it is that it is given back, once.
CREATE FUNCTION access_request_line_amounts_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'The share of a person in a commitment is never deleted'
      USING ERRCODE = '55000', CONSTRAINT = 'access_request_line_amounts_immutable';
  END IF;
  IF (NEW."request_id", NEW."employee_id", NEW."budget_year", NEW."amount_minor", NEW."currency")
     IS DISTINCT FROM (OLD."request_id", OLD."employee_id", OLD."budget_year", OLD."amount_minor", OLD."currency")
     OR (OLD."released_at" IS NOT NULL AND NEW."released_at" IS DISTINCT FROM OLD."released_at") THEN
    RAISE EXCEPTION 'The share of a person in a commitment is never changed, and is given back once'
      USING ERRCODE = '55000', CONSTRAINT = 'access_request_line_amounts_immutable';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER access_request_line_amounts_no_change
  BEFORE UPDATE OR DELETE ON access_request_line_amounts
  FOR EACH ROW EXECUTE FUNCTION access_request_line_amounts_guard();

CREATE TRIGGER access_request_line_amounts_no_truncate
  BEFORE TRUNCATE ON access_request_line_amounts
  FOR EACH STATEMENT EXECUTE FUNCTION access_request_line_decisions_reject_change();

-- A line exists only for a request of the type GROUP_GRANT, begins awaiting its need or with the need already confirmed, keeps
-- its identity, and moves only along the states below; an ended line is never touched again.
CREATE FUNCTION access_request_lines_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  kind "AccessRequestType";
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'A line of a request is never deleted'
      USING ERRCODE = '55000', CONSTRAINT = 'access_request_lines_immutable';
  END IF;

  IF TG_OP = 'INSERT' THEN
    SELECT r."type" INTO kind FROM "access_requests" r WHERE r."id" = NEW."request_id";
    IF kind IS DISTINCT FROM 'GROUP_GRANT' THEN
      RAISE EXCEPTION 'Only a request for a group has lines'
        USING ERRCODE = '23514', CONSTRAINT = 'access_request_lines_group_only';
    END IF;
    IF NEW."state" NOT IN ('AWAITING_NEED', 'NEED_CONFIRMED') THEN
      RAISE EXCEPTION 'A line begins awaiting its need or with the need confirmed'
        USING ERRCODE = '23514', CONSTRAINT = 'access_request_lines_initial_state';
    END IF;

    RETURN NEW;
  END IF;

  IF (NEW."request_id", NEW."employee_id", NEW."need_step_id", NEW."created_at")
     IS DISTINCT FROM (OLD."request_id", OLD."employee_id", OLD."need_step_id", OLD."created_at") THEN
    RAISE EXCEPTION 'The identity of a line never changes'
      USING ERRCODE = '55000', CONSTRAINT = 'access_request_lines_identity';
  END IF;

  IF OLD."state" IN ('NEED_REJECTED', 'SPEND_REJECTED', 'COMPLETED', 'FAILED', 'WITHDRAWN', 'DROPPED') THEN
    RAISE EXCEPTION 'A line that has ended is never changed'
      USING ERRCODE = '55000', CONSTRAINT = 'access_request_lines_ended';
  END IF;

  IF NEW."state" <> OLD."state" AND NOT (
       (OLD."state" = 'AWAITING_NEED' AND NEW."state" IN ('NEED_CONFIRMED', 'NEED_REJECTED', 'WITHDRAWN'))
    OR (OLD."state" = 'NEED_CONFIRMED' AND NEW."state" IN ('APPROVED', 'SPEND_REJECTED', 'WITHDRAWN', 'DROPPED'))
    OR (OLD."state" = 'APPROVED' AND NEW."state" IN ('EXECUTING', 'WITHDRAWN'))
    OR (OLD."state" = 'EXECUTING' AND NEW."state" IN ('COMPLETED', 'FAILED', 'WITHDRAWN', 'AWAITING_IT_CLOSE'))
    OR (OLD."state" = 'AWAITING_IT_CLOSE' AND NEW."state" = 'WITHDRAWN')
  ) THEN
    RAISE EXCEPTION 'A line cannot move from % to %', OLD."state", NEW."state"
      USING ERRCODE = '55000', CONSTRAINT = 'access_request_lines_transition';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER access_request_lines_guard
  BEFORE INSERT OR UPDATE OR DELETE ON access_request_lines
  FOR EACH ROW EXECUTE FUNCTION access_request_lines_guard();

-- Every person of a request for a group has their line when the transaction commits: the people and their lines are written
-- together, so the check waits for the commit.
CREATE FUNCTION access_request_beneficiary_line_check() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  kind "AccessRequestType";
BEGIN
  SELECT r."type" INTO kind FROM "access_requests" r WHERE r."id" = NEW."request_id";
  IF kind = 'GROUP_GRANT' AND NOT EXISTS (
       SELECT 1 FROM "access_request_lines" l WHERE l."request_id" = NEW."request_id" AND l."employee_id" = NEW."employee_id"
     ) THEN
    RAISE EXCEPTION 'Every person of a request for a group has a line'
      USING ERRCODE = '23514', CONSTRAINT = 'access_request_beneficiaries_line';
  END IF;

  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER access_request_beneficiaries_line
  AFTER INSERT ON access_request_beneficiaries
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION access_request_beneficiary_line_check();
