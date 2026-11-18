-- The inbox of the application (FR-3.11, US-05-15 AC-7, AC-10): the notices a person reads inside the application. A notice is
-- written in the transaction of the change behind it, so it exists exactly when that change commits. It says a code and flat
-- parameters (ids, codes, a reason the people concerned already read); the interface turns them into words.

-- CreateTable
CREATE TABLE "in_app_notifications" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "recipient_employee_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "subject_type" TEXT,
    "subject_id" UUID,
    "params" JSONB NOT NULL DEFAULT '{}',
    "event_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read_at" TIMESTAMPTZ(3),

    CONSTRAINT "in_app_notifications_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "in_app_notifications_code_check" CHECK ("code" ~ '^[A-Z][A-Z0-9_]{2,63}$'),
    CONSTRAINT "in_app_notifications_params_object_check" CHECK (jsonb_typeof("params") = 'object'),
    CONSTRAINT "in_app_notifications_params_size_check" CHECK (octet_length("params"::text) <= 4096),
    CONSTRAINT "in_app_notifications_event_key_check" CHECK (char_length("event_key") BETWEEN 1 AND 200),
    CONSTRAINT "in_app_notifications_subject_check" CHECK (("subject_type" IS NULL) = ("subject_id" IS NULL)),
    CONSTRAINT "in_app_notifications_subject_type_check" CHECK ("subject_type" IS NULL OR btrim("subject_type") <> '')
);

-- One notice for each (recipient, event): writing the same event again is a no-op (the recipient is a value, not a foreign key:
-- the history outlives the account, as the mail outbox does).
-- CreateIndex
CREATE UNIQUE INDEX "in_app_notifications_recipient_employee_id_event_key_key" ON "in_app_notifications"("recipient_employee_id", "event_key");

-- CreateIndex
CREATE INDEX "in_app_notifications_recipient_employee_id_created_at_id_idx" ON "in_app_notifications"("recipient_employee_id", "created_at" DESC, "id" DESC);

-- The count of what is unread reads only unread rows.
CREATE INDEX "in_app_notifications_unread_idx" ON "in_app_notifications"("recipient_employee_id") WHERE "read_at" IS NULL;

-- A notice is a fact that was told: the only change it ever has is the moment it was read, set once from empty, and nothing
-- deletes it, so no code path, including raw SQL from another module, can rewrite what a person was told.
CREATE FUNCTION in_app_notifications_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD."read_at" IS NOT NULL OR NEW."read_at" IS NULL
       OR (to_jsonb(NEW) - 'read_at') IS DISTINCT FROM (to_jsonb(OLD) - 'read_at') THEN
      RAISE EXCEPTION 'in_app_notifications only takes the moment it was read, once (UPDATE rejected)'
        USING ERRCODE = 'restrict_violation';
    END IF;

    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'in_app_notifications is never deleted (% rejected)', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER in_app_notifications_guard_update_delete
  BEFORE UPDATE OR DELETE ON "in_app_notifications"
  FOR EACH ROW EXECUTE FUNCTION in_app_notifications_guard();

CREATE TRIGGER in_app_notifications_guard_truncate
  BEFORE TRUNCATE ON "in_app_notifications"
  FOR EACH STATEMENT EXECUTE FUNCTION in_app_notifications_guard();
