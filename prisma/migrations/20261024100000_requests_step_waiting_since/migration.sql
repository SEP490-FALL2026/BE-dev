-- When a step began to wait for somebody who can hold it (US-05-11, US-05-12). The database keeps the column in step with
-- the state, because a waiting step is made in three places (the request, the review and spend step, the IT assessment) and
-- changed in one more (the new assignment of a step): a rule that lives in four services is a rule one of them forgets.

-- AlterTable
ALTER TABLE "access_request_steps" ADD COLUMN "waiting_since" TIMESTAMPTZ(3);

-- A step that already waits began to wait when it was made: nothing moved it in or out of waiting before this column.
UPDATE "access_request_steps" SET "waiting_since" = "created_at" WHERE "state" = 'WAITING';

-- A step waits exactly while it has a moment it began to wait.
ALTER TABLE "access_request_steps"
    ADD CONSTRAINT "access_request_steps_waiting_since_check" CHECK (("state" = 'WAITING') = ("waiting_since" IS NOT NULL));

-- Entering WAITING starts a stretch of waiting (the creation time for a step made waiting, now for a step that was held),
-- staying in WAITING keeps it, and leaving WAITING ends it.
CREATE FUNCTION access_request_steps_waiting_since() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."state" <> 'WAITING' THEN
    NEW."waiting_since" := NULL;
  ELSIF TG_OP = 'INSERT' THEN
    NEW."waiting_since" := COALESCE(NEW."created_at", now());
  ELSIF OLD."state" = 'WAITING' THEN
    NEW."waiting_since" := OLD."waiting_since";
  ELSE
    NEW."waiting_since" := now();
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER access_request_steps_waiting_since
  BEFORE INSERT OR UPDATE ON "access_request_steps"
  FOR EACH ROW EXECUTE FUNCTION access_request_steps_waiting_since();
