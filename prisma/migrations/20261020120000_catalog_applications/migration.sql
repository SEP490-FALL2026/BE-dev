-- The application catalog (g3-catalog-entry, US-04-01, US-04-07 AC-6). A vendor and a functional group belong to the
-- organization; an application belongs to a vendor (none for an internal one), has one Business Owner, and may point at
-- one line of the shared vendor dictionary. Retirement columns arrive with g3-catalog-retire; `catalog_status` has the
-- value now so that slice only adds the columns and the CHECK.

-- CreateEnum
CREATE TYPE "ApplicationKind" AS ENUM ('SAAS', 'LICENSED', 'INTERNAL');
CREATE TYPE "DataSensitivity" AS ENUM ('LOW', 'MEDIUM', 'HIGH');
CREATE TYPE "FunctionalGroupStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "CatalogStatus" AS ENUM ('APPROVED', 'RETIRED');

-- CreateTable
CREATE TABLE "vendors" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "dictionary_group_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "functional_groups" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "status" "FunctionalGroupStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "functional_groups_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "applications" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "kind" "ApplicationKind" NOT NULL,
    "vendor_id" UUID,
    "name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "dictionary_line_id" UUID,
    "functional_group_id" UUID,
    "business_owner_employee_id" UUID NOT NULL,
    "data_sensitivity" "DataSensitivity" NOT NULL,
    "comm_person_to_person_messaging" BOOLEAN NOT NULL,
    "comm_calls_or_meetings" BOOLEAN NOT NULL,
    "comm_mailbox" BOOLEAN NOT NULL,
    "is_communication_service" BOOLEAN NOT NULL,
    "communication_note" TEXT,
    "domains" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "catalog_status" "CatalogStatus" NOT NULL DEFAULT 'APPROVED',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "applications_pkey" PRIMARY KEY ("id"),
    -- Only an internal application has no vendor (US-04-01 AC-10), and it never comes from the dictionary.
    CONSTRAINT "applications_kind_vendor" CHECK (("kind" = 'INTERNAL') = ("vendor_id" IS NULL)),
    CONSTRAINT "applications_internal_no_dictionary_line" CHECK ("kind" <> 'INTERNAL' OR "dictionary_line_id" IS NULL),
    -- The flag is the "yes" of any of the three questions (ADR-10).
    CONSTRAINT "applications_communication_flag" CHECK (
        "is_communication_service" = ("comm_person_to_person_messaging" OR "comm_calls_or_meetings" OR "comm_mailbox")
    ),
    CONSTRAINT "applications_domains_size" CHECK (cardinality("domains") <= 20)
);

-- AlterTable: a proposal raised by an application declaration (US-04-01 AC-5)
ALTER TABLE "vendor_dictionary_proposals"
    ADD COLUMN "proposed_domains" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    ADD COLUMN "source_application_id" UUID,
    ADD CONSTRAINT "vendor_dictionary_proposals_domains_size" CHECK (cardinality("proposed_domains") <= 20);

-- CreateIndex
CREATE UNIQUE INDEX "vendors_organization_id_normalized_name_key" ON "vendors"("organization_id", "normalized_name");
CREATE UNIQUE INDEX "vendors_organization_id_dictionary_group_id_key" ON "vendors"("organization_id", "dictionary_group_id");
CREATE UNIQUE INDEX "functional_groups_organization_id_normalized_name_key"
    ON "functional_groups"("organization_id", "normalized_name");
-- One dictionary line belongs to one application of the organization (US-04-07 AC-6).
CREATE UNIQUE INDEX "applications_organization_id_dictionary_line_id_key"
    ON "applications"("organization_id", "dictionary_line_id");
-- A name is unique within its vendor, and among the internal applications.
CREATE UNIQUE INDEX "applications_vendor_name_key"
    ON "applications"("vendor_id", "normalized_name") WHERE "vendor_id" IS NOT NULL;
CREATE UNIQUE INDEX "applications_internal_name_key"
    ON "applications"("organization_id", "normalized_name") WHERE "vendor_id" IS NULL;
CREATE INDEX "applications_functional_group_id_idx" ON "applications"("functional_group_id");
CREATE INDEX "vendor_dictionary_proposals_source_application_id_idx"
    ON "vendor_dictionary_proposals"("source_application_id");

-- AddForeignKey
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_dictionary_group_id_fkey"
    FOREIGN KEY ("dictionary_group_id") REFERENCES "vendor_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "functional_groups" ADD CONSTRAINT "functional_groups_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "applications" ADD CONSTRAINT "applications_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "applications" ADD CONSTRAINT "applications_vendor_id_fkey"
    FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "applications" ADD CONSTRAINT "applications_dictionary_line_id_fkey"
    FOREIGN KEY ("dictionary_line_id") REFERENCES "vendor_service_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "applications" ADD CONSTRAINT "applications_functional_group_id_fkey"
    FOREIGN KEY ("functional_group_id") REFERENCES "functional_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "applications" ADD CONSTRAINT "applications_business_owner_employee_id_fkey"
    FOREIGN KEY ("business_owner_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vendor_dictionary_proposals" ADD CONSTRAINT "vendor_dictionary_proposals_source_application_id_fkey"
    FOREIGN KEY ("source_application_id") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A dictionary line must belong to the dictionary group of the vendor of the application (LR-10): an application
-- that points at a line has the vendor of that line's group. Fires on every write that sets the line or the vendor.
CREATE FUNCTION "applications_require_line_in_vendor_group"() RETURNS trigger AS $$
BEGIN
    IF NEW."dictionary_line_id" IS NOT NULL AND NOT EXISTS (
        SELECT 1
          FROM "vendor_service_lines" l
          JOIN "vendors" v ON v."dictionary_group_id" = l."group_id"
         WHERE l."id" = NEW."dictionary_line_id" AND v."id" = NEW."vendor_id"
    ) THEN
        RAISE EXCEPTION 'The dictionary line is not in the dictionary group of the vendor of this application'
            USING ERRCODE = '23514', CONSTRAINT = 'applications_line_matches_vendor_group';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "applications_line_matches_vendor_group"
    BEFORE INSERT OR UPDATE OF "dictionary_line_id", "vendor_id" ON "applications"
    FOR EACH ROW EXECUTE FUNCTION "applications_require_line_in_vendor_group"();
