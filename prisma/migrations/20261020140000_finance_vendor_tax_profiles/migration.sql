-- The tax profile of a vendor (g3-vendor-tax-profile, US-12-09, QĐ-60b): Finance declares the group (T1 domestic, T2
-- foreign with the buyer remitting, T3 foreign with the tax collected on the document) and the estimated taxes. Every
-- declaration is a version that is never changed or deleted; the head row says which version is current. The system
-- only estimates: no column holds a tax payable, a filing or a payment. The vendor is a catalog table: a foreign key only.

-- CreateEnum
CREATE TYPE "TaxGroup" AS ENUM ('T1', 'T2', 'T3');

-- CreateTable
CREATE TABLE "vendor_tax_profiles" (
    "vendor_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "current_version" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_tax_profiles_pkey" PRIMARY KEY ("vendor_id"),
    CONSTRAINT "vendor_tax_profiles_current_version_range" CHECK ("current_version" >= 0)
);

CREATE TABLE "vendor_tax_profile_versions" (
    "id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "tax_group" "TaxGroup" NOT NULL,
    -- A value, not a foreign key: the history outlives the account (as the audit trail does).
    "declared_by_app_user_id" UUID NOT NULL,
    "declared_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_tax_profile_versions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "vendor_tax_profile_versions_version_positive" CHECK ("version" >= 1)
);

CREATE TABLE "vendor_tax_profile_lines" (
    "version_id" UUID NOT NULL,
    "position" SMALLINT NOT NULL,
    "tax_type" TEXT NOT NULL,
    "normalized_tax_type" TEXT NOT NULL,
    -- The estimated rate in hundredths of a percent: 1000 is 10%. Whole numbers, no float (ADR-0007).
    "rate_bp" INTEGER NOT NULL,
    "deductible" BOOLEAN NOT NULL,

    CONSTRAINT "vendor_tax_profile_lines_pkey" PRIMARY KEY ("version_id", "position"),
    CONSTRAINT "vendor_tax_profile_lines_position_range" CHECK ("position" BETWEEN 1 AND 20),
    CONSTRAINT "vendor_tax_profile_lines_rate_range" CHECK ("rate_bp" BETWEEN 0 AND 10000)
);

-- CreateIndex
CREATE UNIQUE INDEX "vendor_tax_profile_versions_vendor_id_version_key"
    ON "vendor_tax_profile_versions"("vendor_id", "version");
CREATE UNIQUE INDEX "vendor_tax_profile_lines_version_id_normalized_tax_type_key"
    ON "vendor_tax_profile_lines"("version_id", "normalized_tax_type");

-- AddForeignKey
ALTER TABLE "vendor_tax_profiles" ADD CONSTRAINT "vendor_tax_profiles_vendor_id_fkey"
    FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vendor_tax_profiles" ADD CONSTRAINT "vendor_tax_profiles_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vendor_tax_profile_versions" ADD CONSTRAINT "vendor_tax_profile_versions_vendor_id_fkey"
    FOREIGN KEY ("vendor_id") REFERENCES "vendor_tax_profiles"("vendor_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vendor_tax_profile_lines" ADD CONSTRAINT "vendor_tax_profile_lines_version_id_fkey"
    FOREIGN KEY ("version_id") REFERENCES "vendor_tax_profile_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A recorded version and its lines are history that invoices and snapshots will refer to: no writer changes or deletes
-- them (the head is the only row that moves).
CREATE FUNCTION "vendor_tax_profile_reject_change"() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'A recorded tax profile version is never changed or deleted'
        USING ERRCODE = '55000', CONSTRAINT = 'vendor_tax_profile_immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "vendor_tax_profile_versions_immutable"
    BEFORE UPDATE OR DELETE ON "vendor_tax_profile_versions"
    FOR EACH ROW EXECUTE FUNCTION "vendor_tax_profile_reject_change"();

CREATE TRIGGER "vendor_tax_profile_lines_immutable"
    BEFORE UPDATE OR DELETE ON "vendor_tax_profile_lines"
    FOR EACH ROW EXECUTE FUNCTION "vendor_tax_profile_reject_change"();
