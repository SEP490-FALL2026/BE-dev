-- The lines a provisioning task may follow (g4-provisioning-queue-manual, g4-provisioning-failure-handling): the status and
-- the columns already say the same thing in each state, and a completed task or one closed as failed never changes. This
-- adds the last rule: which state may follow which. The application takes these lines only; the database now refuses any
-- other, whoever the writer is, so a task cannot be completed without being taken, closed without having failed, or put
-- back in the queue by anything but a decision on its failure.
--
--   QUEUED          -> IN_PROGRESS (taken), RETRY_SCHEDULED or FAILED (the connector reported a failed try)
--   IN_PROGRESS     -> COMPLETED, FAILED, RETRY_SCHEDULED
--   RETRY_SCHEDULED -> FAILED (the last try failed, or the failure is permanent); a further failed try keeps the state
--   FAILED          -> QUEUED (try again, or hand to a person), CLOSED_FAILED (close it)
--
-- A task waiting for its retry returns to the queue when the retry is due; that line belongs to the connector work and is
-- added by the migration that brings it.

CREATE FUNCTION "provisioning_task_transition_guard"() RETURNS trigger AS $$
BEGIN
    IF NEW."status" <> OLD."status" AND NOT (
        (OLD."status"::text, NEW."status"::text) IN (
            ('QUEUED', 'IN_PROGRESS'),
            ('QUEUED', 'RETRY_SCHEDULED'),
            ('QUEUED', 'FAILED'),
            ('IN_PROGRESS', 'COMPLETED'),
            ('IN_PROGRESS', 'FAILED'),
            ('IN_PROGRESS', 'RETRY_SCHEDULED'),
            ('RETRY_SCHEDULED', 'FAILED'),
            ('FAILED', 'QUEUED'),
            ('FAILED', 'CLOSED_FAILED')
        )
    ) THEN
        RAISE EXCEPTION 'A provisioning task cannot go from % to %', OLD."status", NEW."status"
            USING ERRCODE = '55000', CONSTRAINT = 'provisioning_task_transition';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "provisioning_tasks_transition"
    BEFORE UPDATE ON "provisioning_tasks"
    FOR EACH ROW EXECUTE FUNCTION "provisioning_task_transition_guard"();
