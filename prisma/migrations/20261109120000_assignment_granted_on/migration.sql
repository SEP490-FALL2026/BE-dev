-- The day the task of a grant was completed (`BR-MF1-06a`, RV-04): the day the right really begins. `valid_from` is the day the seat was
-- recorded and stays as it is (the trigger `license_assignments_immutable` keeps it); the trigger compares a fixed list of columns, so this
-- one can be written once when the task completes. Nothing is granted to the runtime role here: it already has the table.
ALTER TABLE "license_assignments" ADD COLUMN "granted_on" date;
