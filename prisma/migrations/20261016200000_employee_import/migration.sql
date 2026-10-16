-- Slice G2 (US-02-01, US-02-02, US-02-03): the people file goes through upload, preview and confirmation. The file is
-- kept as rows with what the preview made of each; the business tables change only on confirmation, once.

-- CreateEnum
CREATE TYPE "EmployeeImportStatus" AS ENUM ('PREVIEW', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "employee_imports" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "uploaded_by" UUID NOT NULL,
    "file_name" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "status" "EmployeeImportStatus" NOT NULL DEFAULT 'PREVIEW',
    "preview_version" INTEGER NOT NULL DEFAULT 1,
    "ignored_columns" TEXT[],
    "summary" JSONB NOT NULL,
    "result" JSONB,
    "confirm_key" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "confirmed_at" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),

    CONSTRAINT "employee_imports_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "employee_imports_organization_id_content_hash_idx" ON "employee_imports"("organization_id", "content_hash");
CREATE INDEX "employee_imports_organization_id_created_at_idx" ON "employee_imports"("organization_id", "created_at" DESC);

-- An import is completed exactly when it has a result, a confirmation time and the key that confirmed it; it is
-- cancelled exactly when it has a cancellation time; never both. This is what makes "written once" checkable in SQL.
ALTER TABLE "employee_imports"
  ADD CONSTRAINT "employee_imports_state_consistent"
  CHECK (
    ("status" = 'PREVIEW'   AND "result" IS NULL     AND "confirmed_at" IS NULL     AND "cancelled_at" IS NULL AND "confirm_key" IS NULL) OR
    ("status" = 'COMPLETED' AND "result" IS NOT NULL AND "confirmed_at" IS NOT NULL AND "cancelled_at" IS NULL AND "confirm_key" IS NOT NULL) OR
    ("status" = 'CANCELLED' AND "result" IS NULL     AND "confirmed_at" IS NULL     AND "cancelled_at" IS NOT NULL AND "confirm_key" IS NULL)
  );

-- CreateTable
CREATE TABLE "employee_import_rows" (
    "import_id" UUID NOT NULL,
    "line_number" INTEGER NOT NULL,
    "cells" JSONB NOT NULL,
    "outcome" TEXT NOT NULL,
    "errors" JSONB NOT NULL,
    "differences" JSONB,

    CONSTRAINT "employee_import_rows_pkey" PRIMARY KEY ("import_id","line_number")
);

CREATE INDEX "employee_import_rows_import_id_outcome_idx" ON "employee_import_rows"("import_id", "outcome");

ALTER TABLE "employee_import_rows"
  ADD CONSTRAINT "employee_import_rows_import_id_fkey"
  FOREIGN KEY ("import_id") REFERENCES "employee_imports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "employee_import_rows"
  ADD CONSTRAINT "employee_import_rows_outcome_check"
  CHECK ("outcome" IN ('VALID', 'ERROR', 'EXISTS_SAME', 'EXISTS_DIFFERENT'));
