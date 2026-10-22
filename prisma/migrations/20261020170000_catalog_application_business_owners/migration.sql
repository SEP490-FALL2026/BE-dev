-- The Business Owner periods of an application (g3-business-owner-replacement, US-04-06, INV-06). An application always
-- has its owner in `applications`; this table is the history of who it was, from when to when, and who changed it.
-- Whether an owner has left is read from the organization when the application is read: it is not stored here.

-- CreateTable
CREATE TABLE "application_business_owners" (
    "id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "assigned_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- A value, not a foreign key (as the audit trail): empty only for the periods copied from before this table existed.
    "assigned_by_app_user_id" UUID,
    "ended_at" TIMESTAMPTZ(3),

    CONSTRAINT "application_business_owners_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "application_business_owners_period_order" CHECK ("ended_at" IS NULL OR "ended_at" >= "assigned_at")
);

-- CreateIndex
CREATE INDEX "application_business_owners_application_id_assigned_at_idx"
    ON "application_business_owners"("application_id", "assigned_at");
-- One period is open for an application.
CREATE UNIQUE INDEX "application_business_owners_open_key"
    ON "application_business_owners"("application_id") WHERE "ended_at" IS NULL;

-- AddForeignKey
ALTER TABLE "application_business_owners" ADD CONSTRAINT "application_business_owners_application_id_fkey"
    FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "application_business_owners" ADD CONSTRAINT "application_business_owners_employee_id_fkey"
    FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A period is closed by setting `ended_at` once; nothing else about it is ever changed, and none is deleted.
CREATE FUNCTION "application_business_owners_guard"() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'A Business Owner period is never deleted'
            USING ERRCODE = '55000', CONSTRAINT = 'application_business_owners_immutable';
    END IF;
    IF OLD."ended_at" IS NOT NULL
       OR NEW."id" <> OLD."id" OR NEW."application_id" <> OLD."application_id" OR NEW."employee_id" <> OLD."employee_id"
       OR NEW."assigned_at" <> OLD."assigned_at"
       OR NEW."assigned_by_app_user_id" IS DISTINCT FROM OLD."assigned_by_app_user_id" THEN
        RAISE EXCEPTION 'A Business Owner period only ever gets its end'
            USING ERRCODE = '55000', CONSTRAINT = 'application_business_owners_immutable';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "application_business_owners_guard"
    BEFORE UPDATE OR DELETE ON "application_business_owners"
    FOR EACH ROW EXECUTE FUNCTION "application_business_owners_guard"();

-- The Business Owner every application already has becomes its first period.
INSERT INTO "application_business_owners" ("id", "application_id", "employee_id", "assigned_at")
SELECT gen_random_uuid(), a."id", a."business_owner_employee_id", a."created_at" FROM "applications" a;
