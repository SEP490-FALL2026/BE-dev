-- The register of company machines grows a life (redesign wave 2): the kind and the serial number of a machine, its condition, how it
-- was retired, a record voided instead of deleted, the counter behind the asset code TYPE-YY-NNNN, whether the collector is installed on
-- a holding, how the software of the holder was taken off, and the job of taking a machine back from a person who left.
-- Expand only: columns and tables are added, backfills never delete. The cost of two backfills is named here so a reviewer sees it:
-- every machine already in the register becomes `device_type = 'OTH'` (the IT Admin corrects it by PATCH) and a retired one gets
-- `retirement_kind = 'DISPOSED'`; every holding already there becomes `collector_installed = true` (today every hand-over asks the
-- holder to acknowledge, so the old behaviour is kept).

-- CreateEnum
CREATE TYPE "DeviceType" AS ENUM ('LAP', 'PC', 'OTH');

-- CreateEnum
CREATE TYPE "DeviceCondition" AS ENUM ('USABLE', 'IN_REPAIR', 'BROKEN');

-- CreateEnum
CREATE TYPE "DeviceRetirementKind" AS ENUM ('DISPOSED', 'LOST');

-- CreateEnum
CREATE TYPE "DeviceAssetCodeOrigin" AS ENUM ('GENERATED', 'LEGACY');

-- CreateEnum
CREATE TYPE "DeviceSoftwareRemoval" AS ENUM ('REMOVED', 'NOT_REMOVABLE');

-- CreateEnum
CREATE TYPE "DeviceReturnTaskState" AS ENUM ('OPEN', 'RECEIVED', 'NOT_RECOVERED', 'CANCELLED');

-- AlterTable: the two required columns get their backfill value as a default and keep it for now: the code that enters a machine today
-- names neither, and the register must still work until the package that enters machines names both. A later migration may drop them.
ALTER TABLE "managed_devices" ADD COLUMN     "asset_code_origin" "DeviceAssetCodeOrigin" NOT NULL DEFAULT 'LEGACY',
ADD COLUMN     "condition" "DeviceCondition" NOT NULL DEFAULT 'USABLE',
ADD COLUMN     "condition_note" TEXT,
ADD COLUMN     "device_type" "DeviceType" NOT NULL DEFAULT 'OTH',
ADD COLUMN     "normalized_serial_number" TEXT,
ADD COLUMN     "retirement_kind" "DeviceRetirementKind",
ADD COLUMN     "serial_number" TEXT,
ADD COLUMN     "void_reason" TEXT,
ADD COLUMN     "voided_at" TIMESTAMPTZ(3),
ADD COLUMN     "voided_by_app_user_id" UUID;

-- Every retired machine so far was taken out of use for good (a machine lost is a kind the next machines can name).
UPDATE "managed_devices" SET "retirement_kind" = 'DISPOSED' WHERE "retired_at" IS NOT NULL;

-- AlterTable: the column starts true so the holdings already there keep their behaviour, and the default for a new one is false.
ALTER TABLE "device_registrations" ADD COLUMN     "collector_installed" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "software_removal" "DeviceSoftwareRemoval",
ADD COLUMN     "software_removal_note" TEXT;

ALTER TABLE "device_registrations" ALTER COLUMN "collector_installed" SET DEFAULT false;

-- CreateTable
CREATE TABLE "device_code_counters" (
    "device_type" "DeviceType" NOT NULL,
    "year" SMALLINT NOT NULL,
    "last_value" INTEGER NOT NULL,

    CONSTRAINT "device_code_counters_pkey" PRIMARY KEY ("device_type","year")
);

-- CreateTable
CREATE TABLE "device_return_tasks" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "registration_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "offboarding_case_id" UUID NOT NULL,
    "department_id" UUID,
    "due_on" DATE NOT NULL,
    "state" "DeviceReturnTaskState" NOT NULL DEFAULT 'OPEN',
    "condition_on_receipt" "DeviceCondition",
    "software_removal" "DeviceSoftwareRemoval",
    "software_removal_note" TEXT,
    "outcome_note" TEXT,
    "handled_by_app_user_id" UUID,
    "handled_at" TIMESTAMPTZ(3),
    "overdue_noticed_on" DATE,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_return_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "device_return_tasks_registration_id_key" ON "device_return_tasks"("registration_id");

-- CreateIndex
CREATE INDEX "device_return_tasks_state_due_on_idx" ON "device_return_tasks"("state", "due_on");

-- CreateIndex
CREATE INDEX "device_return_tasks_department_id_state_idx" ON "device_return_tasks"("department_id", "state");

-- CreateIndex
CREATE INDEX "device_return_tasks_offboarding_case_id_idx" ON "device_return_tasks"("offboarding_case_id");

-- CreateIndex
CREATE UNIQUE INDEX "managed_devices_organization_id_normalized_serial_number_key" ON "managed_devices"("organization_id", "normalized_serial_number");

-- AddForeignKey
ALTER TABLE "device_return_tasks" ADD CONSTRAINT "device_return_tasks_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "managed_devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_return_tasks" ADD CONSTRAINT "device_return_tasks_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "device_registrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_return_tasks" ADD CONSTRAINT "device_return_tasks_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- What Prisma cannot say (ADR-0005).

-- managed_devices: the serial number and its search key are both there or both missing; a retired machine says how it was retired; a voided
-- record says why and by whom and was never retired; a generated asset code has the generated form.
ALTER TABLE "managed_devices" ADD CONSTRAINT "managed_devices_serial_pair"
  CHECK (("serial_number" IS NULL) = ("normalized_serial_number" IS NULL));
ALTER TABLE "managed_devices" DROP CONSTRAINT "managed_devices_retired_complete";
ALTER TABLE "managed_devices" ADD CONSTRAINT "managed_devices_retired_complete"
  CHECK (("retired_at" IS NULL) = ("retirement_reason" IS NULL) AND ("retired_at" IS NULL) = ("retirement_kind" IS NULL));
ALTER TABLE "managed_devices" ADD CONSTRAINT "managed_devices_void_complete"
  CHECK (("voided_at" IS NULL) = ("void_reason" IS NULL) AND ("voided_at" IS NULL) = ("voided_by_app_user_id" IS NULL)
         AND NOT ("voided_at" IS NOT NULL AND "retired_at" IS NOT NULL));
ALTER TABLE "managed_devices" ADD CONSTRAINT "managed_devices_asset_code_form"
  CHECK ("asset_code_origin" <> 'GENERATED' OR "asset_code" ~ '^(LAP|PC|OTH)-[0-9]{2}-[0-9]{4}$');

-- A machine is never deleted and keeps what names it; once it is retired or voided nothing but `updated_at` changes. Pattern:
-- device_registrations_guard.
CREATE FUNCTION managed_devices_guard() RETURNS trigger AS $$ BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'A machine of the register is never deleted'
     USING ERRCODE = '55000', CONSTRAINT = 'managed_devices_kept'; END IF;
  IF (NEW.id, NEW.organization_id, NEW.asset_code, NEW.normalized_asset_code, NEW.asset_code_origin, NEW.created_by_app_user_id, NEW.created_at)
     IS DISTINCT FROM (OLD.id, OLD.organization_id, OLD.asset_code, OLD.normalized_asset_code, OLD.asset_code_origin, OLD.created_by_app_user_id, OLD.created_at)
  THEN RAISE EXCEPTION 'A machine keeps its asset code and who and when it was entered'
     USING ERRCODE = '55000', CONSTRAINT = 'managed_devices_identity_fixed'; END IF;
  IF (OLD.retired_at IS NOT NULL OR OLD.voided_at IS NOT NULL)
     AND (to_jsonb(NEW) - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'updated_at')
  THEN RAISE EXCEPTION 'A machine that was retired or voided does not change any more'
     USING ERRCODE = '55000', CONSTRAINT = 'managed_devices_closed_fixed'; END IF;
  RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER managed_devices_guard BEFORE UPDATE OR DELETE ON "managed_devices"
  FOR EACH ROW EXECUTE FUNCTION managed_devices_guard();

-- device_code_counters: the year and the value stay in the range of four digits and two digit year.
ALTER TABLE "device_code_counters"
  ADD CONSTRAINT "device_code_counters_year_check" CHECK ("year" BETWEEN 2000 AND 2200),
  ADD CONSTRAINT "device_code_counters_value_check" CHECK ("last_value" BETWEEN 0 AND 9999);

-- The counters start from the codes already there that have the generated form, so a new code never meets an old one. `btrim`: an old code
-- `lap-26-0009 ` has the same normalized form as the generated `LAP-26-0009`, so it must be counted too. A code of another form is
-- not matched (`regexp_match` gives NULL) and is left to the 409 the service answers with.
INSERT INTO "device_code_counters" ("device_type", "year", "last_value")
SELECT m[1]::"DeviceType", 2000 + m[2]::int, max(m[3]::int)
  FROM "managed_devices" d, regexp_match(upper(btrim(d."asset_code")), '^(LAP|PC|OTH)-([0-9]{2})-([0-9]{4})$') AS m
 WHERE m IS NOT NULL
 GROUP BY 1, 2;

-- device_registrations: the way the software was taken off is told once, with the update that ends the holding; "not removable" needs a
-- note; a note needs a way.
ALTER TABLE "device_registrations" ADD CONSTRAINT "device_registrations_software_removal" CHECK (
  ("software_removal" IS NULL OR "ended_at" IS NOT NULL)
  AND ("software_removal" IS DISTINCT FROM 'NOT_REMOVABLE' OR btrim(coalesce("software_removal_note", '')) <> '')
  AND ("software_removal_note" IS NULL OR "software_removal" IS NOT NULL));

-- The guard of a holding (migration 20261107000000) with two rules more: the collector flag only goes from false to true and only while
-- the holding is open (stopping collection is the stop request, not this flag); the way the software was taken off is written only in the
-- update that ends the holding and is fixed after it. Every old rule stays.
CREATE OR REPLACE FUNCTION device_registrations_guard() RETURNS trigger AS $$ BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'A device registration is never deleted'
     USING ERRCODE = '55000', CONSTRAINT = 'device_registrations_kept'; END IF;
  IF (NEW.id, NEW.organization_id, NEW.device_id, NEW.holder_employee_id, NEW.valid_from, NEW.created_by_app_user_id, NEW.created_at)
     IS DISTINCT FROM (OLD.id, OLD.organization_id, OLD.device_id, OLD.holder_employee_id, OLD.valid_from, OLD.created_by_app_user_id, OLD.created_at)
     OR (OLD.ended_at IS NOT NULL AND (NEW.ended_at, NEW.valid_until, NEW.end_cause) IS DISTINCT FROM (OLD.ended_at, OLD.valid_until, OLD.end_cause))
     OR (NEW.collector_installed IS DISTINCT FROM OLD.collector_installed
         AND NOT (OLD.collector_installed = false AND NEW.collector_installed = true AND OLD.ended_at IS NULL))
     OR ((NEW.software_removal, NEW.software_removal_note) IS DISTINCT FROM (OLD.software_removal, OLD.software_removal_note)
         AND NOT (OLD.ended_at IS NULL AND NEW.ended_at IS NOT NULL))
  THEN RAISE EXCEPTION 'A device registration keeps who and when, and ends once'
     USING ERRCODE = '55000', CONSTRAINT = 'device_registrations_fixed'; END IF;
  RETURN NEW; END; $$ LANGUAGE plpgsql;

-- device_return_tasks: each state says what it must have been told. `OPEN` is untouched, `RECEIVED` has the condition and the way the
-- software was taken off, `NOT_RECOVERED` has a reason, `CANCELLED` is closed by the system (nobody handled it).
ALTER TABLE "device_return_tasks" ADD CONSTRAINT "device_return_tasks_outcome" CHECK (
  ("state" = 'OPEN' AND "handled_at" IS NULL AND "handled_by_app_user_id" IS NULL
     AND "condition_on_receipt" IS NULL AND "software_removal" IS NULL)
  OR ("state" = 'RECEIVED' AND "handled_at" IS NOT NULL AND "handled_by_app_user_id" IS NOT NULL
     AND "condition_on_receipt" IS NOT NULL AND "software_removal" IS NOT NULL)
  OR ("state" = 'NOT_RECOVERED' AND "handled_at" IS NOT NULL AND "handled_by_app_user_id" IS NOT NULL
     AND btrim(coalesce("outcome_note", '')) <> '')
  OR ("state" = 'CANCELLED' AND "handled_at" IS NOT NULL AND "handled_by_app_user_id" IS NULL));
ALTER TABLE "device_return_tasks" ADD CONSTRAINT "device_return_tasks_software_removal" CHECK (
  ("software_removal" IS DISTINCT FROM 'NOT_REMOVABLE' OR btrim(coalesce("software_removal_note", '')) <> '')
  AND ("software_removal_note" IS NULL OR "software_removal" IS NOT NULL));
-- One open job for a machine at a time.
CREATE UNIQUE INDEX "device_return_tasks_one_open" ON "device_return_tasks" ("device_id") WHERE "state" = 'OPEN';

-- A job is never deleted, keeps what names it, goes from OPEN to one closed state once, and after that nothing changes. While it is OPEN
-- only the due date and the day of the last reminder move.
CREATE FUNCTION device_return_tasks_guard() RETURNS trigger AS $$ BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'A job of taking a machine back is never deleted'
     USING ERRCODE = '55000', CONSTRAINT = 'device_return_tasks_kept'; END IF;
  IF (NEW.id, NEW.organization_id, NEW.device_id, NEW.registration_id, NEW.employee_id, NEW.offboarding_case_id, NEW.department_id, NEW.created_at)
     IS DISTINCT FROM (OLD.id, OLD.organization_id, OLD.device_id, OLD.registration_id, OLD.employee_id, OLD.offboarding_case_id, OLD.department_id, OLD.created_at)
  THEN RAISE EXCEPTION 'A job of taking a machine back keeps what it is about'
     USING ERRCODE = '55000', CONSTRAINT = 'device_return_tasks_identity_fixed'; END IF;
  IF OLD.state <> 'OPEN' AND ROW(NEW.*) IS DISTINCT FROM ROW(OLD.*)
  THEN RAISE EXCEPTION 'A job of taking a machine back that was closed does not change any more'
     USING ERRCODE = '55000', CONSTRAINT = 'device_return_tasks_closed_fixed'; END IF;
  RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER device_return_tasks_guard BEFORE UPDATE OR DELETE ON "device_return_tasks"
  FOR EACH ROW EXECUTE FUNCTION device_return_tasks_guard();
