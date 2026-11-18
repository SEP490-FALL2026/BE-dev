-- A proposal that went out of date ends in the state STALE (A-H2): it keeps its proposal, has no decision, and no longer holds the
-- period, so the IT Admin proposes again and the period has a live case (PROPOSED, DECIDED or OUTCOME_RECORDED) at most once.

-- No decision exists for a case that is still PROPOSED or that was closed as STALE.
ALTER TABLE "subscription_renewals" DROP CONSTRAINT "subscription_renewals_decision_whole";
ALTER TABLE "subscription_renewals"
    ADD CONSTRAINT "subscription_renewals_decision_whole" CHECK (
        ("state" IN ('PROPOSED', 'STALE')) = ("decided_choice" IS NULL)
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
    );

-- One live case per period: a STALE one does not count.
DROP INDEX "subscription_renewals_subscription_id_key";
CREATE UNIQUE INDEX "subscription_renewals_one_live_per_subscription"
    ON "subscription_renewals"("subscription_id") WHERE "state" <> 'STALE';
CREATE INDEX "subscription_renewals_subscription_id_idx" ON "subscription_renewals"("subscription_id");

-- The only new move: PROPOSED to STALE, and STALE is final (the rest of the guard is the one of 20261101000200).
CREATE OR REPLACE FUNCTION "subscription_renewals_guard"() RETURNS trigger AS $$
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

    IF (OLD."state" = 'PROPOSED' AND NEW."state" NOT IN ('PROPOSED', 'DECIDED', 'STALE'))
       OR (OLD."state" = 'DECIDED' AND NEW."state" NOT IN ('DECIDED', 'OUTCOME_RECORDED'))
       OR (OLD."state" = 'OUTCOME_RECORDED' AND NEW."state" <> 'OUTCOME_RECORDED')
       OR (OLD."state" = 'STALE' AND NEW."state" <> 'STALE') THEN
        RAISE EXCEPTION 'A renewal moves one way: proposed, decided, outcome recorded (or closed as out of date from proposed)'
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
