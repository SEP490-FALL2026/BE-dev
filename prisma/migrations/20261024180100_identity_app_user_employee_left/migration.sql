-- The day the person behind an account left (g6-offboarding-record, US-03-04 AC-3, AC-10): written once, by the record of a
-- departure, so the Super Admin can list the accounts of people who have left and lock them with a reason without the identity
-- context reading the people of another context. The account itself stays as it was until the Super Admin locks it.

-- AlterTable
ALTER TABLE "app_users" ADD COLUMN "employee_left_on" DATE;

-- The list of accounts of people who have left reads only these rows.
-- CreateIndex
CREATE INDEX "app_users_employee_left_on_idx" ON "app_users"("employee_left_on") WHERE "employee_left_on" IS NOT NULL;

-- The day is set once and never changes or goes away.
CREATE FUNCTION app_users_guard_employee_left_on() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."employee_left_on" IS NOT NULL AND NEW."employee_left_on" IS DISTINCT FROM OLD."employee_left_on" THEN
    RAISE EXCEPTION 'the day the employee left is written once'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "app_users_employee_left_on_once"
  BEFORE UPDATE OF "employee_left_on" ON "app_users"
  FOR EACH ROW EXECUTE FUNCTION app_users_guard_employee_left_on();
