-- The most tries a task gets are fixed when the task is made (g4-provisioning-failure-handling, US-01-04 AC-13): an
-- operating parameter changed later reaches only the tasks made after it. A task is tried once and retried
-- `PROVISIONING_RETRY_COUNT` times (0 to 10), so it gets 1 to 11 tries.

-- AlterTable
ALTER TABLE "provisioning_tasks" ADD COLUMN "max_attempts" INTEGER;

-- A task made before this migration keeps the retries the organization had set then (the current value, or the default 3).
UPDATE "provisioning_tasks" AS t
   SET "max_attempts" = COALESCE(
       (SELECT (p."value" #>> '{}')::INTEGER
          FROM "parameter_values" AS p
         WHERE p."organization_id" = t."organization_id"
           AND p."key" = 'PROVISIONING_RETRY_COUNT'
           AND p."valid_to" IS NULL
         ORDER BY p."valid_from" DESC
         LIMIT 1),
       3) + 1;

ALTER TABLE "provisioning_tasks" ALTER COLUMN "max_attempts" SET NOT NULL;
ALTER TABLE "provisioning_tasks"
    ADD CONSTRAINT "provisioning_tasks_max_attempts_range" CHECK ("max_attempts" BETWEEN 1 AND 11);

-- The limit is never changed after the task is made, whatever the writer.
CREATE OR REPLACE FUNCTION "provisioning_task_guard"() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'A provisioning task is never deleted'
            USING ERRCODE = '55000', CONSTRAINT = 'provisioning_task_kept';
    END IF;
    IF OLD."status" IN ('COMPLETED', 'CLOSED_FAILED') THEN
        RAISE EXCEPTION 'A task that is completed or closed as failed is never changed'
            USING ERRCODE = '55000', CONSTRAINT = 'provisioning_task_final';
    END IF;
    IF NEW."max_attempts" IS DISTINCT FROM OLD."max_attempts" THEN
        RAISE EXCEPTION 'The most tries of a task are fixed when it is made'
            USING ERRCODE = '55000', CONSTRAINT = 'provisioning_task_max_attempts_fixed';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
