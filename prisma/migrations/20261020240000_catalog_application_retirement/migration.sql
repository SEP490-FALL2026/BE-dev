-- The retirement of an application (g3-catalog-retire, US-04-01 AC-8, AC-9, AC-14): the Business Owner confirms in
-- writing, kept for good, and only then can the application be retired. Retiring is one way: a retired application is
-- never brought back, and the confirmation it was retired on is named on it. The application is a catalog table; the
-- person is an organization table: foreign keys only.

-- CreateTable
CREATE TABLE "application_retirement_confirmations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "business_owner_employee_id" UUID NOT NULL,
    "note" TEXT NOT NULL,
    -- A value, not a foreign key: the record outlives the account (as the audit trail does).
    "recorded_by_app_user_id" UUID NOT NULL,
    "recorded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_retirement_confirmations_pkey" PRIMARY KEY ("id"),
    -- A confirmation says what was confirmed: a blank note is none.
    CONSTRAINT "application_retirement_confirmations_note_given" CHECK (length(btrim("note")) > 0)
);

-- CreateIndex
CREATE INDEX "application_retirement_confirmations_application_id_recorde_idx"
    ON "application_retirement_confirmations"("application_id", "recorded_at");

-- AlterTable
ALTER TABLE "applications"
    ADD COLUMN "retired_at" TIMESTAMPTZ(3),
    ADD COLUMN "retired_by_app_user_id" UUID,
    ADD COLUMN "retirement_confirmation_id" UUID;

-- An application already retired before this migration has no confirmation to name: it keeps the day it was last changed.
UPDATE "applications" SET "retired_at" = "updated_at" WHERE "catalog_status" = 'RETIRED';

-- Retired and the day it was retired are one fact; who retired it and on which confirmation come with it, except for
-- one retired before confirmations existed.
ALTER TABLE "applications"
    ADD CONSTRAINT "applications_retired_state" CHECK (
        ("catalog_status" = 'RETIRED') = ("retired_at" IS NOT NULL)
        AND ("retired_at" IS NOT NULL OR ("retired_by_app_user_id" IS NULL AND "retirement_confirmation_id" IS NULL))
    );

-- AddForeignKey
ALTER TABLE "application_retirement_confirmations" ADD CONSTRAINT "application_retirement_confirmations_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "application_retirement_confirmations" ADD CONSTRAINT "application_retirement_confirmations_application_id_fkey"
    FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "application_retirement_confirmations" ADD CONSTRAINT "application_retirement_confirmations_business_owner_employ_fkey"
    FOREIGN KEY ("business_owner_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "applications" ADD CONSTRAINT "applications_retirement_confirmation_id_fkey"
    FOREIGN KEY ("retirement_confirmation_id") REFERENCES "application_retirement_confirmations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A confirmation is a record of what the Business Owner said: never changed, never deleted.
CREATE FUNCTION "application_retirement_confirmation_reject_change"() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'A recorded retirement confirmation is never changed or deleted'
        USING ERRCODE = '55000', CONSTRAINT = 'application_retirement_confirmation_immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "application_retirement_confirmations_immutable"
    BEFORE UPDATE OR DELETE ON "application_retirement_confirmations"
    FOR EACH ROW EXECUTE FUNCTION "application_retirement_confirmation_reject_change"();

-- Retiring is one way: once retired, the state, the day, who did it and on which confirmation never change.
CREATE FUNCTION "application_retirement_is_final"() RETURNS trigger AS $$
BEGIN
    IF OLD."catalog_status" = 'RETIRED'
       AND (NEW."catalog_status", NEW."retired_at", NEW."retired_by_app_user_id", NEW."retirement_confirmation_id")
           IS DISTINCT FROM
           (OLD."catalog_status", OLD."retired_at", OLD."retired_by_app_user_id", OLD."retirement_confirmation_id") THEN
        RAISE EXCEPTION 'A retired application is never brought back or changed in how it was retired'
            USING ERRCODE = '55000', CONSTRAINT = 'applications_retirement_final';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "applications_retirement_final"
    BEFORE UPDATE ON "applications"
    FOR EACH ROW EXECUTE FUNCTION "application_retirement_is_final"();
