-- The rules the one-write renewal at the adjustment point stands on (SBF-20). Forward-only (DB-05): the enum values it uses were added
-- by the migration before. The choices are compared as text so that no constraint here has to name a value added in this very run.

-- The seats the system counted for the next period when the IT Admin recorded the result; null for a case written before.
ALTER TABLE "subscription_renewals" ADD COLUMN "seats_needed" INTEGER;
ALTER TABLE "subscription_renewals"
    ADD CONSTRAINT "subscription_renewals_seats_needed_not_negative" CHECK ("seats_needed" IS NULL OR "seats_needed" >= 0);

-- A reduction and an increase name the new number of seats; a cancellation names none; a renewal as it is may name the number it keeps.
ALTER TABLE "subscription_renewals" DROP CONSTRAINT "subscription_renewals_proposed_quantity_fits";
ALTER TABLE "subscription_renewals"
    ADD CONSTRAINT "subscription_renewals_proposed_quantity_fits" CHECK (
        ("proposed_choice"::text NOT IN ('REDUCE', 'INCREASE') OR "proposed_quantity" IS NOT NULL)
        AND ("proposed_choice"::text <> 'CANCEL' OR "proposed_quantity" IS NULL)
        AND ("proposed_quantity" IS NULL OR "proposed_quantity" >= 0)
    );
ALTER TABLE "subscription_renewals" DROP CONSTRAINT "subscription_renewals_decided_quantity_fits";
ALTER TABLE "subscription_renewals"
    ADD CONSTRAINT "subscription_renewals_decided_quantity_fits" CHECK (
        "decided_choice" IS NULL
        OR (("decided_choice"::text NOT IN ('REDUCE', 'INCREASE') OR "decided_quantity" IS NOT NULL)
            AND ("decided_choice"::text <> 'CANCEL' OR "decided_quantity" IS NULL)
            AND ("decided_quantity" IS NULL OR "decided_quantity" >= 0))
    );

-- The IT Admin in charge decides alone at the adjustment point (QĐ-103e); the roles of before stay valid for the cases already decided.
ALTER TABLE "subscription_renewals" DROP CONSTRAINT "subscription_renewals_decider_role";
ALTER TABLE "subscription_renewals"
    ADD CONSTRAINT "subscription_renewals_decider_role" CHECK (
        "decider_role" IS NULL
        OR "decider_role" IN ('SPENDING_APPROVER', 'CONFLICT_SUBSTITUTE', 'OWNER_DEPARTMENT_HEAD', 'IT_ADMIN_IN_CHARGE')
    );

-- One live case per (subscription, period) instead of one per subscription: a monthly pack keeps the same row for many months.
DROP INDEX "subscription_renewals_one_live_per_subscription";
CREATE UNIQUE INDEX "subscription_renewals_one_live_per_period"
    ON "subscription_renewals"("subscription_id", "notice_base_date") WHERE "state" <> 'STALE';

-- A proposal that waits for the head of the department no longer has anyone to confirm it: close it as out of date (PROPOSED to STALE is
-- a move the guard allows). Cases already DECIDED or with their outcome recorded stay as they are.
DO $$
DECLARE
    closed INTEGER;
BEGIN
    UPDATE "subscription_renewals" SET "state" = 'STALE' WHERE "state" = 'PROPOSED';
    GET DIAGNOSTICS closed = ROW_COUNT;
    RAISE NOTICE 'subscription_renewals: % proposal(s) waiting for confirmation closed as STALE', closed;
END
$$;
