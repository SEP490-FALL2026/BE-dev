-- An account stays with the one person it was made for (US-01-09 AC-16, OD-2 of qd93-remove-in-app-super-admin-transfer):
-- no route or command changes the employee of an account, and this trigger is the database's own guard behind that.
-- Writing the same employee again, as a full-row update does, is not a change.
--
-- Rollback: DROP TRIGGER "app_users_employee_immutable" ON "app_users"; DROP FUNCTION "app_users_reject_employee_change"();

CREATE FUNCTION "app_users_reject_employee_change"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW."employee_id" IS DISTINCT FROM OLD."employee_id" THEN
        RAISE EXCEPTION 'The employee of an account is set when it is made and never changed'
            USING ERRCODE = '23514', CONSTRAINT = 'app_users_employee_is_final';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "app_users_employee_immutable"
    BEFORE UPDATE OF "employee_id" ON "app_users"
    FOR EACH ROW EXECUTE FUNCTION "app_users_reject_employee_change"();
