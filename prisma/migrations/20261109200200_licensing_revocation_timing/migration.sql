-- The timing of a revocation and the withdrawal of a reason (qd103-revocation-grace-notice, BR-MF5-04, US-10-07 AC-18, US-07-05 AC-22).
-- A source may ask that the revocation is not done before a day (`not_before`, the grace of a ghost seat) and may give the day it is due
-- (`due_on`); a source may take back its own reason, and a task left with no reason is cancelled as no longer applying. Only a relaxation:
-- every new column is NULL for the rows that exist, the index of the reasons is wider, the guard and the trigger allow one change more.

-- 1. The timing a source gave, on the reason; the task keeps the figures read from the reasons that still stand.
ALTER TABLE "provisioning_tasks"
    ADD COLUMN "due_on" DATE,
    ADD COLUMN "not_before" DATE;

ALTER TABLE "provisioning_task_reasons"
    ADD COLUMN "due_on" DATE,
    ADD COLUMN "not_before" DATE,
    ADD COLUMN "withdrawn_at" TIMESTAMPTZ(3),
    ADD COLUMN "withdrawn_by_app_user_id" UUID,
    ADD COLUMN "withdraw_cause" TEXT;

ALTER TABLE "provisioning_task_reasons"
    ADD CONSTRAINT "provisioning_task_reasons_withdrawal_pair" CHECK (("withdrawn_at" IS NULL) = ("withdraw_cause" IS NULL)),
    ADD CONSTRAINT "provisioning_task_reasons_timing_order" CHECK (
        "not_before" IS NULL OR "due_on" IS NULL OR "not_before" <= "due_on"
    );

-- 2. A reason that was withdrawn does not stop the same source and reference from asking again on the same task: the uniqueness
-- holds for the reasons that still stand.
DROP INDEX "provisioning_task_reasons_one_per_source_reference";
CREATE UNIQUE INDEX "provisioning_task_reasons_one_per_source_reference"
    ON "provisioning_task_reasons"("task_id", "source", COALESCE("reference_id", '00000000-0000-0000-0000-000000000000'::uuid))
    WHERE "withdrawn_at" IS NULL;

-- 3. A reason is never deleted and never changed, but once: it can be withdrawn (the three columns of the withdrawal written, nothing else).
CREATE OR REPLACE FUNCTION "provisioning_task_reason_reject_change"() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'UPDATE'
       AND OLD."withdrawn_at" IS NULL
       AND NEW."withdrawn_at" IS NOT NULL
       AND NEW."withdraw_cause" IS NOT NULL
       AND (to_jsonb(NEW) - ARRAY['withdrawn_at', 'withdrawn_by_app_user_id', 'withdraw_cause'])
           = (to_jsonb(OLD) - ARRAY['withdrawn_at', 'withdrawn_by_app_user_id', 'withdraw_cause']) THEN
        RETURN NEW;
    END IF;

    RAISE EXCEPTION 'A reason for a revocation is never changed or deleted, but to be withdrawn once'
        USING ERRCODE = '55000', CONSTRAINT = 'provisioning_task_reasons_immutable';
END;
$$ LANGUAGE plpgsql;

-- 4. A revocation that is being worked can end as cancelled when its last reason was withdrawn. The function is rewritten from its own
-- current definition and the migration stops unless the one condition it extends is there exactly once (as 20261029101000 did).
DO $$
DECLARE
    old_definition TEXT;
    anchor CONSTANT TEXT := 'NEW."close_reason" IN (''BENEFICIARY_LEFT'', ''BENEFICIARY_TRANSFERRED'')';
BEGIN
    old_definition := pg_get_functiondef(to_regproc('provisioning_task_transition_guard'));
    IF old_definition IS NULL
       OR (length(old_definition) - length(replace(old_definition, anchor, ''))) / length(anchor) <> 1 THEN
        RAISE EXCEPTION 'provisioning_task_transition_guard is not in the shape this migration extends';
    END IF;
    EXECUTE replace(
        old_definition,
        anchor,
        '(' || anchor || ' OR (NEW."close_reason" = ''NO_LONGER_APPLIES'' AND NEW."kind"::text = ''REVOKE''))'
    );
END
$$;
