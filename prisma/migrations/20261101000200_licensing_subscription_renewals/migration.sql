-- The renewal of a subscription period (EP-11, MF-4): the proposal of the IT Admin, the decision of the person who decides
-- spending, the outcome recorded with the vendor, the seats chosen for revocation when reducing below the seats in use, and
-- what became of a period whose milestone passed without a decision. A decision never writes a budget commitment (QĐ-62s):
-- nothing here refers to the budgets.

-- CreateEnum
CREATE TYPE "RenewalChoice" AS ENUM ('RENEW', 'REDUCE', 'CANCEL');
CREATE TYPE "RenewalState" AS ENUM ('PROPOSED', 'DECIDED', 'OUTCOME_RECORDED');
CREATE TYPE "RenewalExecutionPoint" AS ENUM ('AS_PLANNED', 'MID_TERM', 'NEXT_RENEWAL');
CREATE TYPE "RenewalOutcome" AS ENUM ('AS_DECIDED', 'VENDOR_REFUSED', 'DIFFERENT', 'UNCONFIRMED');
CREATE TYPE "RenewalNoticeBasis" AS ENUM ('DECLARED', 'INFERRED_UNCONFIRMED', 'BY_END_DATE');
CREATE TYPE "RenewalDeadlineOutcome" AS ENUM ('AUTO_RENEWAL_INCIDENT', 'EXPIRY_MARKED');

-- CreateTable
CREATE TABLE "subscription_renewals" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "state" "RenewalState" NOT NULL DEFAULT 'PROPOSED',
    "notice_basis" "RenewalNoticeBasis" NOT NULL,
    "notice_base_date" DATE NOT NULL,
    "proposed_choice" "RenewalChoice" NOT NULL,
    "proposed_quantity" INTEGER,
    "proposal_note" TEXT,
    "business_owner_opinion" TEXT,
    "proposed_by_employee_id" UUID NOT NULL,
    "proposed_by_app_user_id" UUID NOT NULL,
    "proposed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_choice" "RenewalChoice",
    "decided_quantity" INTEGER,
    "decision_reason" TEXT,
    "decided_by_employee_id" UUID,
    "decided_by_app_user_id" UUID,
    "decider_role" TEXT,
    "decided_at" TIMESTAMPTZ(3),
    "decided_on" DATE,
    "decided_after_deadline" BOOLEAN,
    "execution_point" "RenewalExecutionPoint",
    "active_seats_at_decision" INTEGER,
    "decision_snapshot" JSONB,
    "late_flagged_at" TIMESTAMPTZ(3),
    "outcome" "RenewalOutcome",
    "outcome_note" TEXT,
    "outcome_recorded_by_employee_id" UUID,
    "outcome_recorded_by_app_user_id" UUID,
    "outcome_recorded_at" TIMESTAMPTZ(3),
    "vendor_follow_up_open" BOOLEAN NOT NULL DEFAULT false,
    "next_subscription_id" UUID,
    "realised_savings_minor" BIGINT,
    "realised_savings_currency" CHAR(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_renewals_pkey" PRIMARY KEY ("id"),
    -- A reduction names the new number of seats; a renewal as it is and a cancellation name none.
    CONSTRAINT "subscription_renewals_proposed_quantity_fits" CHECK (
        ("proposed_choice" = 'REDUCE') = ("proposed_quantity" IS NOT NULL)
        AND ("proposed_quantity" IS NULL OR "proposed_quantity" >= 0)
    ),
    CONSTRAINT "subscription_renewals_decided_quantity_fits" CHECK (
        "decided_choice" IS NULL
        OR (("decided_choice" = 'REDUCE') = ("decided_quantity" IS NOT NULL)
            AND ("decided_quantity" IS NULL OR "decided_quantity" >= 0))
    ),
    -- The decision is written whole, once the case left PROPOSED, by one of the two roles that decide spending.
    CONSTRAINT "subscription_renewals_decision_whole" CHECK (
        ("state" = 'PROPOSED') = ("decided_choice" IS NULL)
        AND ("decided_choice" IS NULL) = ("decided_by_employee_id" IS NULL)
        AND ("decided_choice" IS NULL) = ("decided_by_app_user_id" IS NULL)
        AND ("decided_choice" IS NULL) = ("decider_role" IS NULL)
        AND ("decided_choice" IS NULL) = ("decided_at" IS NULL)
        AND ("decided_choice" IS NULL) = ("decided_on" IS NULL)
        AND ("decided_choice" IS NULL) = ("decided_after_deadline" IS NULL)
        AND ("decided_choice" IS NULL) = ("execution_point" IS NULL)
        AND ("decided_choice" IS NULL) = ("active_seats_at_decision" IS NULL)
        AND ("decided_choice" IS NULL) = ("decision_snapshot" IS NULL)
        AND ("decided_quantity" IS NULL OR "decided_choice" IS NOT NULL)
        AND ("decision_reason" IS NULL OR "decided_choice" IS NOT NULL)
    ),
    CONSTRAINT "subscription_renewals_decider_role" CHECK (
        "decider_role" IS NULL OR "decider_role" IN ('SPENDING_APPROVER', 'CONFLICT_SUBSTITUTE')
    ),
    CONSTRAINT "subscription_renewals_outcome_whole" CHECK (
        ("state" = 'OUTCOME_RECORDED') = ("outcome" IS NOT NULL)
        AND ("outcome" IS NULL) = ("outcome_recorded_by_employee_id" IS NULL)
        AND ("outcome" IS NULL) = ("outcome_recorded_by_app_user_id" IS NULL)
        AND ("outcome" IS NULL) = ("outcome_recorded_at" IS NULL)
        AND ("outcome_note" IS NULL OR "outcome" IS NOT NULL)
        AND ("next_subscription_id" IS NULL OR "outcome" IS NOT NULL)
        AND (NOT "vendor_follow_up_open" OR ("outcome" IS NOT NULL AND "outcome" <> 'AS_DECIDED'))
    ),
    -- Savings exist only for an outcome the vendor confirmed as decided, with a new period that costs less (QĐ-66w).
    CONSTRAINT "subscription_renewals_savings_from_outcome" CHECK (
        ("realised_savings_minor" IS NULL) = ("realised_savings_currency" IS NULL)
        AND ("realised_savings_minor" IS NULL
             OR ("realised_savings_minor" > 0 AND "outcome" = 'AS_DECIDED' AND "next_subscription_id" IS NOT NULL))
    ),
    CONSTRAINT "subscription_renewals_late_needs_decision" CHECK ("late_flagged_at" IS NULL OR "decided_choice" IS NOT NULL),
    CONSTRAINT "subscription_renewals_next_not_self" CHECK (
        "next_subscription_id" IS NULL OR "next_subscription_id" <> "subscription_id"
    ),
    CONSTRAINT "subscription_renewals_texts_not_blank" CHECK (
        ("proposal_note" IS NULL OR length(btrim("proposal_note")) > 0)
        AND ("business_owner_opinion" IS NULL OR length(btrim("business_owner_opinion")) > 0)
        AND ("decision_reason" IS NULL OR length(btrim("decision_reason")) > 0)
        AND ("outcome_note" IS NULL OR length(btrim("outcome_note")) > 0)
    )
);

-- CreateTable
CREATE TABLE "subscription_renewal_released_seats" (
    "renewal_id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "rank_group" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "subscription_renewal_released_seats_pkey" PRIMARY KEY ("renewal_id","assignment_id"),
    CONSTRAINT "subscription_renewal_released_seats_group" CHECK (
        "rank_group" IN ('REVOCATION_DECIDED', 'HOLDER_LEFT', 'USAGE_FLAGGED', 'OTHER')
    ),
    CONSTRAINT "subscription_renewal_released_seats_position" CHECK ("position" >= 1)
);

-- CreateTable
CREATE TABLE "subscription_deadline_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "kind" "RenewalDeadlineOutcome" NOT NULL,
    "notice_base_date" DATE NOT NULL,
    "auto_renew_at_time" BOOLEAN NOT NULL,
    "recorded_on" DATE NOT NULL,
    "recorded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_deadline_events_pkey" PRIMARY KEY ("id"),
    -- An incident only for a period that renews itself, a mark of its end only for one that does not (US-11-04 AC-1, AC-4).
    CONSTRAINT "subscription_deadline_events_kind_fits" CHECK (
        ("kind" = 'AUTO_RENEWAL_INCIDENT') = "auto_renew_at_time"
    ),
    CONSTRAINT "subscription_deadline_events_after_milestone" CHECK ("recorded_on" > "notice_base_date")
);

-- CreateIndex
CREATE UNIQUE INDEX "subscription_renewals_subscription_id_key" ON "subscription_renewals"("subscription_id");
CREATE UNIQUE INDEX "subscription_renewals_next_subscription_id_key" ON "subscription_renewals"("next_subscription_id");
CREATE INDEX "subscription_renewals_state_notice_base_date_idx" ON "subscription_renewals"("state", "notice_base_date");
CREATE INDEX "subscription_renewal_released_seats_assignment_id_idx" ON "subscription_renewal_released_seats"("assignment_id");
CREATE UNIQUE INDEX "subscription_deadline_events_subscription_id_key" ON "subscription_deadline_events"("subscription_id");
CREATE INDEX "subscription_deadline_events_kind_recorded_on_idx" ON "subscription_deadline_events"("kind", "recorded_on");

-- AddForeignKey
ALTER TABLE "subscription_renewals" ADD CONSTRAINT "subscription_renewals_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "subscription_renewals" ADD CONSTRAINT "subscription_renewals_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "subscription_renewals" ADD CONSTRAINT "subscription_renewals_next_subscription_id_fkey" FOREIGN KEY ("next_subscription_id") REFERENCES "subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "subscription_renewal_released_seats" ADD CONSTRAINT "subscription_renewal_released_seats_renewal_id_fkey" FOREIGN KEY ("renewal_id") REFERENCES "subscription_renewals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "subscription_renewal_released_seats" ADD CONSTRAINT "subscription_renewal_released_seats_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "license_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "subscription_deadline_events" ADD CONSTRAINT "subscription_deadline_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "subscription_deadline_events" ADD CONSTRAINT "subscription_deadline_events_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A case moves one way and each stage is written once: the proposal never changes, the decision is frozen once written, the
-- outcome once recorded, the late flag once set. Nothing is deleted.
CREATE FUNCTION "subscription_renewals_guard"() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'A subscription renewal is never deleted'
            USING ERRCODE = '55000', CONSTRAINT = 'subscription_renewals_immutable';
    END IF;

    IF (NEW."id", NEW."organization_id", NEW."subscription_id", NEW."notice_basis", NEW."notice_base_date",
        NEW."proposed_choice", NEW."proposed_quantity", NEW."proposal_note", NEW."business_owner_opinion",
        NEW."proposed_by_employee_id", NEW."proposed_by_app_user_id", NEW."proposed_at", NEW."created_at")
       IS DISTINCT FROM
       (OLD."id", OLD."organization_id", OLD."subscription_id", OLD."notice_basis", OLD."notice_base_date",
        OLD."proposed_choice", OLD."proposed_quantity", OLD."proposal_note", OLD."business_owner_opinion",
        OLD."proposed_by_employee_id", OLD."proposed_by_app_user_id", OLD."proposed_at", OLD."created_at") THEN
        RAISE EXCEPTION 'The proposal of a renewal never changes'
            USING ERRCODE = '55000', CONSTRAINT = 'subscription_renewals_proposal_is_final';
    END IF;

    IF (OLD."state" = 'PROPOSED' AND NEW."state" NOT IN ('PROPOSED', 'DECIDED'))
       OR (OLD."state" = 'DECIDED' AND NEW."state" NOT IN ('DECIDED', 'OUTCOME_RECORDED'))
       OR (OLD."state" = 'OUTCOME_RECORDED' AND NEW."state" <> 'OUTCOME_RECORDED') THEN
        RAISE EXCEPTION 'A renewal moves one way: proposed, decided, outcome recorded'
            USING ERRCODE = '55000', CONSTRAINT = 'subscription_renewals_one_way';
    END IF;

    IF OLD."state" <> 'PROPOSED'
       AND (NEW."decided_choice", NEW."decided_quantity", NEW."decision_reason", NEW."decided_by_employee_id",
            NEW."decided_by_app_user_id", NEW."decider_role", NEW."decided_at", NEW."decided_on",
            NEW."decided_after_deadline", NEW."execution_point", NEW."active_seats_at_decision", NEW."decision_snapshot")
           IS DISTINCT FROM
           (OLD."decided_choice", OLD."decided_quantity", OLD."decision_reason", OLD."decided_by_employee_id",
            OLD."decided_by_app_user_id", OLD."decider_role", OLD."decided_at", OLD."decided_on",
            OLD."decided_after_deadline", OLD."execution_point", OLD."active_seats_at_decision", OLD."decision_snapshot") THEN
        RAISE EXCEPTION 'A recorded decision of a renewal never changes'
            USING ERRCODE = '55000', CONSTRAINT = 'subscription_renewals_decision_is_final';
    END IF;

    IF OLD."state" = 'OUTCOME_RECORDED'
       AND (NEW."outcome", NEW."outcome_note", NEW."outcome_recorded_by_employee_id", NEW."outcome_recorded_by_app_user_id",
            NEW."outcome_recorded_at", NEW."vendor_follow_up_open", NEW."next_subscription_id",
            NEW."realised_savings_minor", NEW."realised_savings_currency")
           IS DISTINCT FROM
           (OLD."outcome", OLD."outcome_note", OLD."outcome_recorded_by_employee_id", OLD."outcome_recorded_by_app_user_id",
            OLD."outcome_recorded_at", OLD."vendor_follow_up_open", OLD."next_subscription_id",
            OLD."realised_savings_minor", OLD."realised_savings_currency") THEN
        RAISE EXCEPTION 'A recorded outcome of a renewal never changes'
            USING ERRCODE = '55000', CONSTRAINT = 'subscription_renewals_outcome_is_final';
    END IF;

    IF OLD."late_flagged_at" IS NOT NULL AND NEW."late_flagged_at" IS DISTINCT FROM OLD."late_flagged_at" THEN
        RAISE EXCEPTION 'The late flag of a renewal is set once and kept'
            USING ERRCODE = '55000', CONSTRAINT = 'subscription_renewals_late_is_final';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "subscription_renewals_guard"
    BEFORE UPDATE OR DELETE ON "subscription_renewals"
    FOR EACH ROW EXECUTE FUNCTION "subscription_renewals_guard"();

-- The seats chosen with a decision and the events of a passed milestone are facts: written once, never changed or deleted.
CREATE FUNCTION "subscription_renewal_facts_reject_change"() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'A recorded fact of a renewal is never changed or deleted'
        USING ERRCODE = '55000', CONSTRAINT = TG_TABLE_NAME || '_immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "subscription_renewal_released_seats_immutable"
    BEFORE UPDATE OR DELETE ON "subscription_renewal_released_seats"
    FOR EACH ROW EXECUTE FUNCTION "subscription_renewal_facts_reject_change"();

CREATE TRIGGER "subscription_deadline_events_immutable"
    BEFORE UPDATE OR DELETE ON "subscription_deadline_events"
    FOR EACH ROW EXECUTE FUNCTION "subscription_renewal_facts_reject_change"();

-- A seat carried to the period that renews its subscription names the seat it continues (QĐ-35c), like a handover; the rest
-- of the rule is the latest definition (20261024090200).
ALTER TABLE "license_assignments" DROP CONSTRAINT "license_assignments_handover_names_predecessor";
ALTER TABLE "license_assignments"
    ADD CONSTRAINT "license_assignments_handover_names_predecessor" CHECK (
        ("source" = 'HANDOVER' AND "predecessor_id" IS NOT NULL)
        OR ("source" = 'REQUEST')
        OR ("source" = 'BASELINE' AND "predecessor_id" IS NULL)
        OR ("source" = 'RENEWAL_CARRY' AND "predecessor_id" IS NOT NULL)
    );
