-- CreateEnum
CREATE TYPE "AiToolKey" AS ENUM ('CLAUDE_CODE', 'CODEX', 'ANTIGRAVITY_CLI');

-- CreateEnum
CREATE TYPE "UsageCoverage" AS ENUM ('COVERED', 'PARTIAL', 'NOT_OBSERVABLE');

-- CreateEnum
CREATE TYPE "CollectorAllowlistEntryKind" AS ENUM ('AI_TOOL');

-- CreateEnum
CREATE TYPE "ToolAuthStatus" AS ENUM ('LOGGED_IN', 'LOGGED_OUT', 'UNKNOWN', 'NOT_SUPPORTED');

-- CreateEnum
CREATE TYPE "ToolQuotaStatus" AS ENUM ('OK', 'NOT_SUPPORTED', 'FAILED');

-- CreateEnum
CREATE TYPE "ToolQuotaWindowCode" AS ENUM ('PRIMARY', 'SECONDARY', 'SESSION', 'WEEKLY_ALL', 'WEEKLY_MODEL', 'FIVE_HOUR', 'DAILY', 'WEEKLY');

-- CreateEnum
CREATE TYPE "IntakeEndpoint" AS ENUM ('AI_USAGE_BATCH', 'AI_TOOL_STATUS_SNAPSHOT');

-- CreateEnum
CREATE TYPE "IntakeRejectionReason" AS ENUM ('NOT_ACKNOWLEDGED', 'COLLECTION_STOPPED', 'TOOL_STATUS_NOT_ACKNOWLEDGED', 'OUTSIDE_WINDOW', 'NOT_IN_ALLOWLIST', 'FUTURE_GENERATED_AT', 'FUTURE_OBSERVED_AT', 'INVALID_COVERAGE', 'INVALID_QUOTA');

-- CreateTable
CREATE TABLE "collector_allowlist_versions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "published_by_app_user_id" UUID NOT NULL,
    "published_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collector_allowlist_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collector_allowlist_entries" (
    "id" UUID NOT NULL,
    "version_id" UUID NOT NULL,
    "kind" "CollectorAllowlistEntryKind" NOT NULL,
    "key" TEXT NOT NULL,
    "application_id" UUID NOT NULL,

    CONSTRAINT "collector_allowlist_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_usage_days" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "registration_id" UUID NOT NULL,
    "credential_id" UUID NOT NULL,
    "tool" "AiToolKey" NOT NULL,
    "application_id" UUID NOT NULL,
    "usage_date" DATE NOT NULL,
    "coverage" "UsageCoverage" NOT NULL,
    "responses" INTEGER NOT NULL,
    "total_tokens" BIGINT NOT NULL,
    "generated_at" TIMESTAMPTZ(3) NOT NULL,
    "content_hash" TEXT NOT NULL,
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tool_status_snapshots" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "registration_id" UUID NOT NULL,
    "credential_id" UUID NOT NULL,
    "tool" "AiToolKey" NOT NULL,
    "observed_at" TIMESTAMPTZ(3) NOT NULL,
    "auth_status" "ToolAuthStatus" NOT NULL,
    "quota_status" "ToolQuotaStatus" NOT NULL,
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tool_status_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tool_status_windows" (
    "snapshot_id" UUID NOT NULL,
    "code" "ToolQuotaWindowCode" NOT NULL,
    "used_percent" SMALLINT NOT NULL,
    "resets_at" TIMESTAMPTZ(3),

    CONSTRAINT "tool_status_windows_pkey" PRIMARY KEY ("snapshot_id","code")
);

-- CreateTable
CREATE TABLE "intake_rejections" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "registration_id" UUID,
    "credential_id" UUID NOT NULL,
    "endpoint" "IntakeEndpoint" NOT NULL,
    "usage_date" DATE,
    "reason_code" "IntakeRejectionReason" NOT NULL,
    "rejected_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "intake_rejections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "collector_allowlist_versions_organization_id_version_number_key" ON "collector_allowlist_versions"("organization_id", "version_number");

-- CreateIndex
CREATE UNIQUE INDEX "collector_allowlist_entries_version_id_kind_key_key" ON "collector_allowlist_entries"("version_id", "kind", "key");

-- CreateIndex
CREATE UNIQUE INDEX "collector_allowlist_entries_version_id_application_id_key" ON "collector_allowlist_entries"("version_id", "application_id");

-- CreateIndex
CREATE INDEX "ai_usage_days_device_id_usage_date_idx" ON "ai_usage_days"("device_id", "usage_date");

-- CreateIndex
CREATE UNIQUE INDEX "ai_usage_days_registration_id_tool_usage_date_key" ON "ai_usage_days"("registration_id", "tool", "usage_date");

-- CreateIndex
CREATE INDEX "tool_status_snapshots_device_id_tool_observed_at_idx" ON "tool_status_snapshots"("device_id", "tool", "observed_at");

-- CreateIndex
CREATE UNIQUE INDEX "tool_status_snapshots_registration_id_tool_observed_at_key" ON "tool_status_snapshots"("registration_id", "tool", "observed_at");

-- CreateIndex
CREATE INDEX "intake_rejections_device_id_rejected_at_idx" ON "intake_rejections"("device_id", "rejected_at");

-- AddForeignKey
ALTER TABLE "collector_allowlist_entries" ADD CONSTRAINT "collector_allowlist_entries_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "collector_allowlist_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tool_status_windows" ADD CONSTRAINT "tool_status_windows_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "tool_status_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- A day counts what was seen: nothing can be counted on a day the tool could not observe.
ALTER TABLE "ai_usage_days" ADD CONSTRAINT "ai_usage_days_counts" CHECK ("responses" >= 0 AND "total_tokens" >= 0
  AND ("coverage" <> 'NOT_OBSERVABLE' OR ("responses" = 0 AND "total_tokens" = 0)));
ALTER TABLE "tool_status_windows" ADD CONSTRAINT "tool_status_windows_percent" CHECK ("used_percent" BETWEEN 0 AND 100);

-- A version of the allowlist and its entries are added to and never changed: what was allowed on a day stays knowable.
CREATE FUNCTION usage_append_only() RETURNS trigger AS $$ BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = '55000'; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER collector_allowlist_versions_append_only BEFORE UPDATE OR DELETE ON "collector_allowlist_versions"
  FOR EACH ROW EXECUTE FUNCTION usage_append_only();
CREATE TRIGGER collector_allowlist_versions_no_truncate BEFORE TRUNCATE ON "collector_allowlist_versions"
  FOR EACH STATEMENT EXECUTE FUNCTION usage_append_only();
CREATE TRIGGER collector_allowlist_entries_append_only BEFORE UPDATE OR DELETE ON "collector_allowlist_entries"
  FOR EACH ROW EXECUTE FUNCTION usage_append_only();
CREATE TRIGGER collector_allowlist_entries_no_truncate BEFORE TRUNCATE ON "collector_allowlist_entries"
  FOR EACH STATEMENT EXECUTE FUNCTION usage_append_only();
