-- Who does the technical work of a department when nobody is in charge of it (QĐ-118, redesign wave 2): the IT Admin the Super Admin names
-- to stand in for a department, and the IT Admin named for one piece of work of a person who was never placed in a department.
-- Expand only: two tables, nothing backfilled (no appointment exists yet).

-- CreateEnum
CREATE TYPE "DepartmentItSubstituteEndCause" AS ENUM ('REMOVED', 'IN_CHARGE_NAMED', 'DEPARTMENT_RETIRED');

-- CreateEnum
CREATE TYPE "UnplacedWorkKind" AS ENUM ('PROVISIONING_TASK', 'OFFBOARDING_CASE', 'DEVICE_RETURN_TASK', 'DEVICE');

-- CreateEnum
CREATE TYPE "UnplacedWorkDesignationEndCause" AS ENUM ('REMOVED', 'WORK_CLOSED');

-- CreateTable
CREATE TABLE "department_it_substitutes" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "department_id" UUID NOT NULL,
    "substitute_employee_id" UUID NOT NULL,
    "replaced_employee_id" UUID,
    "reason" TEXT NOT NULL,
    "appointed_at" TIMESTAMPTZ(3) NOT NULL,
    "appointed_by_app_user_id" UUID NOT NULL,
    "ended_at" TIMESTAMPTZ(3),
    "ended_by_app_user_id" UUID,
    "end_cause" "DepartmentItSubstituteEndCause",

    CONSTRAINT "department_it_substitutes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unplaced_work_it_designations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "work_kind" "UnplacedWorkKind" NOT NULL,
    "work_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "designee_employee_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "appointed_at" TIMESTAMPTZ(3) NOT NULL,
    "appointed_by_app_user_id" UUID NOT NULL,
    "ended_at" TIMESTAMPTZ(3),
    "ended_by_app_user_id" UUID,
    "end_cause" "UnplacedWorkDesignationEndCause",

    CONSTRAINT "unplaced_work_it_designations_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "department_it_substitutes" ADD CONSTRAINT "department_it_substitutes_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "department_it_substitutes" ADD CONSTRAINT "department_it_substitutes_substitute_employee_id_fkey" FOREIGN KEY ("substitute_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unplaced_work_it_designations" ADD CONSTRAINT "unplaced_work_it_designations_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unplaced_work_it_designations" ADD CONSTRAINT "unplaced_work_it_designations_designee_employee_id_fkey" FOREIGN KEY ("designee_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- What Prisma cannot say (ADR-0005).

-- department_it_substitutes: one appointment in force for a department; the three columns that end it come together, and only an
-- ended appointment has who ended it. The reason is told in 1 to 500 characters.
CREATE UNIQUE INDEX "department_it_substitutes_one_active" ON "department_it_substitutes" ("department_id") WHERE "ended_at" IS NULL;
CREATE INDEX "department_it_substitutes_substitute_active_idx" ON "department_it_substitutes" ("substitute_employee_id") WHERE "ended_at" IS NULL;
ALTER TABLE "department_it_substitutes" ADD CONSTRAINT "department_it_substitutes_end_complete"
  CHECK (("ended_at" IS NULL) = ("end_cause" IS NULL) AND ("ended_by_app_user_id" IS NULL OR "ended_at" IS NOT NULL));
ALTER TABLE "department_it_substitutes" ADD CONSTRAINT "department_it_substitutes_reason_length"
  CHECK (char_length("reason") <= 500 AND btrim("reason") <> '');

-- unplaced_work_it_designations: one designation in force for a piece of work; the same end rules and reason length.
CREATE UNIQUE INDEX "unplaced_work_it_designations_one_active" ON "unplaced_work_it_designations" ("work_kind", "work_id") WHERE "ended_at" IS NULL;
CREATE INDEX "unplaced_work_it_designations_designee_active_idx" ON "unplaced_work_it_designations" ("designee_employee_id") WHERE "ended_at" IS NULL;
ALTER TABLE "unplaced_work_it_designations" ADD CONSTRAINT "unplaced_work_it_designations_end_complete"
  CHECK (("ended_at" IS NULL) = ("end_cause" IS NULL) AND ("ended_by_app_user_id" IS NULL OR "ended_at" IS NOT NULL));
ALTER TABLE "unplaced_work_it_designations" ADD CONSTRAINT "unplaced_work_it_designations_reason_length"
  CHECK (char_length("reason") <= 500 AND btrim("reason") <> '');

-- An appointment is never deleted, keeps everything it said when it was made, and ends once (the three end columns are written once).
-- Whether the person named is an IT Admin who can work is not judged here (the role belongs to another module): the service judges it when
-- it appoints, and the resolver of who does the work passes over a person who can no longer work.
CREATE FUNCTION department_it_substitutes_guard() RETURNS trigger AS $$ BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'An appointment of an IT Admin for a department is never deleted'
     USING ERRCODE = '55000', CONSTRAINT = 'department_it_substitutes_kept'; END IF;
  IF (NEW.id, NEW.organization_id, NEW.department_id, NEW.substitute_employee_id, NEW.replaced_employee_id, NEW.reason,
      NEW.appointed_at, NEW.appointed_by_app_user_id)
     IS DISTINCT FROM
     (OLD.id, OLD.organization_id, OLD.department_id, OLD.substitute_employee_id, OLD.replaced_employee_id, OLD.reason,
      OLD.appointed_at, OLD.appointed_by_app_user_id)
  THEN RAISE EXCEPTION 'An appointment keeps what it said when it was made'
     USING ERRCODE = '55000', CONSTRAINT = 'department_it_substitutes_fixed'; END IF;
  IF OLD.ended_at IS NOT NULL
     AND (NEW.ended_at, NEW.ended_by_app_user_id, NEW.end_cause) IS DISTINCT FROM (OLD.ended_at, OLD.ended_by_app_user_id, OLD.end_cause)
  THEN RAISE EXCEPTION 'An appointment ends once'
     USING ERRCODE = '55000', CONSTRAINT = 'department_it_substitutes_ended_once'; END IF;
  RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER department_it_substitutes_guard BEFORE UPDATE OR DELETE ON "department_it_substitutes"
  FOR EACH ROW EXECUTE FUNCTION department_it_substitutes_guard();

-- The same for the designation of one piece of work. The work and the person are values (the work belongs to another module), judged by
-- the service when it designates.
CREATE FUNCTION unplaced_work_it_designations_guard() RETURNS trigger AS $$ BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'A designation of an IT Admin for a piece of work is never deleted'
     USING ERRCODE = '55000', CONSTRAINT = 'unplaced_work_it_designations_kept'; END IF;
  IF (NEW.id, NEW.organization_id, NEW.work_kind, NEW.work_id, NEW.employee_id, NEW.designee_employee_id, NEW.reason,
      NEW.appointed_at, NEW.appointed_by_app_user_id)
     IS DISTINCT FROM
     (OLD.id, OLD.organization_id, OLD.work_kind, OLD.work_id, OLD.employee_id, OLD.designee_employee_id, OLD.reason,
      OLD.appointed_at, OLD.appointed_by_app_user_id)
  THEN RAISE EXCEPTION 'A designation keeps what it said when it was made'
     USING ERRCODE = '55000', CONSTRAINT = 'unplaced_work_it_designations_fixed'; END IF;
  IF OLD.ended_at IS NOT NULL
     AND (NEW.ended_at, NEW.ended_by_app_user_id, NEW.end_cause) IS DISTINCT FROM (OLD.ended_at, OLD.ended_by_app_user_id, OLD.end_cause)
  THEN RAISE EXCEPTION 'A designation ends once'
     USING ERRCODE = '55000', CONSTRAINT = 'unplaced_work_it_designations_ended_once'; END IF;
  RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER unplaced_work_it_designations_guard BEFORE UPDATE OR DELETE ON "unplaced_work_it_designations"
  FOR EACH ROW EXECUTE FUNCTION unplaced_work_it_designations_guard();
