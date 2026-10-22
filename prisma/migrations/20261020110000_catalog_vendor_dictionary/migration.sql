-- The shared vendor dictionary (g3-vendor-dictionary, US-04-07, ADR-05). Groups and service lines are shared reference
-- data and carry no organization (US-04-07: "bảng dùng chung, không mang định danh tổ chức"); a proposal to add a
-- vendor comes from one organization's declaration and does.

-- CreateEnum
CREATE TYPE "VendorProposalStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DISMISSED');

-- CreateTable
CREATE TABLE "vendor_groups" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "brand_domains" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_groups_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "vendor_groups_brand_domains_size" CHECK (cardinality("brand_domains") <= 20)
);

-- CreateTable
CREATE TABLE "vendor_service_lines" (
    "id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "domains" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "patterns" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_service_lines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "vendor_service_lines_domains_size" CHECK (cardinality("domains") <= 20),
    CONSTRAINT "vendor_service_lines_patterns_size" CHECK (cardinality("patterns") <= 20)
);

-- CreateTable
CREATE TABLE "vendor_dictionary_proposals" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "proposed_name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "status" "VendorProposalStatus" NOT NULL DEFAULT 'PENDING',
    "resolved_line_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(3),

    CONSTRAINT "vendor_dictionary_proposals_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "vendor_dictionary_proposals_resolution_consistent" CHECK (
        ("status" = 'PENDING') = ("resolved_at" IS NULL)
        AND ("status" = 'ACCEPTED') = ("resolved_line_id" IS NOT NULL)
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "vendor_groups_normalized_name_key" ON "vendor_groups"("normalized_name");
CREATE UNIQUE INDEX "vendor_service_lines_group_id_normalized_name_key"
    ON "vendor_service_lines"("group_id", "normalized_name");
-- At most one open proposal for the same name in an organization.
CREATE UNIQUE INDEX "vendor_dictionary_proposals_open_name_key"
    ON "vendor_dictionary_proposals"("organization_id", "normalized_name") WHERE "status" = 'PENDING';
CREATE INDEX "vendor_dictionary_proposals_status_created_at_idx" ON "vendor_dictionary_proposals"("status", "created_at");

-- AddForeignKey
ALTER TABLE "vendor_service_lines" ADD CONSTRAINT "vendor_service_lines_group_id_fkey"
    FOREIGN KEY ("group_id") REFERENCES "vendor_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vendor_dictionary_proposals" ADD CONSTRAINT "vendor_dictionary_proposals_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vendor_dictionary_proposals" ADD CONSTRAINT "vendor_dictionary_proposals_resolved_line_id_fkey"
    FOREIGN KEY ("resolved_line_id") REFERENCES "vendor_service_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
