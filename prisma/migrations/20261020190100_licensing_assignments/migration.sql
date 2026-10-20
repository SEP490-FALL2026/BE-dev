-- The assignments of seats (g4-seat-baseline-import, US-02-05, INV-01, INV-02, INV-07): one seat held by one person on one
-- subscription, or on one internal plan that has no subscription, over the half-open period [valid_from, valid_until)
-- where a null valid_until is open. Seats are never materialized (ADR-02): a free seat is the number bought minus the
-- assignments occupying a day. The database holds the invariants so that no writer can break them: INV-01 (the seats
-- taken never exceed the seats bought), INV-02 (one person is not on one subscription twice at once), INV-07 (time-limited
-- staff have an expected end date), one account identifier per subscription at a time, and a closed baseline takes no
-- baseline row. Nothing is deleted; only when an assignment ends and when it is expected to end may change.

-- CreateEnum
CREATE TYPE "AssignmentKind" AS ENUM ('PERSONAL', 'SERVICE');
CREATE TYPE "AssignmentSource" AS ENUM ('BASELINE', 'HANDOVER', 'REQUEST');
CREATE TYPE "AssignmentDateBasis" AS ENUM ('ACTUAL', 'RECORDED');

-- CreateTable
CREATE TABLE "license_assignments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "kind" "AssignmentKind" NOT NULL,
    "source" "AssignmentSource" NOT NULL,
    "plan_id" UUID NOT NULL,
    "subscription_id" UUID,
    -- The person who holds the seat, or who answers for a service account.
    "employee_id" UUID NOT NULL,
    "account_identifier" TEXT NOT NULL,
    "normalized_account_identifier" TEXT NOT NULL,
    "reason" TEXT,
    "cost_center_id" UUID,
    "valid_from" DATE NOT NULL,
    "valid_from_basis" "AssignmentDateBasis" NOT NULL,
    "valid_until" DATE,
    "expected_end_date" DATE,
    "predecessor_id" UUID,
    "baseline_import_id" UUID,
    -- A value, not a foreign key: the history outlives the account (as the audit trail does).
    "created_by_app_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "license_assignments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "license_assignments_identifier_not_blank" CHECK (
        length(btrim("account_identifier")) > 0 AND length("normalized_account_identifier") > 0
    ),
    CONSTRAINT "license_assignments_reason_not_blank" CHECK ("reason" IS NULL OR length(btrim("reason")) > 0),
    -- A service account says why it exists and is charged to a Cost Center; a personal seat is charged by the department
    -- of whoever holds it when the cost arises (BR-29.3), so it keeps no Cost Center here.
    CONSTRAINT "license_assignments_service_needs_reason_and_cost_center" CHECK (
        "kind" <> 'SERVICE' OR ("reason" IS NOT NULL AND "cost_center_id" IS NOT NULL)
    ),
    CONSTRAINT "license_assignments_personal_has_no_cost_center" CHECK ("kind" <> 'PERSONAL' OR "cost_center_id" IS NULL),
    CONSTRAINT "license_assignments_period_order" CHECK ("valid_until" IS NULL OR "valid_until" > "valid_from"),
    CONSTRAINT "license_assignments_expected_end_order" CHECK (
        "expected_end_date" IS NULL OR "expected_end_date" >= "valid_from"
    ),
    CONSTRAINT "license_assignments_baseline_names_import" CHECK ("source" <> 'BASELINE' OR "baseline_import_id" IS NOT NULL),
    CONSTRAINT "license_assignments_handover_names_predecessor" CHECK (
        ("source" = 'HANDOVER') = ("predecessor_id" IS NOT NULL)
    ),
    CONSTRAINT "license_assignments_predecessor_not_self" CHECK ("predecessor_id" IS NULL OR "predecessor_id" <> "id")
);

CREATE TABLE "seat_baseline_states" (
    "organization_id" UUID NOT NULL,
    "closed_at" TIMESTAMPTZ(3),
    "closed_by_app_user_id" UUID,

    CONSTRAINT "seat_baseline_states_pkey" PRIMARY KEY ("organization_id"),
    CONSTRAINT "seat_baseline_states_closed_by_with_time" CHECK (("closed_at" IS NULL) = ("closed_by_app_user_id" IS NULL))
);

-- CreateIndex
CREATE INDEX "license_assignments_subscription_id_idx" ON "license_assignments"("subscription_id");
CREATE INDEX "license_assignments_plan_id_idx" ON "license_assignments"("plan_id");
CREATE INDEX "license_assignments_employee_id_idx" ON "license_assignments"("employee_id");
CREATE INDEX "license_assignments_baseline_import_id_idx" ON "license_assignments"("baseline_import_id");

-- AddForeignKey
ALTER TABLE "license_assignments" ADD CONSTRAINT "license_assignments_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "license_assignments" ADD CONSTRAINT "license_assignments_plan_id_fkey"
    FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "license_assignments" ADD CONSTRAINT "license_assignments_subscription_id_fkey"
    FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "license_assignments" ADD CONSTRAINT "license_assignments_employee_id_fkey"
    FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "license_assignments" ADD CONSTRAINT "license_assignments_cost_center_id_fkey"
    FOREIGN KEY ("cost_center_id") REFERENCES "cost_centers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "license_assignments" ADD CONSTRAINT "license_assignments_predecessor_id_fkey"
    FOREIGN KEY ("predecessor_id") REFERENCES "license_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "license_assignments" ADD CONSTRAINT "license_assignments_baseline_import_id_fkey"
    FOREIGN KEY ("baseline_import_id") REFERENCES "seat_baseline_imports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "seat_baseline_states" ADD CONSTRAINT "seat_baseline_states_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- INV-02: one person is not on one subscription (or one internal plan) twice at once with a personal seat. A person may
-- hold a personal seat and several service accounts on the same subscription, so only personal rows are compared.
ALTER TABLE "license_assignments"
  ADD CONSTRAINT "license_assignments_personal_no_overlap"
  EXCLUDE USING gist (
    (COALESCE("subscription_id", "plan_id")) WITH =,
    "employee_id" WITH =,
    daterange("valid_from", "valid_until", '[)') WITH &&
  ) WHERE ("kind" = 'PERSONAL');

-- One account identifier names one account on one subscription at a time (QĐ-43c), whoever holds it. The identifier is
-- compared after normalization (trimmed, lower case). Consecutive periods may share it: a change of the responsible
-- person ends one period the day the next begins.
ALTER TABLE "license_assignments"
  ADD CONSTRAINT "license_assignments_identifier_no_overlap"
  EXCLUDE USING gist (
    (COALESCE("subscription_id", "plan_id")) WITH =,
    "normalized_account_identifier" WITH =,
    daterange("valid_from", "valid_until", '[)') WITH &&
  );

-- History: no assignment is deleted, and nothing of it changes but when it ends and when it is expected to end.
CREATE FUNCTION "license_assignment_reject_change"() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'A license assignment is never deleted'
            USING ERRCODE = '55000', CONSTRAINT = 'license_assignments_immutable';
    END IF;

    IF (NEW."id", NEW."organization_id", NEW."kind", NEW."source", NEW."plan_id", NEW."subscription_id",
        NEW."employee_id", NEW."account_identifier", NEW."normalized_account_identifier", NEW."reason",
        NEW."cost_center_id", NEW."valid_from", NEW."valid_from_basis", NEW."predecessor_id",
        NEW."baseline_import_id", NEW."created_by_app_user_id", NEW."created_at")
       IS DISTINCT FROM
       (OLD."id", OLD."organization_id", OLD."kind", OLD."source", OLD."plan_id", OLD."subscription_id",
        OLD."employee_id", OLD."account_identifier", OLD."normalized_account_identifier", OLD."reason",
        OLD."cost_center_id", OLD."valid_from", OLD."valid_from_basis", OLD."predecessor_id",
        OLD."baseline_import_id", OLD."created_by_app_user_id", OLD."created_at") THEN
        RAISE EXCEPTION 'Only when a license assignment ends and when it is expected to end may change'
            USING ERRCODE = '55000', CONSTRAINT = 'license_assignments_immutable';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "license_assignments_immutable"
    BEFORE UPDATE OR DELETE ON "license_assignments"
    FOR EACH ROW EXECUTE FUNCTION "license_assignment_reject_change"();

-- Rules that read other tables: the subscription is a subscription of the plan the row names; INV-07; a closed baseline
-- takes no baseline row.
CREATE FUNCTION "license_assignment_check_rules"() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW."subscription_id" IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM "subscriptions" s WHERE s."id" = NEW."subscription_id" AND s."plan_id" = NEW."plan_id"
        ) THEN
            RAISE EXCEPTION 'The subscription of an assignment belongs to the plan the assignment names'
                USING ERRCODE = '23514', CONSTRAINT = 'license_assignments_subscription_of_plan';
        END IF;

        IF NEW."source" = 'BASELINE' AND EXISTS (
            SELECT 1 FROM "seat_baseline_states" b
             WHERE b."organization_id" = NEW."organization_id" AND b."closed_at" IS NOT NULL
        ) THEN
            RAISE EXCEPTION 'The seat baseline is closed: an assignment without a request is no longer taken'
                USING ERRCODE = '55000', CONSTRAINT = 'license_assignments_baseline_closed';
        END IF;
    END IF;

    IF TG_OP = 'INSERT'
       OR NEW."expected_end_date" IS DISTINCT FROM OLD."expected_end_date"
       OR NEW."employee_id" IS DISTINCT FROM OLD."employee_id" THEN
        IF NEW."expected_end_date" IS NULL AND EXISTS (
            SELECT 1 FROM "employees" e
             WHERE e."id" = NEW."employee_id" AND e."employment_type" IN ('CONTRACTOR', 'FREELANCER', 'INTERN')
        ) THEN
            RAISE EXCEPTION 'A contractor, freelancer or intern needs an expected end date'
                USING ERRCODE = '23514', CONSTRAINT = 'license_assignments_expected_end_required';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "license_assignments_rules"
    BEFORE INSERT OR UPDATE ON "license_assignments"
    FOR EACH ROW EXECUTE FUNCTION "license_assignment_check_rules"();

-- INV-01: on no day do the assignments of a subscription outnumber the seats bought. The row of the subscription is
-- locked first, so writers for one subscription queue whichever way they write; the number of assignments occupying a
-- day is counted on the day the new period starts and on the start of every other assignment inside it, because the
-- count can only rise on a day an assignment starts. A subscription whose number of seats is not known takes none.
CREATE FUNCTION "license_assignment_check_capacity"() RETURNS trigger AS $$
DECLARE
    seats INTEGER;
    peak BIGINT;
BEGIN
    SELECT s."purchased_quantity" INTO seats FROM "subscriptions" s WHERE s."id" = NEW."subscription_id" FOR UPDATE;
    IF seats IS NULL THEN
        RAISE EXCEPTION 'The number of seats of the subscription is not known'
            USING ERRCODE = '23514', CONSTRAINT = 'license_assignments_seat_capacity';
    END IF;

    SELECT COALESCE(MAX(per_day."occupied"), 0) INTO peak FROM (
        SELECT (
            SELECT count(*) FROM "license_assignments" b
             WHERE b."subscription_id" = NEW."subscription_id"
               AND b."valid_from" <= d."day"
               AND (b."valid_until" IS NULL OR d."day" < b."valid_until")
        ) AS "occupied"
        FROM (
            SELECT NEW."valid_from" AS "day"
            UNION
            SELECT a."valid_from"
              FROM "license_assignments" a
             WHERE a."subscription_id" = NEW."subscription_id"
               AND a."valid_from" > NEW."valid_from"
               AND (NEW."valid_until" IS NULL OR a."valid_from" < NEW."valid_until")
        ) d
    ) per_day;

    IF peak > seats THEN
        RAISE EXCEPTION 'The seats of the subscription are all taken: % assignments for % seats', peak, seats
            USING ERRCODE = '23514', CONSTRAINT = 'license_assignments_seat_capacity';
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "license_assignments_capacity_on_insert"
    AFTER INSERT ON "license_assignments"
    FOR EACH ROW WHEN (NEW."subscription_id" IS NOT NULL)
    EXECUTE FUNCTION "license_assignment_check_capacity"();

-- Ending an assignment earlier only frees a seat, so only a period that grows is checked again.
CREATE TRIGGER "license_assignments_capacity_on_extend"
    AFTER UPDATE OF "valid_until" ON "license_assignments"
    FOR EACH ROW WHEN (
        NEW."subscription_id" IS NOT NULL
        AND OLD."valid_until" IS NOT NULL
        AND (NEW."valid_until" IS NULL OR NEW."valid_until" > OLD."valid_until")
    )
    EXECUTE FUNCTION "license_assignment_check_capacity"();

-- Closing the baseline never reopens, and the closed state keeps who closed it and when.
CREATE FUNCTION "seat_baseline_state_reject_change"() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' OR OLD."closed_at" IS NOT NULL THEN
        RAISE EXCEPTION 'A closed seat baseline is never reopened, changed or deleted'
            USING ERRCODE = '55000', CONSTRAINT = 'seat_baseline_states_closed';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "seat_baseline_states_closed_is_final"
    BEFORE UPDATE OR DELETE ON "seat_baseline_states"
    FOR EACH ROW EXECUTE FUNCTION "seat_baseline_state_reject_change"();
