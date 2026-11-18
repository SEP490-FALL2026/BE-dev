-- Plans of an application and the workspace profile of a K2 plan (g3-plan-declaration, US-04-02, QĐ-77d). The kind of
-- plan (K1..K5), the pricing model and the control level are properties of the plan, not of the application.
-- K3 is in the enum so that opening it later changes no type; the application refuses it for now (OQ-B-03).

-- CreateEnum
CREATE TYPE "ProvisioningType" AS ENUM ('K1', 'K2', 'K3', 'K4', 'K5');
CREATE TYPE "PricingModel" AS ENUM ('PER_SEAT', 'FLAT_RATE', 'CONCURRENT', 'CONSUMPTION', 'PER_HOST');
CREATE TYPE "ControlLevel" AS ENUM ('FULL', 'PARTIAL', 'UNCONTROLLABLE');
CREATE TYPE "SharingPolicy" AS ENUM ('ALLOWED', 'NOT_ALLOWED');
CREATE TYPE "WorkspaceRole" AS ENUM ('OWNER', 'ADMIN');

-- CreateTable
CREATE TABLE "plans" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "provisioning_type" "ProvisioningType" NOT NULL,
    "pricing_model" "PricingModel",
    "control_level" "ControlLevel",
    "revocation_note" TEXT,
    "data_loss_on_removal" BOOLEAN NOT NULL DEFAULT false,
    "sharing_policy" "SharingPolicy",
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id"),
    -- K1, K2 and K4 are priced by a model; K3 (SSO/SCIM) and K5 (internal) have none (ADR-02).
    CONSTRAINT "plans_pricing_model_by_kind" CHECK (("provisioning_type" IN ('K3', 'K5')) = ("pricing_model" IS NULL)),
    CONSTRAINT "plans_control_level_required" CHECK ("provisioning_type" = 'K5' OR "control_level" IS NOT NULL),
    -- The "data is lost on removal" flag is explicit and stands only with the text that says what is lost (OQ-B-05).
    CONSTRAINT "plans_data_loss_needs_note" CHECK (NOT "data_loss_on_removal" OR "revocation_note" IS NOT NULL)
);

CREATE TABLE "plan_workspace_profiles" (
    "plan_id" UUID NOT NULL,
    "primary_owner_employee_id" UUID NOT NULL,
    "owner_limit" INTEGER,
    "admin_limit" INTEGER,
    "owner_transfer_procedure" TEXT,
    "emergency_identity" TEXT,
    "emergency_occupies_seat" BOOLEAN,
    "emergency_holder_employee_id" UUID,
    "emergency_last_reviewed_on" DATE,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plan_workspace_profiles_pkey" PRIMARY KEY ("plan_id"),
    CONSTRAINT "plan_workspace_profiles_limits_positive" CHECK (
        ("owner_limit" IS NULL OR "owner_limit" >= 1) AND ("admin_limit" IS NULL OR "admin_limit" >= 1)
    ),
    -- The emergency account is declared whole or not at all. There is no column for a password or any secret.
    CONSTRAINT "plan_workspace_profiles_emergency_whole" CHECK (
        ("emergency_identity" IS NULL) = ("emergency_occupies_seat" IS NULL)
        AND ("emergency_identity" IS NULL) = ("emergency_holder_employee_id" IS NULL)
        AND ("emergency_identity" IS NULL) = ("emergency_last_reviewed_on" IS NULL)
    )
);

CREATE TABLE "plan_workspace_admins" (
    "plan_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "role" "WorkspaceRole" NOT NULL,

    CONSTRAINT "plan_workspace_admins_pkey" PRIMARY KEY ("plan_id", "employee_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "plans_organization_id_application_id_normalized_name_key"
    ON "plans"("organization_id", "application_id", "normalized_name");
CREATE INDEX "plans_application_id_idx" ON "plans"("application_id");

-- AddForeignKey
ALTER TABLE "plans" ADD CONSTRAINT "plans_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "plans" ADD CONSTRAINT "plans_application_id_fkey"
    FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "plan_workspace_profiles" ADD CONSTRAINT "plan_workspace_profiles_plan_id_fkey"
    FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "plan_workspace_profiles" ADD CONSTRAINT "plan_workspace_profiles_primary_owner_employee_id_fkey"
    FOREIGN KEY ("primary_owner_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "plan_workspace_profiles" ADD CONSTRAINT "plan_workspace_profiles_emergency_holder_employee_id_fkey"
    FOREIGN KEY ("emergency_holder_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "plan_workspace_admins" ADD CONSTRAINT "plan_workspace_admins_plan_id_fkey"
    FOREIGN KEY ("plan_id") REFERENCES "plan_workspace_profiles"("plan_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "plan_workspace_admins" ADD CONSTRAINT "plan_workspace_admins_employee_id_fkey"
    FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Only an internal application has a K5 plan, and an internal application has nothing else (US-04-02 AC-8). An unknown
-- application is left to the foreign key.
CREATE FUNCTION "plans_kind_matches_application"() RETURNS trigger AS $$
DECLARE
    application_kind "ApplicationKind";
BEGIN
    SELECT a."kind" INTO application_kind FROM "applications" a WHERE a."id" = NEW."application_id";
    IF FOUND AND ((application_kind = 'INTERNAL') <> (NEW."provisioning_type" = 'K5')) THEN
        RAISE EXCEPTION 'A plan of kind % does not fit an application of kind %', NEW."provisioning_type", application_kind
            USING ERRCODE = '23514', CONSTRAINT = 'plans_kind_matches_application';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "plans_kind_matches_application"
    BEFORE INSERT OR UPDATE OF "application_id", "provisioning_type" ON "plans"
    FOR EACH ROW EXECUTE FUNCTION "plans_kind_matches_application"();

-- A workspace profile belongs to a K2 plan (K3 once it is opened).
CREATE FUNCTION "plan_workspace_profiles_for_workspace_kinds"() RETURNS trigger AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "plans" p WHERE p."id" = NEW."plan_id" AND p."provisioning_type" IN ('K2', 'K3')
    ) THEN
        RAISE EXCEPTION 'A workspace profile belongs to a K2 or K3 plan'
            USING ERRCODE = '23514', CONSTRAINT = 'plan_workspace_profiles_for_workspace_kinds';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "plan_workspace_profiles_for_workspace_kinds"
    BEFORE INSERT OR UPDATE OF "plan_id" ON "plan_workspace_profiles"
    FOR EACH ROW EXECUTE FUNCTION "plan_workspace_profiles_for_workspace_kinds"();

-- A plan that has a workspace profile stays of a kind that has one.
CREATE FUNCTION "plans_keep_workspace_kind"() RETURNS trigger AS $$
BEGIN
    IF NEW."provisioning_type" NOT IN ('K2', 'K3') AND EXISTS (
        SELECT 1 FROM "plan_workspace_profiles" w WHERE w."plan_id" = NEW."id"
    ) THEN
        RAISE EXCEPTION 'The plan still has a workspace profile'
            USING ERRCODE = '23514', CONSTRAINT = 'plans_keep_workspace_kind';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "plans_keep_workspace_kind"
    BEFORE UPDATE OF "provisioning_type" ON "plans"
    FOR EACH ROW EXECUTE FUNCTION "plans_keep_workspace_kind"();
