-- qd103-vendor-usage-import Task 1: nguồn usage nhà cung cấp, lần nhập, ngày hoạt động, ánh xạ danh tính, hàng đợi chưa khớp, phát hiện sai lệch.
-- CreateEnum
CREATE TYPE "UsageIdentifierType" AS ENUM ('EMAIL', 'USERNAME', 'ACCOUNT_ID');

-- CreateEnum
CREATE TYPE "UsageReportShape" AS ENUM ('AGGREGATE', 'EVENT');

-- CreateEnum
CREATE TYPE "UsageDefinitionStrictness" AS ENUM ('STRICT', 'LOOSE');

-- CreateEnum
CREATE TYPE "UsageEvidenceDirection" AS ENUM ('POSITIVE_ONLY', 'POSITIVE_AND_NEGATIVE');

-- CreateEnum
CREATE TYPE "UsageImportFormat" AS ENUM ('JSON', 'CSV');

-- CreateEnum
CREATE TYPE "UsageImportStatus" AS ENUM ('PREVIEW', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "UsageCoverageBasis" AS ENUM ('DECLARED', 'DERIVED');

-- CreateEnum
CREATE TYPE "UsageNoticeMode" AS ENUM ('CONFIRMED_DELIVERED', 'SYSTEM_SENT');

-- CreateEnum
CREATE TYPE "UsageRowOutcome" AS ENUM ('MATCHED', 'UNMATCHED', 'AMBIGUOUS', 'NOT_A_PERSON', 'INVALID');

-- CreateEnum
CREATE TYPE "UsageEventClass" AS ENUM ('VALUE', 'PASSIVE', 'AUTH_ONLY');

-- CreateEnum
CREATE TYPE "UsageActivityBasis" AS ENUM ('ACTIVE_DATE', 'LAST_ACTIVITY');

-- CreateEnum
CREATE TYPE "UsageMatchMethod" AS ENUM ('EXACT_EMAIL', 'ACCOUNT_IDENTIFIER', 'ALIAS_RULE', 'MANUAL');

-- CreateEnum
CREATE TYPE "UsageMatchConfidence" AS ENUM ('HIGH', 'MEDIUM');

-- CreateEnum
CREATE TYPE "UsageUnmatchedReason" AS ENUM ('NOT_FOUND', 'AMBIGUOUS');

-- CreateEnum
CREATE TYPE "UsageUnmatchedStatus" AS ENUM ('OPEN', 'DISMISSED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "UsageFindingStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateTable
CREATE TABLE "usage_sources" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "identifier_type" "UsageIdentifierType" NOT NULL,
    "report_shape" "UsageReportShape" NOT NULL,
    "template" JSONB NOT NULL,
    "time_zone" TEXT NOT NULL,
    "activity_definition" TEXT NOT NULL,
    "definition_strictness" "UsageDefinitionStrictness" NOT NULL,
    "evidence_direction" "UsageEvidenceDirection" NOT NULL,
    "cap_member_list" BOOLEAN NOT NULL,
    "cap_last_activity" BOOLEAN NOT NULL,
    "cap_event_detail" BOOLEAN NOT NULL,
    "cap_max_history_days" INTEGER,
    "retired_at" TIMESTAMPTZ(3),
    "created_by_app_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_imports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "format" "UsageImportFormat" NOT NULL,
    "status" "UsageImportStatus" NOT NULL DEFAULT 'PREVIEW',
    "coverage_from" DATE NOT NULL,
    "coverage_to" DATE NOT NULL,
    "coverage_basis" "UsageCoverageBasis" NOT NULL,
    "content_hash" TEXT NOT NULL,
    "preview_version" INTEGER NOT NULL DEFAULT 1,
    "summary" JSONB NOT NULL,
    "result" JSONB,
    "confirm_key" TEXT,
    "notice_mode" "UsageNoticeMode",
    "notice_at" TIMESTAMPTZ(3),
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "uploaded_by_app_user_id" UUID NOT NULL,
    "confirmed_by_app_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_at" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),

    CONSTRAINT "usage_imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_import_rows" (
    "import_id" UUID NOT NULL,
    "line_number" INTEGER NOT NULL,
    "cells" JSONB NOT NULL,
    "identifier_raw" TEXT NOT NULL,
    "identifier_normalized" TEXT NOT NULL,
    "outcome" "UsageRowOutcome" NOT NULL,
    "employee_id" UUID,
    "match_method" "UsageMatchMethod",
    "errors" JSONB NOT NULL,

    CONSTRAINT "usage_import_rows_pkey" PRIMARY KEY ("import_id","line_number")
);

-- CreateTable
CREATE TABLE "usage_activity_days" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "import_id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "identifier_type" "UsageIdentifierType" NOT NULL,
    "normalized_identifier" TEXT NOT NULL,
    "activity_date" DATE NOT NULL,
    "event_class" "UsageEventClass" NOT NULL,
    "basis" "UsageActivityBasis" NOT NULL,
    "superseded_by_import_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),

    CONSTRAINT "usage_activity_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_identity_mappings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "identifier_type" "UsageIdentifierType" NOT NULL,
    "normalized_identifier" TEXT NOT NULL,
    "raw_identifier" TEXT NOT NULL,
    "employee_id" UUID NOT NULL,
    "method" "UsageMatchMethod" NOT NULL,
    "confidence" "UsageMatchConfidence" NOT NULL,
    "confirmed_by_app_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMPTZ(3),
    "ended_by_app_user_id" UUID,
    "end_reason" TEXT,

    CONSTRAINT "usage_identity_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_unmatched_identities" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "identifier_type" "UsageIdentifierType" NOT NULL,
    "normalized_identifier" TEXT NOT NULL,
    "raw_identifier" TEXT NOT NULL,
    "reason" "UsageUnmatchedReason" NOT NULL,
    "status" "UsageUnmatchedStatus" NOT NULL DEFAULT 'OPEN',
    "candidate_employee_ids" UUID[],
    "first_import_id" UUID NOT NULL,
    "last_import_id" UUID NOT NULL,
    "resolved_mapping_id" UUID,
    "handled_by_app_user_id" UUID,
    "handled_at" TIMESTAMPTZ(3),
    "note" TEXT,

    CONSTRAINT "usage_unmatched_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_no_assignment_findings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "first_activity_date" DATE NOT NULL,
    "last_activity_date" DATE NOT NULL,
    "last_import_id" UUID NOT NULL,
    "status" "UsageFindingStatus" NOT NULL DEFAULT 'OPEN',
    "closed_at" TIMESTAMPTZ(3),
    "closed_reason" TEXT,

    CONSTRAINT "usage_no_assignment_findings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "usage_sources_application_id_idx" ON "usage_sources"("application_id");

-- CreateIndex
CREATE UNIQUE INDEX "usage_sources_organization_id_application_id_name_key" ON "usage_sources"("organization_id", "application_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "usage_imports_confirm_key_key" ON "usage_imports"("confirm_key");

-- CreateIndex
CREATE INDEX "usage_imports_source_id_status_idx" ON "usage_imports"("source_id", "status");

-- CreateIndex
CREATE INDEX "usage_activity_days_application_id_identifier_type_normaliz_idx" ON "usage_activity_days"("application_id", "identifier_type", "normalized_identifier", "activity_date");

-- CreateIndex
CREATE INDEX "usage_activity_days_source_id_activity_date_idx" ON "usage_activity_days"("source_id", "activity_date");

-- CreateIndex
CREATE UNIQUE INDEX "usage_activity_days_import_id_identifier_type_normalized_id_key" ON "usage_activity_days"("import_id", "identifier_type", "normalized_identifier", "activity_date", "event_class");

-- CreateIndex
CREATE INDEX "usage_identity_mappings_application_id_identifier_type_norm_idx" ON "usage_identity_mappings"("application_id", "identifier_type", "normalized_identifier");

-- CreateIndex
CREATE INDEX "usage_identity_mappings_employee_id_idx" ON "usage_identity_mappings"("employee_id");

-- CreateIndex
CREATE INDEX "usage_unmatched_identities_application_id_status_idx" ON "usage_unmatched_identities"("application_id", "status");

-- CreateIndex
CREATE INDEX "usage_no_assignment_findings_application_id_status_idx" ON "usage_no_assignment_findings"("application_id", "status");

-- AddForeignKey
ALTER TABLE "usage_imports" ADD CONSTRAINT "usage_imports_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "usage_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_import_rows" ADD CONSTRAINT "usage_import_rows_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "usage_imports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_activity_days" ADD CONSTRAINT "usage_activity_days_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "usage_imports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Ràng buộc của nguồn: tên 1–120, định nghĩa hoạt động bắt buộc 3–500 ký tự (INV-11), mẫu là một object.
ALTER TABLE "usage_sources"
    ADD CONSTRAINT "usage_sources_name" CHECK (char_length("name") BETWEEN 1 AND 120),
    ADD CONSTRAINT "usage_sources_activity_definition" CHECK (char_length("activity_definition") BETWEEN 3 AND 500),
    ADD CONSTRAINT "usage_sources_template" CHECK (jsonb_typeof("template") = 'object'),
    ADD CONSTRAINT "usage_sources_history_days" CHECK ("cap_max_history_days" IS NULL OR "cap_max_history_days" > 0);

-- Cửa sổ bao phủ bắt buộc và không quá 366 ngày (INV-10); trạng thái đi cùng các cột của nó (mẫu seat_baseline_imports); notice_at được ghi trước khi ghi ngày nên còn ở PREVIEW trong lúc xác nhận.
ALTER TABLE "usage_imports"
    ADD CONSTRAINT "usage_imports_coverage_window" CHECK ("coverage_from" <= "coverage_to" AND "coverage_to" - "coverage_from" <= 366),
    ADD CONSTRAINT "usage_imports_preview_version" CHECK ("preview_version" > 0),
    ADD CONSTRAINT "usage_imports_state" CHECK (
        CASE "status"
            WHEN 'PREVIEW' THEN "result" IS NULL AND "confirm_key" IS NULL AND "confirmed_at" IS NULL AND "confirmed_by_app_user_id" IS NULL
                AND "cancelled_at" IS NULL
            WHEN 'COMPLETED' THEN "result" IS NOT NULL AND "confirm_key" IS NOT NULL AND "confirmed_at" IS NOT NULL
                AND "confirmed_by_app_user_id" IS NOT NULL AND "notice_at" IS NOT NULL AND "cancelled_at" IS NULL
            WHEN 'CANCELLED' THEN "cancelled_at" IS NOT NULL AND "result" IS NULL AND "confirm_key" IS NULL AND "confirmed_at" IS NULL
                AND "notice_at" IS NULL AND "notice_mode" IS NULL
        END
    );

-- Dòng thô chỉ cho xem trước: một dòng không đồng thời "đã khớp" mà thiếu người.
ALTER TABLE "usage_import_rows"
    ADD CONSTRAINT "usage_import_rows_line" CHECK ("line_number" > 0);

-- Ngày hoạt động chỉ ghi thêm; chỉ một cột đổi được, một lần: superseded_by_import_id từ NULL sang giá trị.
CREATE FUNCTION "usage_activity_days_guard"() RETURNS trigger AS $$
BEGIN
    IF OLD."superseded_by_import_id" IS NOT NULL
       OR (to_jsonb(NEW) - 'superseded_by_import_id') IS DISTINCT FROM (to_jsonb(OLD) - 'superseded_by_import_id') THEN
        RAISE EXCEPTION 'usage_activity_days only takes superseded_by_import_id once'
            USING ERRCODE = '55000', CONSTRAINT = 'usage_activity_days_guard';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "usage_activity_days_guard"
    BEFORE UPDATE ON "usage_activity_days"
    FOR EACH ROW EXECUTE FUNCTION "usage_activity_days_guard"();

-- Một định danh một nhân viên: chỉ một ánh xạ còn hiệu lực cho mỗi (ứng dụng, loại, định danh chuẩn hóa).
CREATE UNIQUE INDEX "usage_identity_mappings_in_force" ON "usage_identity_mappings"
    ("organization_id", "application_id", "identifier_type", "normalized_identifier") WHERE "ended_at" IS NULL;
ALTER TABLE "usage_identity_mappings"
    ADD CONSTRAINT "usage_identity_mappings_manual" CHECK ("method" <> 'MANUAL' OR "confirmed_by_app_user_id" IS NOT NULL),
    ADD CONSTRAINT "usage_identity_mappings_end" CHECK (
        ("ended_at" IS NULL) = ("ended_by_app_user_id" IS NULL) AND ("ended_at" IS NULL) = ("end_reason" IS NULL)
    );

-- Hàng đợi chưa khớp: một dòng chưa xử lý xong cho mỗi định danh; ứng viên tối đa 10.
CREATE UNIQUE INDEX "usage_unmatched_identities_open" ON "usage_unmatched_identities"
    ("organization_id", "application_id", "identifier_type", "normalized_identifier") WHERE "status" <> 'RESOLVED';
ALTER TABLE "usage_unmatched_identities"
    ADD CONSTRAINT "usage_unmatched_identities_candidates" CHECK (cardinality("candidate_employee_ids") <= 10),
    ADD CONSTRAINT "usage_unmatched_identities_resolved" CHECK ("status" <> 'RESOLVED' OR "resolved_mapping_id" IS NOT NULL);

-- Phát hiện sai lệch (FR-4.8): một phát hiện mở cho mỗi (ứng dụng, nhân viên).
CREATE UNIQUE INDEX "usage_no_assignment_findings_open" ON "usage_no_assignment_findings"
    ("organization_id", "application_id", "employee_id") WHERE "status" = 'OPEN';
ALTER TABLE "usage_no_assignment_findings"
    ADD CONSTRAINT "usage_no_assignment_findings_days" CHECK ("first_activity_date" <= "last_activity_date"),
    ADD CONSTRAINT "usage_no_assignment_findings_closed" CHECK (("status" = 'CLOSED') = ("closed_at" IS NOT NULL));
