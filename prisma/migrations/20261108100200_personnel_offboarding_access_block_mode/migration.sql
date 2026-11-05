-- M09 (QĐ-96c, Q-04 B): the mode of a departure is the way its access is blocked, not whether it was sudden. `access_block_mode` replaces
-- `abrupt`: WITH_LAST_DAY blocks from the day after the last working day, BLOCK_NOW blocks from the day it is recorded, and a BLOCK_NOW
-- case can have a last working day ahead (it is HANDING_OVER until then). The order matters: the column and its values first, then the guard
-- that read `abrupt`, then the checks that read it, and only then the column goes. DROP COLUMN cannot be undone (DB-05).

-- (a) the column, filled from the old one.
CREATE TYPE "OffboardingAccessBlockMode" AS ENUM ('WITH_LAST_DAY', 'BLOCK_NOW');
ALTER TABLE "offboarding_cases" ADD COLUMN "access_block_mode" "OffboardingAccessBlockMode" NOT NULL DEFAULT 'WITH_LAST_DAY';
UPDATE "offboarding_cases" SET "access_block_mode" = 'BLOCK_NOW' WHERE "abrupt";

-- (b) the guard: the mode, like the old flag, never changes after the case is written. The function is rewritten from its current
-- definition, and the migration stops if the line it replaces is not there exactly once.
DO $$
DECLARE
    old_definition TEXT;
    new_definition TEXT;
    anchor TEXT := 'NEW."abrupt" IS DISTINCT FROM OLD."abrupt"';
BEGIN
    old_definition := pg_get_functiondef(to_regproc('offboarding_cases_guard'));
    IF old_definition IS NULL
       OR (length(old_definition) - length(replace(old_definition, anchor, ''))) / length(anchor) <> 1 THEN
        RAISE EXCEPTION 'offboarding_cases_guard is not in the shape this migration rewrites';
    END IF;
    new_definition := replace(old_definition, anchor, 'NEW."access_block_mode" IS DISTINCT FROM OLD."access_block_mode"');
    EXECUTE new_definition;
END
$$;

-- (c) the checks: a case blocked now has no handover to confirm (its hold is counted from the day it is recorded); one blocked from the
-- last day has. A case blocked now can be HANDING_OVER, so the check that made an abrupt one LEFT goes.
ALTER TABLE "offboarding_cases" DROP CONSTRAINT "offboarding_cases_due_for_planned_only_check";
ALTER TABLE "offboarding_cases" DROP CONSTRAINT "offboarding_cases_abrupt_is_left_check";
ALTER TABLE "offboarding_cases" ADD CONSTRAINT "offboarding_cases_due_for_planned_only_check"
    CHECK (("access_block_mode" = 'BLOCK_NOW') = ("handover_due_on" IS NULL));

-- (d) the old column. Not reversible.
ALTER TABLE "offboarding_cases" DROP COLUMN "abrupt";
