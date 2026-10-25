-- The record of a person who leaves (g6-offboarding-record, US-03-04): a planned handover with a last working day that ends as
-- LEFT or CANCELLED, or an abrupt departure that is LEFT at once. One row for each case; what happens to it (a move of the last
-- day, the lock of the account, the revocations opened, the closing) is a row of the log beside it. The work state of the employee,
-- the placement and the head of the department the case moves are written by the same transaction through the organization.

-- CreateEnum
CREATE TYPE "OffboardingState" AS ENUM ('HANDING_OVER', 'LEFT', 'CANCELLED');
CREATE TYPE "OffboardingChangeKind" AS ENUM (
  'RECORDED', 'LAST_DAY_CHANGED', 'CANCELLED', 'MARKED_LEFT', 'ACCOUNT_LOCK_RECORDED', 'REVOCATIONS_OPENED', 'CLOSED'
);

-- CreateTable
CREATE TABLE "offboarding_cases" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    -- The department the person belonged to when the case was written: where the head of the department is looked up.
    "department_id" UUID NOT NULL,
    "state" "OffboardingState" NOT NULL DEFAULT 'HANDING_OVER',
    "abrupt" BOOLEAN NOT NULL DEFAULT false,
    -- What the person was doing before the handover began, which a cancellation resumes (the long leave is resumed by its own rule).
    "prior_work_state" "EmployeeWorkState" NOT NULL,
    "last_working_day" DATE NOT NULL,
    -- The first day the person is no longer a member of the department (and no longer its head).
    "departure_effective_on" DATE NOT NULL,
    -- The day the confirmation of the handover is due; an abrupt departure has none (its hold is counted from the day of recording).
    "handover_due_on" DATE,
    "grounds_type" TEXT NOT NULL,
    "grounds_reference" TEXT NOT NULL,
    "grounds_issuer" TEXT NOT NULL,
    "grounds_issued_on" DATE NOT NULL,
    -- What the handover of the head of the department moved, as the transfers keep it, so a move or a cancellation restores it.
    "head_handover" JSONB,
    "placement_closed_id" UUID,
    "left_on" DATE,
    "left_at" TIMESTAMPTZ(3),
    "left_by_app_user_id" UUID,
    "cancelled_at" TIMESTAMPTZ(3),
    "cancelled_by_app_user_id" UUID,
    "cancel_reason" TEXT,
    "account_lock_by_app_user_id" UUID,
    "account_lock_at" TIMESTAMPTZ(3),
    "account_lock_note" TEXT,
    "closed_at" TIMESTAMPTZ(3),
    "closed_by_app_user_id" UUID,
    "self_executed" BOOLEAN NOT NULL DEFAULT false,
    "recorded_by_app_user_id" UUID NOT NULL,
    "recorded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "offboarding_cases_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "offboarding_cases_prior_work_state_check" CHECK ("prior_work_state" IN ('WORKING', 'ON_LONG_LEAVE')),
    CONSTRAINT "offboarding_cases_effective_after_last_day_check" CHECK ("departure_effective_on" > "last_working_day"),
    -- A planned handover has a day its confirmation is due; an abrupt departure has none.
    CONSTRAINT "offboarding_cases_due_for_planned_only_check" CHECK (("abrupt") = ("handover_due_on" IS NULL)),
    -- An abrupt departure begins as LEFT and can only end as LEFT.
    CONSTRAINT "offboarding_cases_abrupt_is_left_check" CHECK (NOT "abrupt" OR "state" = 'LEFT'),
    CONSTRAINT "offboarding_cases_grounds_check"
      CHECK (btrim("grounds_type") <> '' AND btrim("grounds_reference") <> '' AND btrim("grounds_issuer") <> ''),
    CONSTRAINT "offboarding_cases_head_handover_object_check"
      CHECK ("head_handover" IS NULL OR jsonb_typeof("head_handover") = 'object'),
    -- The person has left exactly when the state says so, and then the day, the moment and who say it too.
    CONSTRAINT "offboarding_cases_left_consistent_check" CHECK (
      (("state" = 'LEFT') = ("left_on" IS NOT NULL))
      AND (("left_on" IS NULL) = ("left_at" IS NULL))
      AND (("left_on" IS NULL) = ("left_by_app_user_id" IS NULL))
    ),
    CONSTRAINT "offboarding_cases_cancelled_consistent_check" CHECK (
      (("state" = 'CANCELLED') = ("cancelled_at" IS NOT NULL))
      AND (("cancelled_at" IS NULL) = ("cancelled_by_app_user_id" IS NULL))
      AND (("cancelled_at" IS NULL) = ("cancel_reason" IS NULL))
      AND ("cancel_reason" IS NULL OR btrim("cancel_reason") <> '')
    ),
    -- The lock of the account is written once, by a person, for a person who has left.
    CONSTRAINT "offboarding_cases_account_lock_check" CHECK (
      (("account_lock_at" IS NULL) = ("account_lock_by_app_user_id" IS NULL))
      AND (("account_lock_at" IS NULL) = ("account_lock_note" IS NULL))
      AND ("account_lock_note" IS NULL OR btrim("account_lock_note") <> '')
      AND ("account_lock_at" IS NULL OR "state" = 'LEFT')
    ),
    -- A case closes once, after the lock of the account, and only when the person has left.
    CONSTRAINT "offboarding_cases_closed_check" CHECK (
      (("closed_at" IS NULL) = ("closed_by_app_user_id" IS NULL))
      AND ("closed_at" IS NULL OR ("state" = 'LEFT' AND "account_lock_at" IS NOT NULL))
    )
);

CREATE TABLE "offboarding_case_changes" (
    "id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "kind" "OffboardingChangeKind" NOT NULL,
    "old_last_working_day" DATE,
    "new_last_working_day" DATE,
    "reason" TEXT,
    "detail" JSONB,
    "changed_by_app_user_id" UUID NOT NULL,
    "changed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "self_executed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "offboarding_case_changes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "offboarding_case_changes_detail_object_check"
      CHECK ("detail" IS NULL OR jsonb_typeof("detail") = 'object'),
    CONSTRAINT "offboarding_case_changes_last_day_check" CHECK (
      "kind" <> 'LAST_DAY_CHANGED'
      OR ("old_last_working_day" IS NOT NULL AND "new_last_working_day" IS NOT NULL
          AND "new_last_working_day" <> "old_last_working_day" AND btrim(coalesce("reason", '')) <> '')
    ),
    CONSTRAINT "offboarding_case_changes_reason_check" CHECK (
      "kind" NOT IN ('CANCELLED', 'REVOCATIONS_OPENED') OR btrim(coalesce("reason", '')) <> ''
    )
);

-- A person has one live case: a handover under way or a departure (also after it was closed).
-- CreateIndex
CREATE UNIQUE INDEX "offboarding_cases_one_live_per_employee" ON "offboarding_cases"("employee_id")
  WHERE "state" IN ('HANDING_OVER', 'LEFT');
CREATE INDEX "offboarding_cases_last_working_day_id_idx" ON "offboarding_cases"("last_working_day", "id");
CREATE INDEX "offboarding_cases_employee_id_idx" ON "offboarding_cases"("employee_id");
CREATE INDEX "offboarding_cases_state_last_working_day_id_idx" ON "offboarding_cases"("state", "last_working_day", "id");
CREATE INDEX "offboarding_cases_organization_id_idx" ON "offboarding_cases"("organization_id");
CREATE INDEX "offboarding_case_changes_case_id_changed_at_id_idx"
  ON "offboarding_case_changes"("case_id", "changed_at", "id");

-- AddForeignKey (the accounts that acted are values: the history outlives the account)
ALTER TABLE "offboarding_cases"
  ADD CONSTRAINT "offboarding_cases_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "offboarding_cases"
  ADD CONSTRAINT "offboarding_cases_employee_id_fkey"
  FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "offboarding_cases"
  ADD CONSTRAINT "offboarding_cases_department_id_fkey"
  FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "offboarding_case_changes"
  ADD CONSTRAINT "offboarding_case_changes_case_id_fkey"
  FOREIGN KEY ("case_id") REFERENCES "offboarding_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A cancelled case is a fact and never changes; a case is never deleted. While the handover runs the last day, the day the
-- membership ends, the day the confirmation is due and the periods written for it move, and the step to LEFT or CANCELLED is
-- one way. Once the person has left, only the lock of the account and the closing are written, each once.
CREATE FUNCTION offboarding_cases_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION 'offboarding_cases keeps its history (% rejected)', TG_OP
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF OLD."state" = 'CANCELLED' THEN
    RAISE EXCEPTION 'a cancelled case cannot change again'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF NEW."organization_id" IS DISTINCT FROM OLD."organization_id"
     OR NEW."employee_id" IS DISTINCT FROM OLD."employee_id"
     OR NEW."department_id" IS DISTINCT FROM OLD."department_id"
     OR NEW."abrupt" IS DISTINCT FROM OLD."abrupt"
     OR NEW."prior_work_state" IS DISTINCT FROM OLD."prior_work_state"
     OR NEW."grounds_type" IS DISTINCT FROM OLD."grounds_type"
     OR NEW."grounds_reference" IS DISTINCT FROM OLD."grounds_reference"
     OR NEW."grounds_issuer" IS DISTINCT FROM OLD."grounds_issuer"
     OR NEW."grounds_issued_on" IS DISTINCT FROM OLD."grounds_issued_on"
     OR NEW."self_executed" IS DISTINCT FROM OLD."self_executed"
     OR NEW."recorded_by_app_user_id" IS DISTINCT FROM OLD."recorded_by_app_user_id"
     OR NEW."recorded_at" IS DISTINCT FROM OLD."recorded_at" THEN
    RAISE EXCEPTION 'who leaves, from which department, on what basis and who recorded it never change'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF NEW."state" IS DISTINCT FROM OLD."state"
     AND NOT (OLD."state" = 'HANDING_OVER' AND NEW."state" IN ('LEFT', 'CANCELLED')) THEN
    RAISE EXCEPTION 'a case cannot move from % to %', OLD."state", NEW."state"
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF OLD."state" = 'LEFT' THEN
    IF NEW."last_working_day" IS DISTINCT FROM OLD."last_working_day"
       OR NEW."departure_effective_on" IS DISTINCT FROM OLD."departure_effective_on"
       OR NEW."handover_due_on" IS DISTINCT FROM OLD."handover_due_on"
       OR NEW."head_handover" IS DISTINCT FROM OLD."head_handover"
       OR NEW."placement_closed_id" IS DISTINCT FROM OLD."placement_closed_id"
       OR NEW."left_on" IS DISTINCT FROM OLD."left_on"
       OR NEW."left_at" IS DISTINCT FROM OLD."left_at"
       OR NEW."left_by_app_user_id" IS DISTINCT FROM OLD."left_by_app_user_id" THEN
      RAISE EXCEPTION 'a case of a person who has left keeps its days and its periods'
        USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    IF OLD."account_lock_at" IS NOT NULL
       AND (NEW."account_lock_at" IS DISTINCT FROM OLD."account_lock_at"
            OR NEW."account_lock_by_app_user_id" IS DISTINCT FROM OLD."account_lock_by_app_user_id"
            OR NEW."account_lock_note" IS DISTINCT FROM OLD."account_lock_note") THEN
      RAISE EXCEPTION 'the lock of the account is written once'
        USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    IF OLD."closed_at" IS NOT NULL
       AND (NEW."closed_at" IS DISTINCT FROM OLD."closed_at"
            OR NEW."closed_by_app_user_id" IS DISTINCT FROM OLD."closed_by_app_user_id") THEN
      RAISE EXCEPTION 'a closed case cannot change again'
        USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "offboarding_cases_no_rewrite"
  BEFORE UPDATE OR DELETE ON "offboarding_cases"
  FOR EACH ROW EXECUTE FUNCTION offboarding_cases_guard();
CREATE TRIGGER "offboarding_cases_no_truncate"
  BEFORE TRUNCATE ON "offboarding_cases"
  FOR EACH STATEMENT EXECUTE FUNCTION offboarding_cases_guard();

-- The log of what happened to a case is append-only.
CREATE FUNCTION offboarding_case_changes_reject_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'offboarding_case_changes is append-only (% rejected)', TG_OP
    USING ERRCODE = 'object_not_in_prerequisite_state';
END;
$$;

CREATE TRIGGER "offboarding_case_changes_no_update_delete"
  BEFORE UPDATE OR DELETE ON "offboarding_case_changes"
  FOR EACH ROW EXECUTE FUNCTION offboarding_case_changes_reject_change();
CREATE TRIGGER "offboarding_case_changes_no_truncate"
  BEFORE TRUNCATE ON "offboarding_case_changes"
  FOR EACH STATEMENT EXECUTE FUNCTION offboarding_case_changes_reject_change();
