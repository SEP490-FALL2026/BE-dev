-- AlterTable
ALTER TABLE "offboarding_cases" ALTER COLUMN "department_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "offboarding_cases"
  ADD COLUMN "cancelled_placement_id" UUID,
  ADD COLUMN "cancelled_placement_department_id" UUID,
  ADD COLUMN "cancelled_placement_from" DATE;

-- CreateIndex
CREATE INDEX "offboarding_cases_cancelled_placement_department_id_idx" ON "offboarding_cases"("cancelled_placement_department_id");

-- AddForeignKey
ALTER TABLE "offboarding_cases" ADD CONSTRAINT "offboarding_cases_cancelled_placement_department_id_fkey"
  FOREIGN KEY ("cancelled_placement_department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddCheckConstraints
ALTER TABLE "offboarding_cases"
  ADD CONSTRAINT "offboarding_cases_unplaced_no_head"
  CHECK ("department_id" IS NOT NULL OR "head_handover" IS NULL);

ALTER TABLE "offboarding_cases"
  ADD CONSTRAINT "offboarding_cases_cancelled_placement"
  CHECK (
    (
      "cancelled_placement_id" IS NULL
      AND "cancelled_placement_department_id" IS NULL
      AND "cancelled_placement_from" IS NULL
    ) OR (
      "cancelled_placement_id" IS NOT NULL
      AND "cancelled_placement_department_id" IS NOT NULL
      AND "cancelled_placement_from" IS NOT NULL
      AND "department_id" IS NULL
    )
  );

-- Replace trigger function with Phase D exception
CREATE OR REPLACE FUNCTION employee_placements_keep_one() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_today date;
  v_is_future_cancelled boolean;
BEGIN
  PERFORM 1 FROM "employees" WHERE "id" = OLD."employee_id" FOR UPDATE;

  IF NOT EXISTS (
    SELECT 1 FROM "employee_placements"
    WHERE "employee_id" = OLD."employee_id" AND "id" <> OLD."id"
  ) THEN
    SELECT (now() AT TIME ZONE o."time_zone")::date INTO v_today
      FROM "organizations" o
      WHERE o."id" = OLD."organization_id";

    IF OLD."valid_from" > v_today THEN
      SELECT EXISTS (
        SELECT 1 FROM "offboarding_cases" c
        WHERE c."employee_id" = OLD."employee_id"
          AND c."cancelled_placement_id" = OLD."id"
          AND c."cancelled_at" IS NULL
      ) INTO v_is_future_cancelled;
      IF v_is_future_cancelled THEN
        RETURN OLD;
      END IF;
    END IF;

    RAISE EXCEPTION 'an employee must keep at least one placement'
      USING ERRCODE = 'restrict_violation', CONSTRAINT = 'employee_placements_keep_one';
  END IF;

  RETURN OLD;
END;
$$;

