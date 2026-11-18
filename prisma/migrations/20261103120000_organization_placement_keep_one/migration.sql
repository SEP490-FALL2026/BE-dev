-- INV-20: An employee must keep at least one placement.
CREATE OR REPLACE FUNCTION employee_placements_keep_one() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1 FROM "employees" WHERE "id" = OLD."employee_id" FOR UPDATE;

  IF NOT EXISTS (
    SELECT 1 FROM "employee_placements"
    WHERE "employee_id" = OLD."employee_id" AND "id" <> OLD."id"
  ) THEN
    RAISE EXCEPTION 'an employee must keep at least one placement'
      USING ERRCODE = 'restrict_violation', CONSTRAINT = 'employee_placements_keep_one';
  END IF;

  RETURN OLD;
END;
$$;

CREATE TRIGGER "employee_placements_keep_one"
  BEFORE DELETE ON "employee_placements"
  FOR EACH ROW EXECUTE FUNCTION employee_placements_keep_one();

