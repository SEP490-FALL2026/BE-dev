-- CreateEnum
CREATE TYPE "DeviceRegistrationEndCause" AS ENUM ('HOLDER_CHANGED', 'DEVICE_RETIRED', 'DEPARTURE', 'EMPLOYEE_LEFT');

-- CreateEnum
CREATE TYPE "DeviceStopRequestState" AS ENUM ('OPEN', 'COMPLETED', 'INVALID');

-- CreateEnum
CREATE TYPE "DeviceStopInvalidReason" AS ENUM ('DUPLICATE', 'ALREADY_STOPPED', 'REGISTRATION_ENDED', 'IT_ADMIN');

-- AlterTable
ALTER TABLE "document_attachments" ADD COLUMN     "signer_employee_id" UUID;

-- CreateTable
CREATE TABLE "managed_devices" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "asset_code" TEXT NOT NULL,
    "normalized_asset_code" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "os" TEXT NOT NULL,
    "retired_at" TIMESTAMPTZ(3),
    "retirement_reason" TEXT,
    "created_by_app_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "managed_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_registrations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "holder_employee_id" UUID NOT NULL,
    "valid_from" DATE NOT NULL,
    "valid_until" DATE,
    "ended_at" TIMESTAMPTZ(3),
    "end_cause" "DeviceRegistrationEndCause",
    "acknowledged_from" TIMESTAMPTZ(3),
    "collection_stopped_at" TIMESTAMPTZ(3),
    "created_by_app_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monitoring_notice_versions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "collected" TEXT NOT NULL,
    "not_collected" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "retention" TEXT NOT NULL,
    "stop_right" TEXT NOT NULL,
    "includes_tool_status" BOOLEAN NOT NULL,
    "requires_reacknowledgement" BOOLEAN NOT NULL,
    "published_by_app_user_id" UUID NOT NULL,
    "published_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "monitoring_notice_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_signature_records" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "registration_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "notice_version_id" UUID NOT NULL,
    "signer_employee_id" UUID NOT NULL,
    "recorded_by_app_user_id" UUID NOT NULL,
    "recorded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_signature_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_acknowledgements" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "registration_id" UUID NOT NULL,
    "notice_version_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "app_user_id" UUID NOT NULL,
    "acknowledged_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_acknowledgements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_stop_requests" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "registration_id" UUID NOT NULL,
    "requester_employee_id" UUID NOT NULL,
    "requested_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "due_at" TIMESTAMPTZ(3),
    "state" "DeviceStopRequestState" NOT NULL,
    "invalid_reason" "DeviceStopInvalidReason",
    "invalid_note" TEXT,
    "handled_by_app_user_id" UUID,
    "handled_at" TIMESTAMPTZ(3),
    "self_handled" BOOLEAN NOT NULL DEFAULT false,
    "overdue_noticed_at" TIMESTAMPTZ(3),

    CONSTRAINT "device_stop_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "managed_devices_organization_id_normalized_asset_code_key" ON "managed_devices"("organization_id", "normalized_asset_code");

-- CreateIndex
CREATE INDEX "device_registrations_holder_employee_id_idx" ON "device_registrations"("holder_employee_id");

-- CreateIndex
CREATE INDEX "device_registrations_device_id_idx" ON "device_registrations"("device_id");

-- CreateIndex
CREATE UNIQUE INDEX "monitoring_notice_versions_organization_id_version_number_key" ON "monitoring_notice_versions"("organization_id", "version_number");

-- CreateIndex
CREATE UNIQUE INDEX "device_signature_records_document_id_key" ON "device_signature_records"("document_id");

-- CreateIndex
CREATE INDEX "device_signature_records_registration_id_recorded_at_idx" ON "device_signature_records"("registration_id", "recorded_at");

-- CreateIndex
CREATE INDEX "device_acknowledgements_registration_id_acknowledged_at_idx" ON "device_acknowledgements"("registration_id", "acknowledged_at");

-- CreateIndex
CREATE INDEX "device_stop_requests_state_due_at_idx" ON "device_stop_requests"("state", "due_at");

-- AddForeignKey
ALTER TABLE "device_registrations" ADD CONSTRAINT "device_registrations_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "managed_devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_registrations" ADD CONSTRAINT "device_registrations_holder_employee_id_fkey" FOREIGN KEY ("holder_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_signature_records" ADD CONSTRAINT "device_signature_records_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "device_registrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_signature_records" ADD CONSTRAINT "device_signature_records_notice_version_id_fkey" FOREIGN KEY ("notice_version_id") REFERENCES "monitoring_notice_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_acknowledgements" ADD CONSTRAINT "device_acknowledgements_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "device_registrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_acknowledgements" ADD CONSTRAINT "device_acknowledgements_notice_version_id_fkey" FOREIGN KEY ("notice_version_id") REFERENCES "monitoring_notice_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_stop_requests" ADD CONSTRAINT "device_stop_requests_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "device_registrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- The register of company machines (ADR-0005: what Prisma cannot say is SQL).
ALTER TABLE "device_registrations"
  ADD CONSTRAINT "device_registrations_no_overlap" EXCLUDE USING gist
      ("device_id" WITH =, daterange("valid_from", "valid_until", '[)') WITH &&),
  ADD CONSTRAINT "device_registrations_end_complete" CHECK (("valid_until" IS NULL) = ("ended_at" IS NULL)
      AND ("ended_at" IS NULL) = ("end_cause" IS NULL) AND ("valid_until" IS NULL OR "valid_until" >= "valid_from")),
  ADD CONSTRAINT "device_registrations_one_projection" CHECK ("acknowledged_from" IS NULL OR "collection_stopped_at" IS NULL);
CREATE UNIQUE INDEX "device_registrations_one_open" ON "device_registrations" ("device_id") WHERE "ended_at" IS NULL;
ALTER TABLE "managed_devices" ADD CONSTRAINT "managed_devices_retired_complete"
  CHECK (("retired_at" IS NULL) = ("retirement_reason" IS NULL));
ALTER TABLE "monitoring_notice_versions" ADD CONSTRAINT "monitoring_notice_versions_number_positive" CHECK ("version_number" >= 1);
ALTER TABLE "device_stop_requests" ADD CONSTRAINT "device_stop_requests_outcome" CHECK (
  ("state" = 'OPEN' AND "handled_at" IS NULL AND "invalid_reason" IS NULL AND "due_at" IS NOT NULL)
  OR ("state" = 'COMPLETED' AND "handled_at" IS NOT NULL AND "handled_by_app_user_id" IS NOT NULL AND "invalid_reason" IS NULL)
  OR ("state" = 'INVALID' AND "handled_at" IS NOT NULL AND "invalid_reason" IS NOT NULL
      AND ("invalid_reason" <> 'IT_ADMIN' OR "invalid_note" IS NOT NULL)));
CREATE UNIQUE INDEX "device_stop_requests_one_open" ON "device_stop_requests" ("registration_id") WHERE "state" = 'OPEN';

-- A registration is never deleted and keeps who and when; it ends once.
CREATE FUNCTION device_registrations_guard() RETURNS trigger AS $$ BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'A device registration is never deleted'
     USING ERRCODE = '55000', CONSTRAINT = 'device_registrations_kept'; END IF;
  IF (NEW.id, NEW.organization_id, NEW.device_id, NEW.holder_employee_id, NEW.valid_from, NEW.created_by_app_user_id, NEW.created_at)
     IS DISTINCT FROM (OLD.id, OLD.organization_id, OLD.device_id, OLD.holder_employee_id, OLD.valid_from, OLD.created_by_app_user_id, OLD.created_at)
     OR (OLD.ended_at IS NOT NULL AND (NEW.ended_at, NEW.valid_until, NEW.end_cause) IS DISTINCT FROM (OLD.ended_at, OLD.valid_until, OLD.end_cause))
  THEN RAISE EXCEPTION 'A device registration keeps who and when, and ends once'
     USING ERRCODE = '55000', CONSTRAINT = 'device_registrations_fixed'; END IF;
  RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER device_registrations_guard BEFORE UPDATE OR DELETE ON "device_registrations"
  FOR EACH ROW EXECUTE FUNCTION device_registrations_guard();

-- The notice, the signed record and the acknowledgements are added to and never changed (INV-05 style).
CREATE FUNCTION devices_append_only() RETURNS trigger AS $$ BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = '55000'; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER monitoring_notice_versions_append_only BEFORE UPDATE OR DELETE ON "monitoring_notice_versions"
  FOR EACH ROW EXECUTE FUNCTION devices_append_only();
CREATE TRIGGER monitoring_notice_versions_no_truncate BEFORE TRUNCATE ON "monitoring_notice_versions"
  FOR EACH STATEMENT EXECUTE FUNCTION devices_append_only();
CREATE TRIGGER device_acknowledgements_append_only BEFORE UPDATE OR DELETE ON "device_acknowledgements"
  FOR EACH ROW EXECUTE FUNCTION devices_append_only();
CREATE TRIGGER device_acknowledgements_no_truncate BEFORE TRUNCATE ON "device_acknowledgements"
  FOR EACH STATEMENT EXECUTE FUNCTION devices_append_only();
CREATE TRIGGER device_signature_records_append_only BEFORE UPDATE OR DELETE ON "device_signature_records"
  FOR EACH ROW EXECUTE FUNCTION devices_append_only();
CREATE TRIGGER device_signature_records_no_truncate BEFORE TRUNCATE ON "device_signature_records"
  FOR EACH STATEMENT EXECUTE FUNCTION devices_append_only();

-- catalog: a signed record is owned by the person who signed it, not by a contract.
ALTER TABLE "document_attachments" DROP CONSTRAINT "document_attachments_owner_state",
  DROP CONSTRAINT "document_attachments_purpose_fits_owner";
ALTER TABLE "document_attachments" ADD CONSTRAINT "document_attachments_owner_state" CHECK (
    ("status" = 'READY') = ("contract_id" IS NOT NULL OR "signer_employee_id" IS NOT NULL)
    AND ("status" = 'READY') = ("attached_at" IS NOT NULL) AND NOT ("contract_id" IS NOT NULL AND "signer_employee_id" IS NOT NULL)),
  ADD CONSTRAINT "document_attachments_purpose_fits_owner" CHECK (
    ("contract_id" IS NULL OR "purpose" IN ('CONTRACT_ATTACHMENT', 'PURCHASE_DOCUMENT'))
    AND ("signer_employee_id" IS NULL OR "purpose" = 'SIGNATURE_RECORD'));
