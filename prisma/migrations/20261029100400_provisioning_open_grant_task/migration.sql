-- One OPEN grant task per assignment; hand-off needs no evidence (g0-g6-final-business-baseline-remediation, Task 1.5; F07,
-- F08; spec E). Both rules only RELAX what the previous release already satisfies, so the compatibility image keeps working
-- on this schema: it writes at most one grant task per assignment (still unique among the open ones) and, when it hands a
-- task off, it still writes the three hand-off columns together (the new rule asks only that the person and the moment go
-- together).

-- 1. A grant task is unique among the OPEN ones of its assignment (a task that ended — completed, closed as failed,
-- cancelled — no longer blocks the next one), instead of unique for the whole life of the assignment.
DROP INDEX "provisioning_tasks_one_grant_per_assignment";
CREATE UNIQUE INDEX "provisioning_tasks_one_open_grant_per_assignment" ON "provisioning_tasks"("assignment_id")
    WHERE "kind" = 'GRANT' AND "status" NOT IN ('COMPLETED', 'CLOSED_FAILED', 'CANCELLED');

-- 2a. A task handed off to the manual channel goes back to `QUEUED` and keeps the last error, the kind and the reason of the
-- failure, and the attempts (spec E, F08): the QUEUED branch of `provisioning_tasks_status_columns` no longer forces
-- `failure_kind` and `failure_reason` to NULL (it asks only that the two come together). Only that one branch is relaxed; the
-- constraint is rewritten from its own current definition and the migration stops if the branch is not where it is expected.
DO $$
DECLARE
    old_definition TEXT;
    new_definition TEXT;
BEGIN
    SELECT pg_get_constraintdef(c."oid") INTO old_definition
      FROM pg_constraint c WHERE c."conrelid" = 'provisioning_tasks'::regclass AND c."conname" = 'provisioning_tasks_status_columns';
    -- The QUEUED branch is the first of the constraint; its two terms are the first occurrence of this pair.
    new_definition := regexp_replace(old_definition, '\(failure_reason IS NULL\) AND \(failure_kind IS NULL\)',
                                     '((failure_kind IS NULL) = (failure_reason IS NULL))');
    IF old_definition IS NULL OR new_definition = old_definition OR position('QUEUED' IN old_definition) > position('RETRY_SCHEDULED' IN old_definition) THEN
        RAISE EXCEPTION 'provisioning_tasks_status_columns is not in the shape this migration relaxes';
    END IF;
    ALTER TABLE "provisioning_tasks" DROP CONSTRAINT "provisioning_tasks_status_columns";
    EXECUTE 'ALTER TABLE "provisioning_tasks" ADD CONSTRAINT "provisioning_tasks_status_columns" ' || new_definition;
END
$$;

-- 2. Handing a task off to the manual channel no longer carries evidence (it is only a change of channel; the evidence is
-- asked when the manual work completes). `hand_off_evidence` stays, nullable, for the history that has it.
ALTER TABLE "provisioning_tasks" DROP CONSTRAINT "provisioning_tasks_hand_off_whole";
ALTER TABLE "provisioning_tasks" ADD CONSTRAINT "provisioning_tasks_hand_off_whole" CHECK (
    ("handed_off_by_app_user_id" IS NULL) = ("handed_off_at" IS NULL)
);
