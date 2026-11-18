-- CreateEnum
CREATE TYPE "DeviceCollectorKind" AS ENUM ('AI_COLLECTOR', 'BROWSER_EXTENSION');

-- CreateEnum
CREATE TYPE "DeviceCredentialRevocationCause" AS ENUM ('IT_ADMIN', 'REGISTRATION_ENDED');

-- CreateTable
CREATE TABLE "device_enrollment_codes" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "registration_id" UUID NOT NULL,
    "collector_kind" "DeviceCollectorKind" NOT NULL,
    "code_hash" TEXT NOT NULL,
    "max_uses" INTEGER NOT NULL,
    "uses" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_app_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_enrollment_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_enrollment_uses" (
    "id" UUID NOT NULL,
    "code_id" UUID NOT NULL,
    "idempotency_key_hash" TEXT NOT NULL,
    "credential_id" UUID NOT NULL,
    "used_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_enrollment_uses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_credentials" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "registration_id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "collector_kind" "DeviceCollectorKind" NOT NULL,
    "secret_hash" TEXT NOT NULL,
    "secret_used_at" TIMESTAMPTZ(3),
    "previous_secret_hash" TEXT,
    "previous_valid_until" TIMESTAMPTZ(3),
    "issued_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "last_accepted_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "revocation_cause" "DeviceCredentialRevocationCause",
    "revocation_reason" TEXT,
    "revoked_by_app_user_id" UUID,

    CONSTRAINT "device_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "device_enrollment_codes_code_hash_key" ON "device_enrollment_codes"("code_hash");

-- CreateIndex
CREATE INDEX "device_enrollment_codes_registration_id_idx" ON "device_enrollment_codes"("registration_id");

-- CreateIndex
CREATE UNIQUE INDEX "device_enrollment_uses_credential_id_key" ON "device_enrollment_uses"("credential_id");

-- CreateIndex
CREATE UNIQUE INDEX "device_enrollment_uses_code_id_idempotency_key_hash_key" ON "device_enrollment_uses"("code_id", "idempotency_key_hash");

-- CreateIndex
CREATE INDEX "device_credentials_registration_id_idx" ON "device_credentials"("registration_id");

-- AddForeignKey
ALTER TABLE "device_enrollment_codes" ADD CONSTRAINT "device_enrollment_codes_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "device_registrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_enrollment_uses" ADD CONSTRAINT "device_enrollment_uses_code_id_fkey" FOREIGN KEY ("code_id") REFERENCES "device_enrollment_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_enrollment_uses" ADD CONSTRAINT "device_enrollment_uses_credential_id_fkey" FOREIGN KEY ("credential_id") REFERENCES "device_credentials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_credentials" ADD CONSTRAINT "device_credentials_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "device_registrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_credentials" ADD CONSTRAINT "device_credentials_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "managed_devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- A code opens a few enrollments at most, and an AI collector only one (a code is not a way to share a credential).
ALTER TABLE "device_enrollment_codes" ADD CONSTRAINT "device_enrollment_codes_uses" CHECK (
  "uses" >= 0 AND "uses" <= "max_uses" AND "max_uses" BETWEEN 1 AND 5 AND ("collector_kind" <> 'AI_COLLECTOR' OR "max_uses" = 1));
ALTER TABLE "device_credentials"
  ADD CONSTRAINT "device_credentials_previous" CHECK (("previous_secret_hash" IS NULL) = ("previous_valid_until" IS NULL)),
  ADD CONSTRAINT "device_credentials_revoked" CHECK (("revoked_at" IS NULL) = ("revocation_cause" IS NULL)
    AND (("revocation_cause" = 'IT_ADMIN') = ("revocation_reason" IS NOT NULL AND "revoked_by_app_user_id" IS NOT NULL))),
  ADD CONSTRAINT "device_credentials_expiry" CHECK ("expires_at" > "issued_at");

-- A credential keeps whose it is and is never deleted; once revoked it stays as it was.
CREATE FUNCTION device_credentials_guard() RETURNS trigger AS $$ BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'A device credential is never deleted'
     USING ERRCODE = '55000', CONSTRAINT = 'device_credentials_kept'; END IF;
  IF (NEW.id, NEW.organization_id, NEW.registration_id, NEW.device_id, NEW.collector_kind, NEW.issued_at)
     IS DISTINCT FROM (OLD.id, OLD.organization_id, OLD.registration_id, OLD.device_id, OLD.collector_kind, OLD.issued_at)
     OR (OLD.revoked_at IS NOT NULL AND ROW(NEW.*) IS DISTINCT FROM ROW(OLD.*))
  THEN RAISE EXCEPTION 'A device credential keeps whose it is, and a revoked one stays revoked'
     USING ERRCODE = '55000', CONSTRAINT = 'device_credentials_fixed'; END IF;
  RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER device_credentials_guard BEFORE UPDATE OR DELETE ON "device_credentials"
  FOR EACH ROW EXECUTE FUNCTION device_credentials_guard();

-- The use of a code is evidence: added to and never changed.
CREATE TRIGGER device_enrollment_uses_append_only BEFORE UPDATE OR DELETE ON "device_enrollment_uses"
  FOR EACH ROW EXECUTE FUNCTION devices_append_only();
CREATE TRIGGER device_enrollment_uses_no_truncate BEFORE TRUNCATE ON "device_enrollment_uses"
  FOR EACH STATEMENT EXECUTE FUNCTION devices_append_only();

-- A code is never deleted, and only the count of its uses changes.
CREATE FUNCTION device_enrollment_codes_guard() RETURNS trigger AS $$ BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'A device enrollment code is never deleted'
     USING ERRCODE = '55000', CONSTRAINT = 'device_enrollment_codes_kept'; END IF;
  IF (NEW.id, NEW.organization_id, NEW.registration_id, NEW.collector_kind, NEW.code_hash, NEW.max_uses, NEW.expires_at,
      NEW.created_by_app_user_id, NEW.created_at)
     IS DISTINCT FROM (OLD.id, OLD.organization_id, OLD.registration_id, OLD.collector_kind, OLD.code_hash, OLD.max_uses, OLD.expires_at,
      OLD.created_by_app_user_id, OLD.created_at)
  THEN RAISE EXCEPTION 'A device enrollment code changes only by being used'
     USING ERRCODE = '55000', CONSTRAINT = 'device_enrollment_codes_fixed'; END IF;
  RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER device_enrollment_codes_guard BEFORE UPDATE OR DELETE ON "device_enrollment_codes"
  FOR EACH ROW EXECUTE FUNCTION device_enrollment_codes_guard();
