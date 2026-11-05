-- QĐ-95: stop before changing anything when existing accounts violate the new contract.
DO $$
DECLARE
  problems text;
BEGIN
  SELECT string_agg(v.line, E'\n' ORDER BY v.line) INTO problems FROM (
    SELECT CASE WHEN count(g.id) = 0 THEN 'NO_ROLE ' || e.employee_code
                ELSE 'MULTIPLE_ROLES ' || e.employee_code || ' ' || string_agg(g.role::text, ',' ORDER BY g.role::text)
           END AS line
      FROM app_users u
      JOIN employees e ON e.id = u.employee_id
      LEFT JOIN role_grants g ON g.app_user_id = u.id AND g.revoked_at IS NULL
     GROUP BY u.id, e.employee_code
    HAVING count(g.id) <> 1
  ) v;
  IF problems IS NOT NULL THEN
    RAISE EXCEPTION 'QĐ-95 one-role migration blocked; rebuild the database and seed again before retrying:%', E'\n' || problems
      USING ERRCODE = 'P0001';
  END IF;
END $$;

CREATE UNIQUE INDEX "role_grants_one_role_per_account" ON "role_grants" ("app_user_id") WHERE "revoked_at" IS NULL;
DROP INDEX "role_grants_one_effective_per_role";
DROP TRIGGER role_grants_forbid_combination ON "role_grants";
DROP FUNCTION role_grants_forbid_combination();
