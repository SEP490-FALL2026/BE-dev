-- The projection of the audit events of a request into the inbox (US-05-15) and the moment the grant of a request was done
-- (US-05-15 AC-6, AC-11).

-- When the task of the grant was completed, written by the grant gate in the transaction that moves the request to COMPLETED.
-- AlterTable
ALTER TABLE "access_requests" ADD COLUMN "grant_completed_at" TIMESTAMPTZ(3);

-- Only a request whose grant is done has the moment (development data only: nothing that ran before kept it, so the last
-- change of the request stands in for it; a renewal has no grant).
UPDATE "access_requests" SET "grant_completed_at" = "updated_at" WHERE "state" = 'COMPLETED' AND "type" <> 'RENEWAL';

ALTER TABLE "access_requests"
    ADD CONSTRAINT "access_requests_grant_completed_at_check"
    CHECK ("grant_completed_at" IS NULL OR "state" = 'COMPLETED');

-- CreateTable
CREATE TABLE "request_status_cursor" (
    "name" TEXT NOT NULL,
    "last_occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "last_event_id" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "request_status_cursor_pkey" PRIMARY KEY ("name"),
    CONSTRAINT "request_status_cursor_name_check" CHECK ("name" = 'REQUEST_STATUS')
);

-- The one cursor starts at the moment of the deployment: what happened before is not told (no notice is made for history).
INSERT INTO "request_status_cursor" ("name", "last_occurred_at", "last_event_id")
VALUES ('REQUEST_STATUS', date_trunc('milliseconds', now()), '00000000-0000-0000-0000-000000000000');

-- The cursor is never deleted: a pass would start again from the beginning of the trail and tell everybody everything twice.
CREATE FUNCTION request_status_cursor_reject_delete() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'request_status_cursor is never deleted (% rejected)', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER request_status_cursor_no_delete
  BEFORE DELETE ON "request_status_cursor"
  FOR EACH ROW EXECUTE FUNCTION request_status_cursor_reject_delete();

CREATE TRIGGER request_status_cursor_no_truncate
  BEFORE TRUNCATE ON "request_status_cursor"
  FOR EACH STATEMENT EXECUTE FUNCTION request_status_cursor_reject_delete();
