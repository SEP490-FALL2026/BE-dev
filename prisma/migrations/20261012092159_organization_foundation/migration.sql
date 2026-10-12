-- CreateEnum
CREATE TYPE "CostCenterKind" AS ENUM ('UNIT', 'COMPANY');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('STAFF', 'CONTRACTOR', 'FREELANCER', 'INTERN');

-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('ACTIVE', 'TERMINATED');

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "time_zone" TEXT NOT NULL,
    "reporting_currency" TEXT NOT NULL,
    "bootstrap_completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_centers" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "CostCenterKind" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cost_centers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cost_center_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_titles" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_titles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "employee_code" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "work_email" TEXT,
    "normalized_work_email" TEXT,
    "employment_type" "EmploymentType" NOT NULL,
    "hire_date" DATE NOT NULL,
    "status" "EmployeeStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_placements" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "department_id" UUID NOT NULL,
    "job_title_id" UUID NOT NULL,
    "valid_from" DATE NOT NULL,
    "valid_to" DATE,

    CONSTRAINT "employee_placements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cost_centers_organization_id_code_key" ON "cost_centers"("organization_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "departments_cost_center_id_key" ON "departments"("cost_center_id");

-- CreateIndex
CREATE UNIQUE INDEX "departments_organization_id_code_key" ON "departments"("organization_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "job_titles_organization_id_normalized_name_key" ON "job_titles"("organization_id", "normalized_name");

-- CreateIndex
CREATE UNIQUE INDEX "employees_organization_id_employee_code_key" ON "employees"("organization_id", "employee_code");

-- CreateIndex
CREATE UNIQUE INDEX "employees_organization_id_normalized_work_email_key" ON "employees"("organization_id", "normalized_work_email");

-- CreateIndex
CREATE INDEX "employee_placements_department_id_idx" ON "employee_placements"("department_id");

-- CreateIndex
CREATE UNIQUE INDEX "employee_placements_employee_id_valid_from_key" ON "employee_placements"("employee_id", "valid_from");

-- AddForeignKey
ALTER TABLE "cost_centers" ADD CONSTRAINT "cost_centers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_cost_center_id_fkey" FOREIGN KEY ("cost_center_id") REFERENCES "cost_centers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_titles" ADD CONSTRAINT "job_titles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_placements" ADD CONSTRAINT "employee_placements_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_placements" ADD CONSTRAINT "employee_placements_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_placements" ADD CONSTRAINT "employee_placements_job_title_id_fkey" FOREIGN KEY ("job_title_id") REFERENCES "job_titles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ADR-01: one organization per installation. A unique index on a constant expression
-- admits exactly one row.
CREATE UNIQUE INDEX "organizations_singleton" ON "organizations" ((true));

-- QĐ-47d / I-8: the organization time zone is immutable after bootstrap.
CREATE FUNCTION organizations_reject_time_zone_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.time_zone IS DISTINCT FROM OLD.time_zone THEN
    RAISE EXCEPTION 'organizations.time_zone is immutable after installation'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "organizations_time_zone_immutable"
  BEFORE UPDATE ON "organizations"
  FOR EACH ROW EXECUTE FUNCTION organizations_reject_time_zone_change();

-- I-3: a department is charged to a UNIT cost center. departments.cost_center_id is
-- already unique (one department per cost center); this adds the kind check.
CREATE FUNCTION departments_require_unit_cost_center() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  center_kind "CostCenterKind";
BEGIN
  SELECT kind INTO center_kind FROM cost_centers WHERE id = NEW.cost_center_id;
  IF center_kind IS DISTINCT FROM 'UNIT' THEN
    RAISE EXCEPTION 'a department must be charged to a UNIT cost center'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "departments_unit_cost_center"
  BEFORE INSERT OR UPDATE OF cost_center_id ON "departments"
  FOR EACH ROW EXECUTE FUNCTION departments_require_unit_cost_center();

-- I-2 (INV-20): a placement is a non-empty half-open interval and the intervals of one
-- employee never overlap. Gaps are NOT caught here; see the coverage query in the specs.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "employee_placements"
  ADD CONSTRAINT "employee_placements_valid_range_check"
  CHECK ("valid_to" IS NULL OR "valid_to" > "valid_from");

ALTER TABLE "employee_placements"
  ADD CONSTRAINT "employee_placements_no_overlap"
  EXCLUDE USING gist (
    "employee_id" WITH =,
    daterange("valid_from", "valid_to", '[)') WITH &&
  );
