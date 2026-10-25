-- The moment a request entered the queue of the head for submission (US-05-09 AC-11, FR-3.21): the clock of the reminder of a
-- request that waits to be sent on as spend, and the measure of the wait of the queue (US-05-15). The database keeps it, because a
-- request is put in the queue in four places (the insert, the new state, the price, the registration) and one that forgot would
-- make a reminder wrong.

-- AlterTable
ALTER TABLE "access_requests" ADD COLUMN "spend_queued_at" TIMESTAMPTZ(3);

-- A request that is in the queue already entered it when it last changed: nothing recorded when before this column.
UPDATE "access_requests" SET "spend_queued_at" = "updated_at" WHERE "state" = 'AWAITING_SPEND_SUBMISSION';

-- Entering the queue starts a wait (a new row in the queue, or a state that was another one); staying keeps it; leaving does not
-- clear it, so the wait of a request that has gone on can still be measured, and entering again starts a new wait.
CREATE FUNCTION access_requests_queue_clock() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."state" = 'AWAITING_SPEND_SUBMISSION' AND (TG_OP = 'INSERT' OR OLD."state" IS DISTINCT FROM NEW."state") THEN
    NEW."spend_queued_at" := now();
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER access_requests_queue_clock
  BEFORE INSERT OR UPDATE OF "state" ON "access_requests"
  FOR EACH ROW EXECUTE FUNCTION access_requests_queue_clock();

-- The sweep of the reminders reads the open steps oldest first and the queue oldest first; both are small sets of a large table.
CREATE INDEX "access_request_steps_open_created_at_idx"
    ON "access_request_steps" ("created_at", "id")
    WHERE "state" IN ('PENDING', 'WAITING');

CREATE INDEX "access_requests_spend_queue_idx"
    ON "access_requests" ("spend_queued_at", "id")
    WHERE "state" = 'AWAITING_SPEND_SUBMISSION';
