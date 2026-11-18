-- The incident the Super Admin records about a holder whose steps are stuck (US-05-10 AC-4): a description and a snapshot of how
-- many steps were open and how old the oldest was. Recording one changes no step: the Super Admin does not decide in anyone's
-- place (SoD-1). Append-only.

-- CreateTable
CREATE TABLE "congestion_incidents" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "holder_employee_id" UUID,
    "description" TEXT NOT NULL,
    "open_steps" INTEGER NOT NULL,
    "oldest_age_working_days" INTEGER NOT NULL,
    "recorded_by_app_user_id" UUID NOT NULL,
    "recorded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "congestion_incidents_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "congestion_incidents_description_check" CHECK (btrim("description") <> '' AND char_length("description") <= 1000),
    CONSTRAINT "congestion_incidents_snapshot_check" CHECK ("open_steps" >= 0 AND "oldest_age_working_days" >= 0)
);

-- CreateIndex
CREATE INDEX "congestion_incidents_recorded_at_id_idx" ON "congestion_incidents"("recorded_at" DESC, "id" DESC);

-- AddForeignKey
ALTER TABLE "congestion_incidents" ADD CONSTRAINT "congestion_incidents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "congestion_incidents" ADD CONSTRAINT "congestion_incidents_holder_employee_id_fkey" FOREIGN KEY ("holder_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- An incident is a record that was made: nothing edits or deletes it.
CREATE FUNCTION congestion_incidents_reject_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'congestion_incidents is append-only (% rejected)', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER congestion_incidents_no_update_delete
  BEFORE UPDATE OR DELETE ON "congestion_incidents"
  FOR EACH ROW EXECUTE FUNCTION congestion_incidents_reject_change();

CREATE TRIGGER congestion_incidents_no_truncate
  BEFORE TRUNCATE ON "congestion_incidents"
  FOR EACH STATEMENT EXECUTE FUNCTION congestion_incidents_reject_change();
