-- Append-only reply notes for resubmissions and head re-submissions after human return (QĐ-114q, QĐ-116f).
-- Reversal SQL (before any reply row is written):
--   DROP TRIGGER IF EXISTS "access_request_replies_immutable" ON "access_request_replies";
--   DROP FUNCTION IF EXISTS "access_request_replies_immutable"();
--   DROP TABLE IF EXISTS "access_request_replies";
--   DROP TYPE IF EXISTS "AccessRequestReplyKind";

-- CreateEnum
CREATE TYPE "AccessRequestReplyKind" AS ENUM ('REQUESTER_RESUBMISSION', 'HEAD_RESUBMISSION');

-- CreateTable
CREATE TABLE "access_request_replies" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "kind" "AccessRequestReplyKind" NOT NULL,
    "returned_step_id" UUID,
    "note" TEXT NOT NULL,
    "author_employee_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "access_request_replies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "access_request_replies_request_id_created_at_id_idx" ON "access_request_replies"("request_id", "created_at" DESC, "id");

-- CreateIndex
CREATE INDEX "access_request_replies_returned_step_id_idx" ON "access_request_replies"("returned_step_id");

-- AddForeignKey
ALTER TABLE "access_request_replies" ADD CONSTRAINT "access_request_replies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_request_replies" ADD CONSTRAINT "access_request_replies_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "access_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_request_replies" ADD CONSTRAINT "access_request_replies_returned_step_id_fkey" FOREIGN KEY ("returned_step_id") REFERENCES "access_request_steps"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_request_replies" ADD CONSTRAINT "access_request_replies_author_employee_id_fkey" FOREIGN KEY ("author_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Non-blank note within 1..1000 trimmed characters. No unique index on returned_step_id; one-reply-per-return is enforced in service logic.
ALTER TABLE "access_request_replies"
    ADD CONSTRAINT "access_request_replies_note_check" CHECK (char_length(btrim("note")) BETWEEN 1 AND 1000);

-- Reply notes are append-only evidence.
CREATE FUNCTION "access_request_replies_immutable"() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'access_request_replies is append-only (% rejected)', TG_OP
        USING ERRCODE = 'restrict_violation', CONSTRAINT = 'access_request_replies_immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "access_request_replies_immutable"
    BEFORE UPDATE OR DELETE ON "access_request_replies"
    FOR EACH ROW EXECUTE FUNCTION "access_request_replies_immutable"();
