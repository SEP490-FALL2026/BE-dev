-- One alert for each stretch of controlled waiting (US-05-11 AC-1, AC-2, AC-6): a step that nobody valid can hold is told to
-- the people who can put it right once, however long it waits. The queue of waiting steps is read from the steps themselves;
-- this table keeps when the alert was raised and makes a second one for the same stretch impossible.

-- CreateTable
CREATE TABLE "controlled_wait_alerts" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "step_id" UUID NOT NULL,
    "step_kind" "AccessRequestStepKind" NOT NULL,
    "waiting_reason" TEXT NOT NULL,
    "waiting_since" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "controlled_wait_alerts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "controlled_wait_alerts_reason_check" CHECK (btrim("waiting_reason") <> '')
);

-- CreateIndex
CREATE UNIQUE INDEX "controlled_wait_alerts_step_id_waiting_since_key" ON "controlled_wait_alerts"("step_id", "waiting_since");

-- CreateIndex
CREATE INDEX "controlled_wait_alerts_request_id_idx" ON "controlled_wait_alerts"("request_id");

-- AddForeignKey
ALTER TABLE "controlled_wait_alerts" ADD CONSTRAINT "controlled_wait_alerts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "controlled_wait_alerts" ADD CONSTRAINT "controlled_wait_alerts_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "access_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "controlled_wait_alerts" ADD CONSTRAINT "controlled_wait_alerts_step_id_fkey" FOREIGN KEY ("step_id") REFERENCES "access_request_steps"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- An alert is a fact that was raised: nothing edits or deletes it, so no code path, including raw SQL from another module,
-- can make a stretch of waiting look as if nobody was told.
CREATE FUNCTION controlled_wait_alerts_reject_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'controlled_wait_alerts is append-only (% rejected)', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER controlled_wait_alerts_no_update_delete
  BEFORE UPDATE OR DELETE ON "controlled_wait_alerts"
  FOR EACH ROW EXECUTE FUNCTION controlled_wait_alerts_reject_change();

CREATE TRIGGER controlled_wait_alerts_no_truncate
  BEFORE TRUNCATE ON "controlled_wait_alerts"
  FOR EACH STATEMENT EXECUTE FUNCTION controlled_wait_alerts_reject_change();
