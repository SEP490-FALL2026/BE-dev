-- The seat baseline import (g4-seat-baseline-import, US-02-05): one upload of a seat file for one subscription or one
-- internal plan, read once into rows. Nothing in the licensing tables changes until the person confirms the preview,
-- and then it changes exactly once (the confirmation key makes a repeated request answer the same way).

-- CreateEnum
CREATE TYPE "SeatBaselineImportStatus" AS ENUM ('PREVIEW', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "seat_baseline_imports" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    -- A value, not a foreign key: the history outlives the account (as the audit trail does).
    "uploaded_by" UUID NOT NULL,
    "file_name" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "plan_id" UUID NOT NULL,
    "subscription_id" UUID,
    "status" "SeatBaselineImportStatus" NOT NULL DEFAULT 'PREVIEW',
    "preview_version" INTEGER NOT NULL DEFAULT 1,
    "ignored_columns" TEXT[],
    "summary" JSONB NOT NULL,
    "result" JSONB,
    "confirm_key" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "confirmed_at" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),

    CONSTRAINT "seat_baseline_imports_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "seat_baseline_imports_preview_version_positive" CHECK ("preview_version" >= 1),
    -- A written import says when and under which key; a thrown-away one says when; a preview says neither.
    CONSTRAINT "seat_baseline_imports_completed_has_evidence" CHECK (
        ("status" = 'COMPLETED') = ("confirmed_at" IS NOT NULL)
        AND ("status" = 'COMPLETED') = ("confirm_key" IS NOT NULL)
        AND ("status" = 'COMPLETED') = ("result" IS NOT NULL)
    ),
    CONSTRAINT "seat_baseline_imports_cancelled_has_time" CHECK (("status" = 'CANCELLED') = ("cancelled_at" IS NOT NULL))
);

CREATE TABLE "seat_baseline_import_rows" (
    "import_id" UUID NOT NULL,
    "line_number" INTEGER NOT NULL,
    "cells" JSONB NOT NULL,
    "outcome" TEXT NOT NULL,
    "errors" JSONB NOT NULL,

    CONSTRAINT "seat_baseline_import_rows_pkey" PRIMARY KEY ("import_id", "line_number"),
    CONSTRAINT "seat_baseline_import_rows_outcome_known" CHECK ("outcome" IN ('VALID', 'ERROR')),
    CONSTRAINT "seat_baseline_import_rows_line_positive" CHECK ("line_number" >= 2)
);

-- CreateIndex
CREATE INDEX "seat_baseline_imports_organization_id_created_at_idx"
    ON "seat_baseline_imports"("organization_id", "created_at" DESC);
CREATE INDEX "seat_baseline_import_rows_import_id_outcome_idx"
    ON "seat_baseline_import_rows"("import_id", "outcome");

-- AddForeignKey
ALTER TABLE "seat_baseline_imports" ADD CONSTRAINT "seat_baseline_imports_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "seat_baseline_imports" ADD CONSTRAINT "seat_baseline_imports_plan_id_fkey"
    FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "seat_baseline_imports" ADD CONSTRAINT "seat_baseline_imports_subscription_id_fkey"
    FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "seat_baseline_import_rows" ADD CONSTRAINT "seat_baseline_import_rows_import_id_fkey"
    FOREIGN KEY ("import_id") REFERENCES "seat_baseline_imports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
