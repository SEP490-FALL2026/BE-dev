-- Slice G2 (US-03-06, US-01-11, US-01-02): the department profile, who heads a department, and the projects described
-- on a profile. A department is a flat unit under the company; it is retired, never deleted.

-- CreateEnum
CREATE TYPE "DepartmentStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "ProjectStatus" AS ENUM ('RUNNING', 'FINISHED');

-- AlterTable
ALTER TABLE "departments"
  ADD COLUMN "function_description" TEXT,
  ADD COLUMN "status" "DepartmentStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "it_admin_employee_id" UUID,
  ADD COLUMN "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "deactivated_at" TIMESTAMPTZ(3);

ALTER TABLE "departments"
  ADD CONSTRAINT "departments_deactivation_consistent"
  CHECK (("status" = 'INACTIVE') = ("deactivated_at" IS NOT NULL));

ALTER TABLE "departments"
  ADD CONSTRAINT "departments_it_admin_employee_id_fkey"
  FOREIGN KEY ("it_admin_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "departments_it_admin_employee_id_idx" ON "departments"("it_admin_employee_id");

-- A retired department takes no new member (US-03-06 AC-19). The check is on the placement, so every path that
-- places a person (manual entry, import, transfer) meets it, whatever the application does.
CREATE FUNCTION employee_placements_require_active_department() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  department_status "DepartmentStatus";
BEGIN
  SELECT status INTO department_status FROM departments WHERE id = NEW.department_id;
  IF department_status IS DISTINCT FROM 'ACTIVE' THEN
    RAISE EXCEPTION 'a retired department takes no new member'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "employee_placements_active_department"
  BEFORE INSERT ON "employee_placements"
  FOR EACH ROW EXECUTE FUNCTION employee_placements_require_active_department();

-- CreateTable
CREATE TABLE "department_head_periods" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "department_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "valid_from" DATE NOT NULL,
    "valid_to" DATE,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "department_head_periods_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "department_head_periods_department_id_idx" ON "department_head_periods"("department_id");
CREATE INDEX "department_head_periods_employee_id_idx" ON "department_head_periods"("employee_id");

ALTER TABLE "department_head_periods"
  ADD CONSTRAINT "department_head_periods_department_id_fkey"
  FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "department_head_periods"
  ADD CONSTRAINT "department_head_periods_employee_id_fkey"
  FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- INV-19: a non-empty half-open period; at any date a department has at most one head and a person heads at most
-- one department. A gap is allowed: a department may have nobody for a while (US-03-06 AC-9).
ALTER TABLE "department_head_periods"
  ADD CONSTRAINT "department_head_periods_valid_range_check"
  CHECK ("valid_to" IS NULL OR "valid_to" > "valid_from");

ALTER TABLE "department_head_periods"
  ADD CONSTRAINT "department_head_periods_one_head_per_department"
  EXCLUDE USING gist (
    "department_id" WITH =,
    daterange("valid_from", "valid_to", '[)') WITH &&
  );

ALTER TABLE "department_head_periods"
  ADD CONSTRAINT "department_head_periods_one_department_per_head"
  EXCLUDE USING gist (
    "employee_id" WITH =,
    daterange("valid_from", "valid_to", '[)') WITH &&
  );

-- QĐ-66a, INV-20: the head is a member of the department for the whole period. Checked when a period is written; the
-- transfer and termination slices (G6) must keep it true when they close or move a placement.
CREATE FUNCTION department_head_requires_membership() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM employee_placements p
     WHERE p.employee_id = NEW.employee_id
       AND p.department_id = NEW.department_id
       AND p.valid_from <= NEW.valid_from
       AND (p.valid_to IS NULL OR (NEW.valid_to IS NOT NULL AND p.valid_to >= NEW.valid_to))
  ) THEN
    RAISE EXCEPTION 'the head of a department must be a member of it for the whole period'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "department_head_periods_membership"
  BEFORE INSERT OR UPDATE OF "employee_id", "department_id", "valid_from", "valid_to" ON "department_head_periods"
  FOR EACH ROW EXECUTE FUNCTION department_head_requires_membership();

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "ProjectStatus" NOT NULL DEFAULT 'RUNNING',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "project_departments" (
    "project_id" UUID NOT NULL,
    "department_id" UUID NOT NULL,

    CONSTRAINT "project_departments_pkey" PRIMARY KEY ("project_id","department_id")
);

CREATE INDEX "project_departments_department_id_idx" ON "project_departments"("department_id");

ALTER TABLE "projects"
  ADD CONSTRAINT "projects_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "project_departments"
  ADD CONSTRAINT "project_departments_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_departments"
  ADD CONSTRAINT "project_departments_department_id_fkey"
  FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
